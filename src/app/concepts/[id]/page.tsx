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
  Rocket,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { db } from "@/db";
import { requireCurrentUserId } from "@/lib/auth";
import { PASS_BAR } from "@/lib/readiness/model";
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

const STATUS_BADGE: Record<
  ConceptStatus,
  { label: string; icon: LucideIcon; className: string }
> = {
  not_started: {
    label: "Not started",
    icon: CircleDashed,
    className: "bg-muted text-muted-foreground border-border",
  },
  learning: {
    label: "Learning",
    icon: LearningIcon,
    className: "bg-amber-500/10 text-amber-200 border-amber-500/30",
  },
  understood: {
    label: "Understood",
    icon: Check,
    className: "bg-emerald-500/10 text-emerald-200 border-emerald-500/30",
  },
  verified: {
    label: "Verified",
    icon: ShieldCheck,
    className: "bg-sky-500/10 text-sky-200 border-sky-500/30",
  },
};

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

type NextAction = {
  /** The single recommended action. */
  label: string;
  /** One-line why. */
  detail: string;
  /** In-page anchor ("#check") or a route ("/clusters/…/artefact"). */
  href: string;
  cta: string;
};

/**
 * The one highlighted next action for this concept. A link (in-page anchor or a
 * route) — no client state, no new interactive surface. The target section's
 * <details> is opened by matching href, so the highlight and the section agree.
 */
function StartHereCard({ action }: { action: NextAction }) {
  const isAnchor = action.href.startsWith("#");
  const className =
    "group border-primary/40 bg-primary/5 hover:bg-primary/10 flex items-center gap-4 rounded-lg border px-4 py-3 transition-colors";
  const body = (
    <>
      <div className="bg-primary/15 text-primary flex size-10 shrink-0 items-center justify-center rounded-full">
        <Rocket className="size-5" />
      </div>
      <div className="flex flex-1 flex-col">
        <span className="text-primary/80 text-[10px] font-medium tracking-wide uppercase">
          Start here
        </span>
        <span className="font-medium">{action.label}</span>
        <span className="text-muted-foreground text-sm">{action.detail}</span>
      </div>
      <span className="text-primary flex shrink-0 items-center gap-1 text-sm font-medium">
        {action.cta}
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </>
  );
  return isAnchor ? (
    <a href={action.href} className={className}>
      {body}
    </a>
  ) : (
    <Link href={action.href} className={className}>
      {body}
    </Link>
  );
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
    currentSession &&
    Date.now() - new Date(currentSession.createdAt).getTime() <
      30 * 60 * 1000
      ? currentSession
      : null;
  const initialSessionId = recentSession?.id ?? null;
  const initialNotes = recentSession?.notesMarkdown ?? "";
  const initialDurationMinutes = recentSession?.durationMinutes ?? 0;

  const pastSessions = recentSession
    ? learningSessions.filter((s) => s.id !== recentSession.id)
    : learningSessions;

  const statusBadge = STATUS_BADGE[concept.status as ConceptStatus];
  const StatusIcon = statusBadge.icon;

  // ── "Start here": the single highlighted next action, chosen by state. ──
  const checkPassed = lastCheck?.score != null && lastCheck.score >= PASS_BAR;
  const clusterHasArtefact = cluster.subSkills.some(
    (s) => s.artefacts.length > 0,
  );
  const primaryDone = primary?.status === "completed";
  const conceptUnderstood =
    concept.status === "understood" || concept.status === "verified";

  const nextAction: NextAction =
    lastCheck == null
      ? {
          label: "Take the competency check",
          detail:
            "A short quiz across what you've studied — the honest test of whether this concept has landed.",
          href: "#check",
          cta: "Go to the check",
        }
      : checkPassed && cluster.isArtefactBearing && !clusterHasArtefact
        ? {
            label: "Log your artefact",
            detail:
              "You passed the check — build and log the project artefact that turns this into evidence.",
            href: `/clusters/${cluster.id}/artefact`,
            cta: "Open the project",
          }
        : primary && !primaryDone
          ? {
              label: `Study: ${primary.title}`,
              detail: "Work through the recommended resource, then take the check.",
              href: "#resources",
              cta: "Go to resources",
            }
          : !checkPassed
            ? {
                label: "Retake the competency check",
                detail: "Last attempt didn't pass — review, then try again.",
                href: "#check",
                cta: "Go to the check",
              }
            : !conceptUnderstood
              ? {
                  label: "Mark this concept understood",
                  detail:
                    "You've passed the check and evidenced it. Set the status when you're confident.",
                  href: "#status",
                  cta: "Go to status",
                }
              : {
                  label: "You're set on this concept",
                  detail:
                    "Understood and evidenced. Move on to the next concept in your syllabus.",
                  href: `/syllabi/${syllabus.id}`,
                  cta: "Back to syllabus",
                };

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
            className={cn("shrink-0 gap-1 text-xs", statusBadge.className)}
          >
            <StatusIcon className="size-3" />
            {statusBadge.label}
          </Badge>
        </div>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {concept.description}
        </p>
      </header>

      <StartHereCard action={nextAction} />

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
        open={nextAction.href === "#status"}
        className="group flex scroll-mt-24 flex-col gap-3 lg:col-start-1"
      >
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
          <ChevronRight className="text-muted-foreground size-4 transition-transform group-open:rotate-90" />
          Status
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
        open={nextAction.href === "#check"}
        className="group flex scroll-mt-24 flex-col gap-3 lg:col-start-1"
      >
        <summary className="flex cursor-pointer list-none items-center gap-2 text-lg font-medium [&::-webkit-details-marker]:hidden">
          <ChevronRight className="text-muted-foreground size-5 transition-transform group-open:rotate-90" />
          Check your understanding
        </summary>
        <div className="flex flex-col gap-3 pt-1">
          <p className="text-muted-foreground text-sm leading-relaxed">
            A short quiz across everything you&apos;ve studied for this concept.
            Passing suggests you&apos;re ready to mark it understood — the call
            stays yours.
          </p>
          <CompetencyCheck
            conceptId={concept.id}
            conceptStatus={concept.status as ConceptStatus}
            lastScore={lastCheck?.score ?? null}
            lastCompletedAt={lastCheck?.completedAt ?? null}
          />
        </div>
      </details>

      <Separator className="lg:hidden" />

      <details
        id="notes"
        open={nextAction.href === "#notes" || initialSessionId != null}
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
