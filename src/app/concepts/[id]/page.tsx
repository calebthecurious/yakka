import { notFound } from "next/navigation";
import { connection } from "next/server";
import Link from "next/link";
import type { Metadata } from "next";
import { format, formatDistanceToNow } from "date-fns";
import {
  Check,
  BookOpen as LearningIcon,
  CircleDashed,
  ShieldCheck,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { db } from "@/db";
import { requireCurrentUserId } from "@/lib/auth";
import {
  findNextUnverifiedConcept,
  selectConceptCta,
  unbackedBearingClusterIds,
  type ConceptCta,
} from "@/lib/readiness/concept-cta";
import { tierOf, type ConstellationTier } from "@/lib/readiness/constellation";
import { CHECK_INTRO, formatTierLabel } from "@/lib/readiness/surface-words";
import { loadSyllabus, readinessForLoadedSyllabus } from "../../syllabi/[id]/queries";
import { ConceptCtaCard } from "./concept-cta";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { StatusControls } from "./status-controls";
import { AlternativeResources } from "./alternative-resources";
import { AddResourceForm } from "./add-resource-form";
import { ResourceCard } from "./resource-card";
import { NotesEditor } from "./notes-editor";
import { CompetencyCheck } from "./competency-check";
import { ConceptExpansionSection } from "./concept-expansion";
import { ConceptRelevanceSection } from "./concept-relevance";
import { PageContainer } from "@/components/page-container";

export const maxDuration = 300;

type PageProps = { params: Promise<{ id: string }> };

type ConceptStatus = "not_started" | "learning" | "understood" | "verified";

/**
 * The header badge renders the concept's LEDGER tier (H-1 item 2), never raw
 * `concepts.status`. Words come from formatTierLabel; only the icon and colour
 * live here. Verified is the accent; everything else is quiet.
 */
const TIER_BADGE: Record<ConstellationTier, { icon: LucideIcon; className: string }> = {
  not_started: {
    icon: CircleDashed,
    className: "bg-muted text-muted-foreground border-border",
  },
  in_progress: {
    icon: LearningIcon,
    className: "bg-amber-500/10 text-amber-200 border-amber-500/30",
  },
  self_assessed: {
    icon: Check,
    className: "border-dashed border-border text-muted-foreground",
  },
  check_passed: {
    icon: ShieldCheck,
    className: "bg-(--lp-accent)/10 text-(--lp-accent) border-(--lp-accent)/40",
  },
  artefact_verified: {
    icon: ShieldCheck,
    className: "bg-(--lp-accent)/10 text-(--lp-accent) border-(--lp-accent)/40",
  },
};

/**
 * A session younger than this is still "the current session" and the notes
 * editor reopens it (mirrors SESSION_COALESCE_WINDOW_MINUTES in actions.ts).
 * Reads the clock outside render so the server component stays pure.
 */
const SESSION_COALESCE_WINDOW_MS = 30 * 60 * 1000;
function isWithinCoalesceWindow(createdAt: Date): boolean {
  return Date.now() - new Date(createdAt).getTime() < SESSION_COALESCE_WINDOW_MS;
}

async function loadConcept(id: string, userId: string) {
  await connection();

  return db.query.concepts.findFirst({
    where: (c, { eq }) => eq(c.id, id),
    with: {
      subSkill: {
        with: {
          cluster: {
            with: {
              syllabus: true,
              subSkills: {
                with: {
                  concepts: { columns: { id: true, name: true } },
                  // Just presence: is any artefact logged anywhere in this cluster?
                  artefacts: { columns: { id: true } },
                },
              },
            },
          },
        },
      },
      resources: {
        orderBy: (r, { asc }) => [asc(r.priority), asc(r.title)],
      },
      learningSessions: {
        orderBy: (s, { desc }) => [desc(s.createdAt)],
      },
      studyBriefs: true,
      competencyChecks: {
        where: (cc, { isNotNull }) => isNotNull(cc.completedAt),
        orderBy: (cc, { desc }) => [desc(cc.completedAt)],
        limit: 1,
      },
      conceptExpansion: true,
      conceptRelevance: true,
    },
  }).then((concept) =>
    concept?.subSkill.cluster.syllabus.userId === userId ? concept : null,
  );
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const userId = await requireCurrentUserId();
  const concept = await loadConcept(id, userId);
  if (!concept) return { title: "Concept not found — Provency" };
  return { title: `${concept.name} — Provency` };
}

export default async function ConceptPage({ params }: PageProps) {
  const { id } = await params;
  const userId = await requireCurrentUserId();
  const concept = await loadConcept(id, userId);
  if (!concept) notFound();

  const { subSkill, resources, learningSessions, studyBriefs, competencyChecks } =
    concept;
  const cluster = subSkill.cluster;
  const syllabus = cluster.syllabus;
  const lastCheck = competencyChecks[0] ?? null;
  const expansion = concept.conceptExpansion ?? null;
  const relevance = concept.conceptRelevance ?? null;
  const siblingMeta = cluster.subSkills
    .flatMap((s) => s.concepts)
    .filter((c) => c.id !== concept.id)
    .map((c) => ({ id: c.id, name: c.name }));

  const briefByResourceId = new Map(
    studyBriefs.map((b) => [
      b.resourceId,
      {
        keyPoints: b.keyPoints,
        application: b.application,
        locations: b.locations,
        checkQuestions: b.checkQuestions,
        aiConfidence: b.aiConfidence,
      },
    ]),
  );

  const aiSuggested = resources.filter((r) => !r.addedByUser);
  const userAdded = resources.filter((r) => r.addedByUser);
  const primary =
    aiSuggested.find((r) => r.priority === 1) ?? aiSuggested[0] ?? null;
  const alternatives = primary
    ? aiSuggested.filter((r) => r.id !== primary.id)
    : aiSuggested;

  const currentSession = learningSessions[0];
  const recentSession =
    currentSession && isWithinCoalesceWindow(currentSession.createdAt)
      ? currentSession
      : null;
  const initialSessionId = recentSession?.id ?? null;
  const initialNotes = recentSession?.notesMarkdown ?? "";
  const initialDurationMinutes = recentSession?.durationMinutes ?? 0;

  const pastSessions = recentSession
    ? learningSessions.filter((s) => s.id !== recentSession.id)
    : learningSessions;

  // ── "Start here": the single next step, selected from the LEDGER. ──
  // Raw `concepts.status` is deliberately not consulted: self-declaration moves
  // no ledger number, so it does not decide what to do next either. The one
  // non-ledger input is whether the recommended resource is finished — a per-row
  // fact about one resource, read here and passed in.
  const ledgerTree = await loadSyllabus(syllabus.id, userId);
  const ledger = ledgerTree ? readinessForLoadedSyllabus(ledgerTree) : null;
  const conceptState =
    ledger?.conceptStates.find((c) => c.conceptId === concept.id) ?? null;

  // The header badge is the ledger's tier for this concept (H-1 item 2). A
  // concept the ledger does not know renders as Not started, never invented.
  const tier: ConstellationTier = conceptState ? tierOf(conceptState) : "not_started";
  const tierBadge = TIER_BADGE[tier];
  const TierIcon = tierBadge.icon;
  const nextConceptId =
    ledger && conceptState
      ? findNextUnverifiedConcept(ledger, concept.id)
      : null;

  const cta: ConceptCta | null =
    ledger && conceptState
      ? selectConceptCta({
          concept: conceptState,
          unbackedBearingClusterIds: unbackedBearingClusterIds(ledger),
          primaryResourceUnfinished: primary != null && primary.status !== "completed",
          nextUnverifiedConceptId: nextConceptId,
        })
      : null;

  const nextConceptName = nextConceptId
    ? (ledgerTree?.clusters
        .flatMap((c) => c.subSkills.flatMap((s) => s.concepts))
        .find((c) => c.id === nextConceptId)?.name ?? null)
    : null;

  const attachClusterName =
    cta?.state === "attach_evidence" && !cta.isCurrentCluster
      ? (ledgerTree?.clusters.find((c) => c.id === cta.clusterId)?.name ?? null)
      : null;

  /** Which in-page section the CTA points at, so its <details> opens to match. */
  const openAnchor =
    cta?.state === "study"
      ? "#resources"
      : cta?.state === "take_check" || cta?.state === "retake_check"
        ? "#check"
        : null;

  return (
    <PageContainer width="content" className="flex flex-col gap-8">
      <nav className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
        <Link
          href={`/syllabi/${syllabus.id}`}
          className="hover:text-foreground underline-offset-4 hover:underline"
        >
          {syllabus.targetRole}
        </Link>
        <span>/</span>
        <span className="hover:text-foreground">{cluster.name}</span>
        <span>/</span>
        <span>{subSkill.name}</span>
        <span>/</span>
        <span className="text-foreground">{concept.name}</span>
      </nav>

      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-3xl font-semibold tracking-tight">
            {concept.name}
          </h1>
          <Badge
            variant="outline"
            className={cn("shrink-0 gap-1 text-xs", tierBadge.className)}
          >
            <TierIcon className="size-3" />
            {formatTierLabel(tier)}
          </Badge>
        </div>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {concept.description}
        </p>
      </header>

      {cta ? (
        <ConceptCtaCard
          cta={cta}
          context={{
            primaryResourceTitle: primary?.title ?? null,
            nextConceptName,
            attachClusterName,
          }}
        />
      ) : null}

      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-x-10">
      <div className="lg:col-start-1">
        <ConceptRelevanceSection
          conceptId={concept.id}
          targetRole={syllabus.targetRole}
          relevance={relevance}
        />
      </div>

      <Separator className="lg:hidden" />

      <div className="lg:col-start-1">
        <ConceptExpansionSection
          conceptId={concept.id}
          expansion={expansion}
          siblings={siblingMeta}
        />
      </div>

      <Separator className="lg:hidden" />

      <details
        id="status"
        open={false}
        className="group flex scroll-mt-24 flex-col gap-3 lg:col-start-1"
      >
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
          <ChevronRight className="text-muted-foreground size-4 transition-transform group-open:rotate-90" />
          Your own mark
        </summary>
        <div className="pt-1">
          <StatusControls
            conceptId={concept.id}
            status={concept.status as ConceptStatus}
          />
        </div>
      </details>

      <Separator className="lg:hidden" />

      <section
        id="resources"
        className="flex scroll-mt-24 flex-col gap-6 lg:col-start-2 lg:row-start-1 lg:self-start lg:sticky lg:top-20"
      >
        <h2 className="text-lg font-medium">Resources</h2>

        {primary ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Recommended
            </h3>
            <ResourceCard
              resource={primary}
              conceptId={concept.id}
              variant="prominent"
              existingBrief={briefByResourceId.get(primary.id) ?? null}
            />
          </div>
        ) : null}

        {alternatives.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Other paths ({alternatives.length})
            </h3>
            <AlternativeResources>
              {alternatives.map((r) => (
                <ResourceCard
                  key={r.id}
                  resource={r}
                  conceptId={concept.id}
                  existingBrief={briefByResourceId.get(r.id) ?? null}
                />
              ))}
            </AlternativeResources>
          </div>
        ) : null}

        {userAdded.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Your resources ({userAdded.length})
            </h3>
            <div className="flex flex-col gap-2">
              {userAdded.map((r) => (
                <ResourceCard
                  key={r.id}
                  resource={r}
                  conceptId={concept.id}
                  existingBrief={briefByResourceId.get(r.id) ?? null}
                />
              ))}
            </div>
          </div>
        ) : null}

        {!primary && alternatives.length === 0 && userAdded.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No resources yet. Add one below.
          </p>
        ) : null}

        <AddResourceForm conceptId={concept.id} />
      </section>

      <Separator className="lg:hidden" />

      <details
        id="check"
        open={openAnchor === "#check"}
        className="group flex scroll-mt-24 flex-col gap-3 lg:col-start-1"
      >
        <summary className="flex cursor-pointer list-none items-center gap-2 text-lg font-medium [&::-webkit-details-marker]:hidden">
          <ChevronRight className="text-muted-foreground size-5 transition-transform group-open:rotate-90" />
          Check your understanding
        </summary>
        <div className="flex flex-col gap-3 pt-1">
          <p className="text-muted-foreground text-sm leading-relaxed">{CHECK_INTRO}</p>
          <CompetencyCheck
            conceptId={concept.id}
            lastScore={lastCheck?.score ?? null}
            lastCompletedAt={lastCheck?.completedAt ?? null}
          />
        </div>
      </details>

      <Separator className="lg:hidden" />

      <details
        id="notes"
        open={initialSessionId != null}
        className="group flex flex-col gap-4 lg:col-start-1"
      >
        <summary className="flex cursor-pointer list-none items-center gap-2 text-lg font-medium [&::-webkit-details-marker]:hidden">
          <ChevronRight className="text-muted-foreground size-5 transition-transform group-open:rotate-90" />
          Notes &amp; sessions
        </summary>
        <div className="flex max-w-prose flex-col gap-4 pt-1">
        <NotesEditor
          conceptId={concept.id}
          initialSessionId={initialSessionId}
          initialNotes={initialNotes}
          initialDurationMinutes={initialDurationMinutes}
        />

        {pastSessions.length > 0 ? (
          <div className="flex flex-col gap-3">
            <h3 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Previous sessions ({pastSessions.length})
            </h3>
            <ol className="flex flex-col gap-3">
              {pastSessions.map((session) => (
                <li
                  key={session.id}
                  className="border-border/60 bg-card/40 rounded-md border px-4 py-3"
                >
                  <div className="text-muted-foreground flex items-center justify-between text-xs">
                    <span>
                      {format(session.createdAt, "d MMM yyyy, HH:mm")}
                      <span className="ml-2">
                        ·{" "}
                        {formatDistanceToNow(session.createdAt, {
                          addSuffix: true,
                        })}
                      </span>
                    </span>
                    {session.durationMinutes > 0 ? (
                      <span>{session.durationMinutes} min</span>
                    ) : null}
                  </div>
                  {session.notesMarkdown.trim().length > 0 ? (
                    <pre className="text-foreground/90 mt-2 whitespace-pre-wrap text-sm font-sans leading-relaxed">
                      {session.notesMarkdown}
                    </pre>
                  ) : (
                    <p className="text-muted-foreground mt-2 text-sm italic">
                      (no notes)
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </div>
        ) : null}
        </div>
      </details>
      </div>
    </PageContainer>
  );
}
