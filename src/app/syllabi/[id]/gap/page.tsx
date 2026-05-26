import { notFound } from "next/navigation";
import { connection } from "next/server";
import Link from "next/link";
import type { Metadata } from "next";
import { format } from "date-fns";
import {
  ArrowRight,
  Check,
  CircleDashed,
  Lightbulb,
  MessagesSquare,
  Sparkles,
  Telescope,
  TrendingUp,
} from "lucide-react";
import { db } from "@/db";
import type {
  GapInProgress,
  GapNotStarted,
  SignalRecommendation,
} from "@/db/schema";
import { requireCurrentUserId } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { GapReportButton } from "./gap-report-buttons";
import { AddToSyllabusButton } from "./add-to-syllabus-button";

type PageProps = { params: Promise<{ id: string }> };

type ConceptStatus = "not_started" | "learning" | "understood" | "verified";

type ConceptMeta = { name: string; status: ConceptStatus };

async function loadSyllabus(id: string, userId: string) {
  await connection();

  return db.query.syllabi.findFirst({
    where: (s, { and, eq }) => and(eq(s.id, id), eq(s.userId, userId)),
    with: {
      clusters: {
        with: {
          subSkills: {
            with: {
              concepts: { columns: { id: true, name: true, status: true } },
            },
          },
        },
      },
    },
  });
}

async function loadReport(syllabusId: string) {
  return db.query.gapReports.findFirst({
    where: (r, { eq }) => eq(r.syllabusId, syllabusId),
  });
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const userId = await requireCurrentUserId();
  const syllabus = await loadSyllabus(id, userId);
  if (!syllabus) return { title: "Gap analysis not found — Provency" };
  return { title: `Gap analysis · ${syllabus.targetRole} — Provency` };
}

const STATUS_STYLE: Record<ConceptStatus, { label: string; className: string }> =
  {
    not_started: {
      label: "Not started",
      className: "border-border text-muted-foreground",
    },
    learning: {
      label: "Learning",
      className: "border-amber-500/30 bg-amber-500/10 text-amber-200",
    },
    understood: {
      label: "Understood",
      className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    },
    verified: {
      label: "Verified",
      className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    },
  };

const EFFORT_STYLE: Record<
  SignalRecommendation["effort"],
  { label: string; className: string }
> = {
  low: {
    label: "Low effort",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  },
  medium: {
    label: "Medium effort",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  },
  high: {
    label: "High effort",
    className: "border-rose-500/30 bg-rose-500/10 text-rose-200",
  },
};

function ConceptStatusBadge({ status }: { status: ConceptStatus }) {
  const style = STATUS_STYLE[status];
  return (
    <Badge variant="outline" className={cn("text-[10px]", style.className)}>
      {style.label}
    </Badge>
  );
}

/** "Continue →" link to a mapped concept, with its status inline. */
function ConceptLink({
  conceptId,
  concept,
  label,
}: {
  conceptId: string;
  concept: ConceptMeta;
  label: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ConceptStatusBadge status={concept.status} />
      <Link
        href={`/concepts/${conceptId}`}
        className="text-primary inline-flex items-center gap-1 text-xs font-medium underline-offset-4 hover:underline"
      >
        {label} <span className="text-muted-foreground">{concept.name}</span>
        <ArrowRight className="size-3" />
      </Link>
    </div>
  );
}

function buildSummary(report: {
  strengths: unknown[];
  gapsNotStarted: GapNotStarted[];
}): string {
  const strengthCount = report.strengths.length;
  const blindSpots = report.gapsNotStarted.filter((g) => g.isSyllabusBlindSpot);
  const orderedGaps = [
    ...blindSpots.map((g) => g.requirement),
    ...report.gapsNotStarted
      .filter((g) => !g.isSyllabusBlindSpot)
      .map((g) => g.requirement),
  ];
  const topGaps = orderedGaps.slice(0, 3);

  const strengthPart =
    strengthCount > 0
      ? `Strong start — ${strengthCount} role requirement${strengthCount === 1 ? "" : "s"} already evidenced`
      : "Nothing fully evidenced yet";
  const gapPart =
    topGaps.length > 0
      ? `main gaps are ${topGaps.join(", ")}`
      : "no outstanding gaps identified";
  const blindNote =
    blindSpots.length > 0
      ? ` (${blindSpots.length} not yet in your syllabus)`
      : "";

  return `${strengthPart}; ${gapPart}${blindNote}.`;
}

