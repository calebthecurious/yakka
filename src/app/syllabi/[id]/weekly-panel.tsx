import Link from "next/link";
import { ArrowRight, BadgeCheck, CalendarClock, Target } from "lucide-react";
import type { WeeklyPanelData } from "@/lib/readiness/weekly";

/**
 * "This week" — the weekly-loop surface for a current_role workspace (W-3).
 *
 * Renders exactly what `weeklyPanelData` returns and composes nothing: the
 * next concept is the ledger's, the evidence line is the taxonomy's dated
 * label verbatim, and the drift count is the module's. Names come from the
 * page's id → name maps (mapping is not derivation). Absent data renders an
 * honest sentence, never a placeholder number.
 */
export function WeeklyPanel({
  data,
  conceptName,
  clusterName,
}: {
  data: WeeklyPanelData;
  conceptName: ReadonlyMap<string, string>;
  clusterName: ReadonlyMap<string, string>;
}) {
  const next = data.nextConceptId;
  const nextName = next ? conceptName.get(next) : undefined;
  const recent = data.recent;
  const recentName = recent ? conceptName.get(recent.conceptId) : undefined;
  const recentCluster = recent ? clusterName.get(recent.clusterId) : undefined;

  return (
    <section
      aria-labelledby="this-week"
      className="border-border/60 bg-card/40 grid gap-4 rounded-lg border p-4 sm:grid-cols-3"
    >
      <h2 id="this-week" className="sr-only">
        This week
      </h2>

      {/* 1. Next unverified concept */}
      <div className="flex flex-col gap-1.5">
        <span className="text-muted-foreground flex items-center gap-1.5 text-xs tracking-wide uppercase">
          <Target className="size-3.5" aria-hidden /> Next
        </span>
        {next ? (
          <Link
            href={`/concepts/${next}`}
            className="group flex items-start gap-1.5 text-sm font-medium"
          >
            <span className="text-pretty">{nextName ?? "Next unverified concept"}</span>
            <ArrowRight
              className="text-muted-foreground mt-0.5 size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>
        ) : (
          <span className="text-muted-foreground text-sm">
            {data.conceptsTotal === 0
              ? "No concepts yet."
              : "Every concept is verified. Nothing left to verify here."}
          </span>
        )}
      </div>

      {/* 2. Most recent evidence, with its date */}
      <div className="flex flex-col gap-1.5">
        <span className="text-muted-foreground flex items-center gap-1.5 text-xs tracking-wide uppercase">
          <BadgeCheck className="size-3.5 text-emerald-300" aria-hidden /> Most recent evidence
        </span>
        {recent ? (
          <div className="flex flex-col gap-0.5">
            <Link href={`/concepts/${recent.conceptId}`} className="text-sm font-medium hover:underline">
              {recentName ?? "Concept"}
            </Link>
            <span className="text-muted-foreground text-xs">{recent.label}</span>
            {recentCluster ? (
              <span className="text-muted-foreground/70 text-xs">{recentCluster}</span>
            ) : null}
          </div>
        ) : (
          <span className="text-muted-foreground text-sm">
            No evidence yet. The first passed check or finished artefact shows here.
          </span>
        )}
      </div>

      {/* 3. Drift */}
      <div className="flex flex-col gap-1.5">
        <span className="text-muted-foreground flex items-center gap-1.5 text-xs tracking-wide uppercase">
          <CalendarClock className="size-3.5" aria-hidden /> Last {data.windowDays} days
        </span>
        <span className="text-sm">
          <span className="font-medium tabular-nums">{data.verifiedInWindow}</span>{" "}
          {data.verifiedInWindow === 1 ? "concept" : "concepts"} verified in the last{" "}
          {data.windowDays} days
          <span className="text-muted-foreground">
            {" "}
            · {data.verifiedTotal} of {data.conceptsTotal} overall
          </span>
        </span>
      </div>
    </section>
  );
}
