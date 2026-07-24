import { notFound } from "next/navigation";
import { after } from "next/server";
import Link from "next/link";
import type { Metadata } from "next";
import { format } from "date-fns";
import { Building2, Telescope, Rocket, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RoleNature } from "@/db/schema";
import { requireCurrentUserId } from "@/lib/auth";
import { runSyllabusGeneration } from "@/lib/generation/run";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageContainer } from "@/components/page-container";
import { BlockersCard } from "./blockers-card";
import { SyllabusViews } from "./syllabus-views";
import { GeneratingView } from "./generating-view";
import { DeleteSyllabusButton } from "./delete-syllabus-button";
import { loadSyllabus, getReadinessForSyllabus } from "./queries";

// This page is the resume entry point: on load it kicks the generation worker
// via after(), which continues after the response within this invocation's
// budget. Give that background work the same 5-min ceiling as the other
// generation routes so it isn't cut off mid-run.
export const maxDuration = 300;

type PageProps = { params: Promise<{ id: string }> };

const ROLE_NATURE_BADGE: Record<
  RoleNature,
  { label: string; hint: string; className: string }
> = {
  technical: {
    label: "Technical role",
    hint: "Primarily building/engineering — the mix leans technical, with a professional section for communication and interview craft.",
    className: "bg-foreground/10 text-foreground border-foreground/20",
  },
  non_technical: {
    label: "Non-technical role",
    hint: "Primarily people/strategy/communication/operations — the mix leans professional and domain, with technical clusters only where the role needs them.",
    className: "bg-sky-500/10 text-sky-200 border-sky-500/30",
  },
  hybrid: {
    label: "Hybrid role",
    hint: "A substantial mix of both — the syllabus balances technical and professional clusters.",
    className: "bg-violet-500/10 text-violet-200 border-violet-500/30",
  },
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const userId = await requireCurrentUserId();
  const syllabus = await loadSyllabus(id, userId);
  if (!syllabus) return { title: "Syllabus not found — Provency" };
  return { title: `${syllabus.targetRole} — Provency` };
}

