import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import {
  Award,
  GitPullRequest,
  Hammer,
  ScrollText,
  type LucideIcon,
} from "lucide-react";
import { db } from "@/db";
import { Badge } from "@/components/ui/badge";
import { CommitArtefactButton } from "./commit-artefact-button";

type PageProps = { params: Promise<{ id: string }> };

type ArtefactType = "project" | "writeup" | "certificate" | "contribution";

const TYPE_META: Record<ArtefactType, { label: string; icon: LucideIcon }> = {
  project: { label: "Project", icon: Hammer },
  writeup: { label: "Writeup", icon: ScrollText },
  certificate: { label: "Certificate", icon: Award },
  contribution: { label: "Contribution", icon: GitPullRequest },
};

async function loadCluster(id: string) {
  return db.query.skillClusters.findFirst({
    where: (c, { eq }) => eq(c.id, id),
    with: {
      syllabus: true,
      subSkills: true,
    },
  });
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const cluster = await loadCluster(id);
  if (!cluster?.suggestedArtefact) {
    return { title: "Project not found — Yakka" };
  }
  return { title: `${cluster.suggestedArtefact.title} — Yakka` };
}

export default async function ClusterArtefactPage({ params }: PageProps) {
  const { id } = await params;
  const cluster = await loadCluster(id);
  if (!cluster || !cluster.suggestedArtefact) notFound();

  const suggested = cluster.suggestedArtefact;
  const criteria = suggested.acceptanceCriteria ?? [];
  const meta = TYPE_META[suggested.type as ArtefactType];
  const Icon = meta.icon;
  const defaultSubSkillId = cluster.subSkills[0]?.id;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
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
        <span className="text-foreground">Suggested project</span>
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
        </div>
        <h1 className="text-3xl font-semibold leading-tight tracking-tight">
          {suggested.title}
        </h1>
        <p className="text-foreground/85 text-sm leading-relaxed">
          {suggested.description}
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
          Acceptance criteria
        </h2>
        {criteria.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No criteria suggested. You'll be able to add your own after
            committing.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {criteria.map((text, i) => (
              <li
                key={i}
                className="border-border/60 bg-card/40 flex items-start gap-3 rounded-md border px-4 py-2.5"
              >
                <span className="text-muted-foreground mt-0.5 size-4 shrink-0 rounded border border-current text-[10px] leading-none">
                  <span className="sr-only">unchecked</span>
                </span>
                <span className="text-sm leading-relaxed">{text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

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
    </main>
  );
}
