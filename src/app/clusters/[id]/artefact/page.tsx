import { notFound } from "next/navigation";
import { connection } from "next/server";
import Link from "next/link";
import type { Metadata } from "next";
import {
  Award,
  BookOpen,
  ExternalLink,
  GitPullRequest,
  Hammer,
  Rocket,
  ScrollText,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { db } from "@/db";
import { requireCurrentUserId } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { PageContainer } from "@/components/page-container";
import { CommitArtefactButton } from "./commit-artefact-button";
import { GenerateProjectButton } from "../generate-project-button";

type PageProps = { params: Promise<{ id: string }> };

type ArtefactType = "project" | "writeup" | "certificate" | "contribution";

const TYPE_META: Record<ArtefactType, { label: string; icon: LucideIcon }> = {
  project: { label: "Project", icon: Hammer },
  writeup: { label: "Writeup", icon: ScrollText },
  certificate: { label: "Certificate", icon: Award },
  contribution: { label: "Contribution", icon: GitPullRequest },
};

async function loadCluster(id: string, userId: string) {
  await connection();

  const cluster = await db.query.skillClusters.findFirst({
    where: (c, { eq }) => eq(c.id, id),
    with: {
      syllabus: true,
      subSkills: {
        with: {
          concepts: {
            columns: { id: true, name: true },
            with: {
              resources: {
                columns: { id: true, title: true, url: true, type: true, author: true },
              },
            },
          },
        },
      },
    },
  });

  return cluster?.syllabus.userId === userId ? cluster : null;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const userId = await requireCurrentUserId();
  const cluster = await loadCluster(id, userId);
  if (!cluster?.suggestedArtefact) {
    return { title: "Project not found — Provency" };
  }
  return { title: `${cluster.suggestedArtefact.title} — Provency` };
}

export default async function ClusterArtefactPage({ params }: PageProps) {
  const { id } = await params;
  const userId = await requireCurrentUserId();
  const cluster = await loadCluster(id, userId);
  if (!cluster || !cluster.suggestedArtefact) notFound();

  const suggested = cluster.suggestedArtefact;
  const criteria = suggested.acceptanceCriteria ?? [];
  const meta = TYPE_META[suggested.type as ArtefactType];
  const Icon = meta.icon;
  const defaultSubSkillId = cluster.subSkills[0]?.id;

  const approach = cluster.suggestedApproach ?? [];
  const hasGuide = approach.length > 0 || Boolean(cluster.startingPoint);

  // Definition-of-done per acceptance criterion. Match by exact text first;
  // fall back to positional alignment when the model kept them in order.
  const guidance = cluster.criteriaGuidance ?? [];
  const guidanceByText = new Map(
    guidance.map((g) => [g.criterion.trim().toLowerCase(), g.definitionOfDone]),
  );
  const dodFor = (criterion: string, i: number): string | null =>
    guidanceByText.get(criterion.trim().toLowerCase()) ??
    (guidance.length === criteria.length ? guidance[i]?.definitionOfDone : null) ??
    null;

  // Concepts this project develops, and the syllabus resources already attached
  // to them — surfaced so the user doesn't re-hunt for learning material.
  const demoIds = new Set(cluster.artefactTarget?.demonstratesConceptIds ?? []);
  const allConcepts = cluster.subSkills.flatMap((s) => s.concepts);
  const conceptNameById = new Map(allConcepts.map((c) => [c.id, c.name]));
  const demonstratesNames = [...demoIds]
    .map((cid) => conceptNameById.get(cid))
    .filter((n): n is string => Boolean(n));

  const seenResource = new Set<string>();
  const syllabusResources = allConcepts
    .filter((c) => demoIds.has(c.id))
    .flatMap((c) =>
      c.resources.map((r) => ({ ...r, conceptName: c.name })),
    )
    .filter((r) => {
      if (seenResource.has(r.id)) return false;
      seenResource.add(r.id);
      return true;
    });

  const projectResources = cluster.projectResources ?? [];

  return (
    <PageContainer width="content" className="flex flex-col gap-8">
      <nav className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
        <Link
          href={`/syllabi/${cluster.syllabus.id}`}
          className="hover:text-foreground underline-offset-4 hover:underline"
        >
          {cluster.syllabus.targetRole}
        </Link>
        <span>/</span>
        <span className="hover:text-foreground">{cluster.name}</span>
        <span>/</span>
        <span className="text-foreground">Project</span>
      </nav>

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1.5 text-xs">
            <Icon className="size-3" />
            {meta.label}
          </Badge>
          <Badge
            variant="outline"
            className="text-muted-foreground border-foreground/20 text-[10px] uppercase"
          >
            AI-suggested
          </Badge>
          {hasGuide ? (
            <GenerateProjectButton
              clusterId={cluster.id}
              variant="outline"
              label="Regenerate"
            />
          ) : null}
        </div>
        <h1 className="text-3xl font-semibold leading-tight tracking-tight">
          {suggested.title}
        </h1>
        <p className="text-foreground/85 text-sm leading-relaxed">
          {suggested.description}
        </p>
      </header>

      {cluster.artefactTarget?.employerValue ? (
        <section className="border-primary/20 bg-primary/5 flex flex-col gap-1.5 rounded-lg border p-4">
          <h2 className="text-primary/80 text-xs font-medium uppercase tracking-wider">
            Why this matters to an employer
          </h2>
          <p className="text-foreground/90 text-sm leading-relaxed">
            {cluster.artefactTarget.employerValue}
          </p>
        </section>
      ) : null}

      {/* No guide yet → invite the user to generate the step-by-step build flow. */}
      {!hasGuide ? (
        <section className="border-border/60 bg-card/40 flex flex-col items-start gap-3 rounded-lg border border-dashed p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="text-primary size-4" />
            <h2 className="text-sm font-medium">Get a step-by-step build guide</h2>
          </div>
          <p className="text-muted-foreground text-sm">
            Generate a starting point, an ordered approach, a definition of done
            for each criterion, and resources pulled from your syllabus — tailored
            to {cluster.syllabus.targetRole}
            {cluster.syllabus.targetCompany
              ? ` at ${cluster.syllabus.targetCompany}`
              : ""}.
          </p>
          <GenerateProjectButton clusterId={cluster.id} />
        </section>
      ) : null}

      {/* 2. Start here */}
      {cluster.startingPoint ? (
        <section className="flex flex-col gap-2">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <Rocket className="text-primary size-4" />
            Start here
          </h2>
          <div className="border-primary/30 bg-primary/5 rounded-lg border p-4">
            <p className="text-foreground/90 text-sm leading-relaxed">
              {cluster.startingPoint}
            </p>
          </div>
        </section>
      ) : null}

      {/* 3. Suggested approach */}
      {approach.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
            Suggested approach
          </h2>
          <ol className="flex flex-col gap-3">
            {approach.map((m, i) => (
              <li key={i} className="flex gap-3">
                <span className="bg-background/60 ring-border/60 text-muted-foreground mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-1 tabular-nums">
                  {i + 1}
                </span>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{m.step}</span>
                  <span className="text-muted-foreground text-sm leading-relaxed">
                    {m.detail}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {/* 4. Acceptance criteria (+ definition of done, expandable) */}
      <section className="flex flex-col gap-3">
        <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
          Acceptance criteria
        </h2>
        {criteria.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No criteria suggested. You&apos;ll be able to add your own after
            committing.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {criteria.map((text, i) => {
              const dod = dodFor(text, i);
              return (
                <li
                  key={i}
                  className="border-border/60 bg-card/40 rounded-md border px-4 py-2.5"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-muted-foreground mt-0.5 size-4 shrink-0 rounded border border-current text-[10px] leading-none">
                      <span className="sr-only">unchecked</span>
                    </span>
                    <span className="text-sm leading-relaxed">{text}</span>
                  </div>
                  {dod ? (
                    <details className="group mt-1.5 ml-7">
                      <summary className="text-muted-foreground hover:text-foreground cursor-pointer list-none text-xs">
                        <span className="underline-offset-4 group-open:hidden">
                          What good looks like →
                        </span>
                        <span className="hidden underline-offset-4 group-open:inline">
                          Definition of done ↓
                        </span>
                      </summary>
                      <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                        {dod}
                      </p>
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 5. Resources */}
      {syllabusResources.length > 0 || projectResources.length > 0 ? (
        <section className="flex flex-col gap-5">
          <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
            Resources
          </h2>

          {syllabusResources.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h3 className="flex items-center gap-2 text-sm font-medium">
                <BookOpen className="text-muted-foreground size-4" />
                From your syllabus
              </h3>
              <p className="text-muted-foreground text-xs">
                Already attached to the concepts this project develops.
              </p>
              <ul className="mt-1 flex flex-col gap-1.5">
                {syllabusResources.map((r) => (
                  <li
                    key={r.id}
                    className="border-border/60 bg-card/40 flex items-start justify-between gap-3 rounded-md border px-3 py-2"
                  >
                    <div className="flex min-w-0 flex-col">
                      {r.url ? (
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
                        >
                          {r.title}
                          <ExternalLink className="size-3 shrink-0" />
                        </a>
                      ) : (
                        <span className="text-sm font-medium">{r.title}</span>
                      )}
                      <span className="text-muted-foreground text-xs">
                        {r.author ? `${r.author} · ` : ""}
                        {r.conceptName}
                      </span>
                    </div>
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      {r.type}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {projectResources.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h3 className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="text-muted-foreground size-4" />
                For this project
              </h3>
              <ul className="mt-1 flex flex-col gap-1.5">
                {projectResources.map((r, i) => (
                  <li
                    key={i}
                    className="border-border/60 bg-card/40 flex flex-col gap-0.5 rounded-md border px-3 py-2"
                  >
                    {r.url ? (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
                      >
                        {r.title}
                        <ExternalLink className="size-3 shrink-0" />
                      </a>
                    ) : (
                      <span className="text-sm font-medium">{r.title}</span>
                    )}
                    <span className="text-muted-foreground text-xs leading-relaxed">
                      {r.why}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* 6. Commit (unchanged flow) */}
      <section className="border-border/60 flex flex-col gap-3 border-t pt-6">
        <p className="text-muted-foreground text-sm">
          Commit to building this project. A trackable artefact will be created
          where you can mark criteria done, log progress, attach evidence, and
          link the concepts it demonstrates.
        </p>
        {defaultSubSkillId ? (
          <CommitArtefactButton
            clusterId={cluster.id}
            subSkillId={defaultSubSkillId}
          />
        ) : (
          <p className="text-destructive text-sm">
            Cluster has no sub-skills to attach the artefact to.
          </p>
        )}
      </section>

      {/* 7. Concepts this demonstrates */}
      {demonstratesNames.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
            Concepts this demonstrates
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {demonstratesNames.map((name) => (
              <span
                key={name}
                className="border-border/60 bg-background/40 rounded-full border px-2.5 py-0.5 text-xs"
              >
                {name}
              </span>
            ))}
          </div>
        </section>
      ) : null}
    </PageContainer>
  );
}