export default async function GapPage({ params }: PageProps) {
  const { id } = await params;
  const userId = await requireCurrentUserId();
  const syllabus = await loadSyllabus(id, userId);
  if (!syllabus) notFound();

  const report = await loadReport(id);
  const resumeText = (syllabus.metadata.currentSkills ?? "").trim();
  const hasResume = resumeText.length > 0;

  // id → {name, status} so report rows can render concept names + statuses.
  const conceptLookup = new Map<string, ConceptMeta>();
  for (const cluster of syllabus.clusters) {
    for (const sub of cluster.subSkills) {
      for (const concept of sub.concepts) {
        conceptLookup.set(concept.id, {
          name: concept.name,
          status: concept.status,
        });
      }
    }
  }

  const conceptOf = (conceptId: string | null): ConceptMeta | null =>
    conceptId ? (conceptLookup.get(conceptId) ?? null) : null;

  const header = (
    <header className="flex flex-col gap-3">
      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        <Link href={`/syllabi/${id}`} className="hover:text-foreground">
          ← Back to syllabus
        </Link>
      </div>
      <h1 className="text-3xl font-semibold tracking-tight">
        Gap analysis
        <span className="text-muted-foreground font-normal">
          {" "}
          · {syllabus.targetRole}
          {syllabus.targetCompany ? ` · ${syllabus.targetCompany}` : ""}
        </span>
      </h1>
    </header>
  );

  // ── Empty states ──────────────────────────────────────────────────────────
  if (!report) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
        {header}
        {hasResume ? (
          <section className="border-border/60 bg-card flex flex-col items-start gap-4 rounded-lg border px-6 py-8">
            <div className="flex flex-col gap-2">
              <h2 className="text-lg font-medium">No gap analysis yet</h2>
              <p className="text-muted-foreground max-w-prose text-sm leading-relaxed">
                Compare your resume against this role to see what you already
                bring, what&rsquo;s in progress, and — most usefully — the
                requirements your syllabus doesn&rsquo;t cover yet. No score,
                just an honest categorical breakdown.
              </p>
            </div>
            <GapReportButton syllabusId={id} mode="generate" />
          </section>
        ) : (
          <section className="border-amber-500/30 bg-amber-500/5 flex flex-col items-start gap-3 rounded-lg border px-6 py-8">
            <h2 className="text-lg font-medium text-amber-100">
              Add a resume first
            </h2>
            <p className="text-muted-foreground max-w-prose text-sm leading-relaxed">
              Gap analysis needs your resume to compare against the role. This
              syllabus doesn&rsquo;t have any resume or background text on file
              yet. Upload one when creating a syllabus, then come back here.
            </p>
            <Link
              href="/syllabi/new"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Go to resume upload <ArrowRight className="size-3" />
            </Link>
          </section>
        )}
      </main>
    );
  }

  const mappedNotStarted = report.gapsNotStarted.filter(
    (g) => !g.isSyllabusBlindSpot,
  );
  const blindSpots = report.gapsNotStarted.filter((g) => g.isSyllabusBlindSpot);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-col gap-4">
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <Link href={`/syllabi/${id}`} className="hover:text-foreground">
            ← Back to syllabus
          </Link>
          <span>·</span>
          <span>Generated {format(report.generatedAt, "d MMM yyyy, HH:mm")}</span>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">
              Gap analysis
              <span className="text-muted-foreground font-normal">
                {" "}
                · {syllabus.targetRole}
                {syllabus.targetCompany ? ` · ${syllabus.targetCompany}` : ""}
              </span>
            </h1>
            <p className="text-foreground/80 max-w-prose text-sm leading-relaxed">
              {buildSummary(report)}
            </p>
          </div>
          <GapReportButton syllabusId={id} mode="regenerate" />
        </div>
      </header>

      {/* 1 ── What you already bring (strengths) ─────────────────────────────*/}
      <section className="flex flex-col gap-3">
        <SectionHeading
          icon={<Sparkles className="size-4 text-emerald-300" />}
          title="What you already bring"
          subtitle="Role requirements your resume already evidences."
          count={report.strengths.length}
        />
        {report.strengths.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {report.strengths.map((s, i) => (
              <li
                key={i}
                className="border-emerald-500/25 bg-emerald-500/[0.06] flex items-start gap-3 rounded-lg border px-4 py-3"
              >
                <Check className="mt-0.5 size-4 shrink-0 text-emerald-300" />
                <div className="flex flex-col gap-1">
                  <span className="text-emerald-50 text-sm font-medium">
                    {s.requirement}
                  </span>
                  <span className="text-muted-foreground text-sm leading-relaxed">
                    {s.evidence}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyNote>
            No requirements were a clear match from your resume yet — that&rsquo;s
            what the syllabus is for.
          </EmptyNote>
        )}
      </section>

      {/* 2 ── In progress (gapsInProgress) ───────────────────────────────────*/}
      <section className="flex flex-col gap-3">
        <SectionHeading
          icon={<CircleDashed className="size-4 text-amber-300" />}
          title="In progress"
          subtitle="Not on your resume yet, but covered by concepts you've started."
          count={report.gapsInProgress.length}
        />
        {report.gapsInProgress.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {report.gapsInProgress.map((g: GapInProgress, i) => {
              const concept = conceptOf(g.conceptId);
              return (
                <li
                  key={i}
                  className="border-border/60 bg-card flex flex-col gap-2 rounded-lg border px-4 py-3"
                >
                  <span className="text-sm font-medium">{g.requirement}</span>
                  <span className="text-muted-foreground text-sm leading-relaxed">
                    {g.note}
                  </span>
                  {g.conceptId && concept ? (
                    <ConceptLink
                      conceptId={g.conceptId}
                      concept={concept}
                      label="Continue →"
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyNote>Nothing currently in progress.</EmptyNote>
        )}
      </section>

      {/* 3 ── Not yet addressed (gapsNotStarted) ─────────────────────────────*/}
      <section className="flex flex-col gap-4">
        <SectionHeading
          icon={<Telescope className="size-4 text-violet-300" />}
          title="Not yet addressed"
          subtitle="Requirements you haven't evidenced or started."
          count={report.gapsNotStarted.length}
        />

        {mappedNotStarted.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              In your syllabus, not started
            </h3>
            <ul className="flex flex-col gap-2">
              {mappedNotStarted.map((g, i) => {
                const concept = conceptOf(g.conceptId);
                return (
                  <li
                    key={i}
                    className="border-border/60 bg-card flex flex-col gap-2 rounded-lg border px-4 py-3"
                  >
                    <span className="text-sm font-medium">{g.requirement}</span>
                    {g.note ? (
                      <span className="text-muted-foreground text-sm leading-relaxed">
                        {g.note}
                      </span>
                    ) : null}
                    {g.conceptId && concept ? (
                      <ConceptLink
                        conceptId={g.conceptId}
                        concept={concept}
                        label="Go to concept →"
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {blindSpots.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h3 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-violet-200">
              <Telescope className="size-3.5" />
              Not covered by your syllabus yet
            </h3>
            <p className="text-muted-foreground text-xs leading-relaxed">
              The role asks for these, but no concept in your plan covers them.
              Worth considering adding.
            </p>
            <ul className="flex flex-col gap-2">
              {blindSpots.map((g, i) => (
                <li
                  key={i}
                  className="border-violet-500/30 bg-violet-500/[0.07] flex flex-col gap-2 rounded-lg border px-4 py-3"
                >
                  <div className="flex items-start gap-2">
                    <Badge
                      variant="outline"
                      className="border-violet-500/40 bg-violet-500/10 mt-0.5 text-[10px] text-violet-100"
                    >
                      Blind spot
                    </Badge>
                    <span className="text-violet-50 text-sm font-medium">
                      {g.requirement}
                    </span>
                  </div>
                  {g.note ? (
                    <span className="text-muted-foreground text-sm leading-relaxed">
                      {g.note}
                    </span>
                  ) : null}
                  <AddToSyllabusButton />
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {report.gapsNotStarted.length === 0 ? (
          <EmptyNote>Nothing outstanding — every requirement is at least in progress.</EmptyNote>
        ) : null}
      </section>

      {/* 4 ── Soft skills & signal ───────────────────────────────────────────*/}
      <section className="flex flex-col gap-5">
        <SectionHeading
          icon={<MessagesSquare className="size-4 text-sky-300" />}
          title="Soft skills & signal"
          subtitle="What the role needs beyond the technical, and how to build credibility."
        />

        <div className="flex flex-col gap-2">
          <h3 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            Soft skill gaps
          </h3>
          {report.softSkillGaps.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {report.softSkillGaps.map((g, i) => {
                const concept = conceptOf(g.conceptId);
                return (
                  <li
                    key={i}
                    className="border-sky-500/25 bg-sky-500/[0.06] flex flex-col gap-1.5 rounded-lg border px-4 py-3"
                  >
                    <span className="text-sky-50 text-sm font-medium">
                      {g.skill}
                    </span>
                    <span className="text-muted-foreground text-sm leading-relaxed">
                      {g.why}
                    </span>
                    {g.conceptId && concept ? (
                      <ConceptLink
                        conceptId={g.conceptId}
                        concept={concept}
                        label="Related →"
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyNote>No soft-skill gaps flagged.</EmptyNote>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <TrendingUp className="size-3.5" />
            Signal-building recommendations
          </h3>
          {report.signalRecommendations.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {report.signalRecommendations.map((r, i) => (
                <li
                  key={i}
                  className="border-border/60 bg-card flex items-start gap-3 rounded-lg border px-4 py-3"
                >
                  <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-300" />
                  <div className="flex flex-1 flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{r.action}</span>
                      <Badge
                        variant="outline"
                        className={cn("text-[10px]", EFFORT_STYLE[r.effort].className)}
                      >
                        {EFFORT_STYLE[r.effort].label}
                      </Badge>
                    </div>
                    <span className="text-muted-foreground text-sm leading-relaxed">
                      {r.rationale}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyNote>No signal recommendations.</EmptyNote>
          )}
        </div>
      </section>

      <footer className="text-muted-foreground border-border/60 border-t pt-6 text-xs">
        Generated by {report.model} · {format(report.generatedAt, "d MMM yyyy, HH:mm")}.
        Re-generate any time as your resume and progress change.
      </footer>
    </main>
  );
}

function SectionHeading({
  icon,
  title,
  subtitle,
  count,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  count?: number;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-lg font-medium tracking-tight">{title}</h2>
        {typeof count === "number" ? (
          <span className="text-muted-foreground text-sm">({count})</span>
        ) : null}
      </div>
      <p className="text-muted-foreground text-sm">{subtitle}</p>
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-border/40 text-muted-foreground rounded-lg border border-dashed px-4 py-3 text-sm">
      {children}
    </p>
  );
}
