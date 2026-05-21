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
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { db } from "@/db";
import { requireCurrentUserId } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { StatusControls } from "./status-controls";
import { AlternativeResources } from "./alternative-resources";
import { AddResourceForm } from "./add-resource-form";
import { ResourceCard } from "./resource-card";
import { NotesEditor } from "./notes-editor";
import { CompetencyCheck } from "./competency-check";

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
  if (!concept) return { title: "Concept not found — Yakka" };
  return { title: `${concept.name} — Yakka` };
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

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
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

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Status</h2>
        <StatusControls
          conceptId={concept.id}
          status={concept.status as ConceptStatus}
        />
      </section>

      <Separator />

      <section className="flex flex-col gap-6">
        <h2 className="text-lg font-medium">Resources</h2>

        {primary ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Start here
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

      <Separator />

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-medium">Check your understanding</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            A short quiz across everything you&apos;ve studied for this concept.
            Passing suggests you&apos;re ready to mark it understood — the call
            stays yours.
          </p>
        </div>
        <CompetencyCheck
          conceptId={concept.id}
          conceptStatus={concept.status as ConceptStatus}
          lastScore={lastCheck?.score ?? null}
          lastCompletedAt={lastCheck?.completedAt ?? null}
        />
      </section>

      <Separator />

      <section className="flex flex-col gap-4">
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
      </section>
    </main>
  );
}