export default async function SyllabusPage({ params }: PageProps) {
  const { id } = await params;
  const userId = await requireCurrentUserId();
  const syllabus = await loadSyllabus(id, userId);
  if (!syllabus) notFound();

  // Resumable generation (P1.5): while the syllabus is still generating — or has
  // settled with failed units awaiting retry — show the progressive generation
  // view (polls, fills in per cluster, reserves space, offers per-unit retry)
  // instead of the interactive tree. The full tree renders only once every unit
  // has completed. This page load is also the durable resume entry point.
  const hasFailedUnit = syllabus.clusters.some(
    (c) =>
      c.artefactStatus === "failed" ||
      c.subSkills.some((s) => s.generationStatus === "failed"),
  );
  if (syllabus.status === "generating" || hasFailedUnit) {
    // Only a still-generating syllabus needs the worker (re)kicked; a settled
    // partial waits for an explicit retry.
    if (syllabus.status === "generating") {
      after(() => runSyllabusGeneration(syllabus.id));
    }
    return (
      <GeneratingView
        syllabusId={syllabus.id}
        targetRole={syllabus.targetRole}
        targetCompany={syllabus.targetCompany}
        clusters={syllabus.clusters.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          isArtefactBearing: c.isArtefactBearing,
          artefactStatus: c.artefactStatus,
          subSkills: [...c.subSkills]
            .sort((a, b) => a.orderIndex - b.orderIndex)
            .map((s) => ({
              id: s.id,
              name: s.name,
              generationStatus: s.generationStatus,
              conceptCount: s.concepts.length,
            })),
        }))}
      />
    );
  }

  const { metadata, clusters } = syllabus;

  const allConcepts = clusters.flatMap((c) =>
    c.subSkills.flatMap((s) => s.concepts),
  );
  const understoodCount = allConcepts.filter(
    (c) => c.status === "understood" || c.status === "verified",
  ).length;
  const hasBegun = allConcepts.some((c) => c.status !== "not_started");
  const totalHours = clusters.reduce(
    (sum, c) =>
      sum + c.subSkills.reduce((s, sk) => s + sk.estimatedHours, 0),
    0,
  );

  const treeData = clusters.map((cluster) => ({
    id: cluster.id,
    name: cluster.name,
    description: cluster.description,
    type: cluster.type,
    weight: cluster.weight,
    isArtefactBearing: cluster.isArtefactBearing,
    suggestedArtefact: cluster.suggestedArtefact,
    artefactTarget: cluster.artefactTarget
      ? { employerValue: cluster.artefactTarget.employerValue }
      : null,
    subSkills: cluster.subSkills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      estimatedHours: skill.estimatedHours,
      concepts: skill.concepts.map((concept) => ({
        id: concept.id,
        name: concept.name,
        status: concept.status,
        resourceCount: concept.resources.length,
      })),
    })),
    artefacts: cluster.subSkills.flatMap((skill) =>
      skill.artefacts.map((a) => ({
        id: a.id,
        type: a.type,
        title: a.title,
        url: a.url,
        description: a.description,
        reflection: a.reflection,
        verified: a.verifiedAt !== null,
        subSkillId: skill.id,
        subSkillName: skill.name,
      })),
    ),
  }));

  // TEMPORARY: raw readiness ledger dump for ground-truth verification. Remove
  // once the ledger UI is built. Shown in dev, or set READINESS_DEBUG=1 to view
  // in any environment (owner-scoped page, so only the owner ever sees it).
  const showReadinessDebug =
    process.env.NODE_ENV !== "production" ||
    process.env.READINESS_DEBUG === "1";
  const readinessLedger = showReadinessDebug
    ? await getReadinessForSyllabus(syllabus.id, userId)
    : null;

  return (
    <PageContainer width="wide" className="flex flex-col gap-8">
      {showReadinessDebug ? (
        <pre className="overflow-x-auto rounded border border-border bg-black/40 p-3 text-xs text-foreground">
          {JSON.stringify(readinessLedger, null, 2)}
        </pre>
      ) : null}
      <header className="flex flex-col gap-3">
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <Link href="/syllabi" className="hover:text-foreground">
            ← All syllabi
          </Link>
          <span>·</span>
          <Link href="/syllabi/new" className="hover:text-foreground">
            New syllabus
          </Link>
          <span>·</span>
          <span>
            Generated {format(syllabus.createdAt, "d MMM yyyy, HH:mm")}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">
            {syllabus.targetRole}
            {syllabus.targetCompany ? (
              <span className="text-muted-foreground font-normal">
                {" "}
                · {syllabus.targetCompany}
              </span>
            ) : null}
          </h1>
          <Badge
            variant="outline"
            title={ROLE_NATURE_BADGE[syllabus.roleNature].hint}
            className={ROLE_NATURE_BADGE[syllabus.roleNature].className}
          >
            {ROLE_NATURE_BADGE[syllabus.roleNature].label}
          </Badge>
        </div>
        <p className="text-muted-foreground text-sm">
          {clusters.length} clusters ·{" "}
          {clusters.reduce((s, c) => s + c.subSkills.length, 0)} sub-skills ·{" "}
          {allConcepts.length} concepts ({understoodCount} understood) · ~
          {totalHours}h estimated
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/syllabi/${syllabus.id}/gap`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Telescope className="size-4" />
            View gap analysis
          </Link>
          {syllabus.targetCompany ? (
            <Link
              href={`/syllabi/${syllabus.id}/company`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Building2 className="size-4" />
              Company insight
            </Link>
          ) : null}
        </div>
      </header>

      <StartHereBanner syllabusId={syllabus.id} hasBegun={hasBegun} />

      <BlockersCard
        blockers={metadata.structuralBlockers}
        branches={metadata.alternativeTargetBranches}
      />

      <SyllabusViews
        syllabusId={syllabus.id}
        clusters={treeData}
        targetRole={syllabus.targetRole}
        targetCompany={syllabus.targetCompany}
      />

      <footer className="border-border/60 mt-8 flex items-center justify-end border-t pt-6">
        <DeleteSyllabusButton
          syllabusId={syllabus.id}
          targetRole={syllabus.targetRole}
        />
      </footer>
    </PageContainer>
  );
}

function StartHereBanner({
  syllabusId,
  hasBegun,
}: {
  syllabusId: string;
  hasBegun: boolean;
}) {
  return (
    <Link
      href={`/syllabi/${syllabusId}/start`}
      className={cn(
        "group flex items-center gap-4 rounded-lg border px-4 py-3 transition-colors",
        hasBegun
          ? "border-border/60 bg-card hover:border-primary/40 hover:bg-primary/[0.03]"
          : "border-primary/40 bg-primary/[0.06] hover:bg-primary/[0.1]",
      )}
    >
      <div
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full",
          hasBegun ? "bg-muted text-muted-foreground" : "bg-primary/15 text-primary",
        )}
      >
        <Rocket className="size-5" />
      </div>
      <div className="flex flex-1 flex-col">
        <span className="font-medium">
          {hasBegun ? "Revisit your launching point" : "New here? Start with the on-ramp"}
        </span>
        <span className="text-muted-foreground text-sm">
          {hasBegun
            ? "Baselines this syllabus assumes, and the ordered first steps."
            : "See what this syllabus assumes you know, and exactly where to begin — no guessing."}
        </span>
      </div>
      <span
        className={cn(
          "flex shrink-0 items-center gap-1 text-sm font-medium",
          hasBegun ? "text-muted-foreground group-hover:text-foreground" : "text-primary",
        )}
      >
        Start here
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
