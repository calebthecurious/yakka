"use client";

import { useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  CircleDashed,
  Loader2,
  RotateCw,
  Target,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/page-container";
import { retryClusterArtefactUnit, retrySubSkillUnit } from "./generation-actions";

type GenStatus = "pending" | "running" | "complete" | "failed";
type ClusterType = "technical" | "domain" | "soft" | "meta";

type GenSubSkill = {
  id: string;
  name: string;
  generationStatus: GenStatus;
  conceptCount: number;
};

export type GenCluster = {
  id: string;
  name: string;
  type: ClusterType;
  isArtefactBearing: boolean;
  artefactStatus: GenStatus;
  subSkills: GenSubSkill[];
};

// How often to re-fetch the server component while work is in flight. Polling is
// the chosen mechanism (over realtime): a single low-frequency, self-terminating
// refresh, no channel/RLS plumbing.
const POLL_MS = 2500;

const CLUSTER_BORDER: Record<ClusterType, string> = {
  technical: "border-l-foreground/30",
  domain: "border-l-amber-500/50",
  soft: "border-l-sky-400/50",
  meta: "border-l-emerald-400/50",
};

const CLUSTER_LABEL: Record<ClusterType, string> = {
  technical: "Technical",
  domain: "Domain",
  soft: "Soft",
  meta: "Meta",
};

export function GeneratingView({
  syllabusId,
  targetRole,
  targetCompany,
  clusters,
}: {
  syllabusId: string;
  targetRole: string;
  targetCompany: string | null;
  clusters: GenCluster[];
}) {
  const router = useRouter();

  const skeletonLanded = clusters.length > 0;
  const subUnits = clusters.flatMap((c) => c.subSkills);
  const totalSub = subUnits.length;
  const doneSub = subUnits.filter((s) => s.generationStatus === "complete").length;
  const inFlight =
    !skeletonLanded ||
    subUnits.some(
      (s) => s.generationStatus === "pending" || s.generationStatus === "running",
    ) ||
    clusters.some(
      (c) => c.artefactStatus === "pending" || c.artefactStatus === "running",
    );
  const failedCount =
    subUnits.filter((s) => s.generationStatus === "failed").length +
    clusters.filter((c) => c.isArtefactBearing && c.artefactStatus === "failed")
      .length;

  // Poll the server component only while work is genuinely in flight. When
  // generation settles (or only failed units remain, awaiting an explicit
  // retry), stop — the retry action re-triggers a render on its own.
  useEffect(() => {
    if (!inFlight) return;
    const id = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [inFlight, router]);

  return (
    <PageContainer width="wide" className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <Link href="/syllabi" className="hover:text-foreground">
            ← All syllabi
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">
            {targetRole}
            {targetCompany ? (
              <span className="text-muted-foreground font-normal">
                {" "}
                · {targetCompany}
              </span>
            ) : null}
          </h1>
          <Badge variant="outline" className="gap-1.5">
            {inFlight ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <AlertTriangle className="size-3.5 text-amber-400" aria-hidden />
            )}
            {inFlight ? "Generating" : "Needs attention"}
          </Badge>
        </div>

        {/* Honest, calm status — real per-unit progress, not a timer. */}
        <p className="text-muted-foreground max-w-prose text-sm">
          {inFlight ? (
            <>
              Building your syllabus in the background. You can safely leave this
              page — generation keeps running, and your syllabus will be here when
              you get back.
            </>
          ) : (
            <>
              Generation finished. {failedCount} part
              {failedCount === 1 ? "" : "s"} didn&apos;t complete — retry below,
              and the rest of your syllabus is ready underneath.
            </>
          )}
        </p>

        {skeletonLanded ? (
          <div className="flex flex-col gap-1.5">
            <div className="text-muted-foreground flex items-center justify-between text-xs tabular-nums">
              <span>
                {doneSub} / {totalSub} sub-skills ready
              </span>
              {failedCount > 0 ? (
                <span className="text-amber-400">
                  {failedCount} need{failedCount === 1 ? "s" : ""} a retry
                </span>
              ) : null}
            </div>
            <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
              <div
                className="bg-foreground/70 h-full rounded-full transition-[width] duration-500 ease-out"
                style={{
                  width: `${totalSub > 0 ? (doneSub / totalSub) * 100 : 4}%`,
                }}
              />
            </div>
          </div>
        ) : null}
      </header>

      <div className="flex flex-col gap-4">
        {skeletonLanded
          ? clusters.map((cluster) => (
              <ClusterCard
                key={cluster.id}
                syllabusId={syllabusId}
                cluster={cluster}
              />
            ))
          : // Skeleton not landed yet — reserve space with placeholder cards so
            // the real clusters slot in without a layout jump.
            Array.from({ length: 4 }).map((_, i) => (
              <PlaceholderCard key={i} />
            ))}
      </div>
    </PageContainer>
  );
}

function ClusterCard({
  syllabusId,
  cluster,
}: {
  syllabusId: string;
  cluster: GenCluster;
}) {
  return (
    <div
      className={cn(
        "bg-card overflow-hidden rounded-lg border border-l-4",
        CLUSTER_BORDER[cluster.type],
      )}
    >
      <div className="flex items-center gap-2 px-4 py-3">
        <span className="text-base font-semibold tracking-tight">
          {cluster.name}
        </span>
        <Badge variant="outline" className="text-[10px]">
          {CLUSTER_LABEL[cluster.type]}
        </Badge>
      </div>

      <div className="border-border/40 divide-border/30 flex flex-col divide-y border-t">
        {cluster.subSkills.map((ss) => (
          <SubSkillRow
            key={ss.id}
            syllabusId={syllabusId}
            subSkill={ss}
          />
        ))}
        {cluster.isArtefactBearing ? (
          <ArtefactRow syllabusId={syllabusId} cluster={cluster} />
        ) : null}
      </div>
    </div>
  );
}

/** Fixed-height row (h-11) so status changes never shift the layout. */
function SubSkillRow({
  syllabusId,
  subSkill,
}: {
  syllabusId: string;
  subSkill: GenSubSkill;
}) {
  return (
    <div className="flex h-11 items-center gap-2.5 px-4">
      <UnitIcon status={subSkill.generationStatus} />
      <span className="truncate text-sm">{subSkill.name}</span>
      <div className="ml-auto shrink-0">
        {subSkill.generationStatus === "complete" ? (
          <span className="text-muted-foreground text-xs tabular-nums">
            {subSkill.conceptCount} concept
            {subSkill.conceptCount === 1 ? "" : "s"}
          </span>
        ) : subSkill.generationStatus === "failed" ? (
          <RetryButton
            action={() => retrySubSkillUnit(syllabusId, subSkill.id)}
          />
        ) : (
          <span className="text-muted-foreground/70 text-xs">
            {subSkill.generationStatus === "running" ? "Generating…" : "Queued"}
          </span>
        )}
      </div>
    </div>
  );
}

function ArtefactRow({
  syllabusId,
  cluster,
}: {
  syllabusId: string;
  cluster: GenCluster;
}) {
  const status = cluster.artefactStatus;
  return (
    <div className="bg-muted/10 flex h-11 items-center gap-2.5 px-4">
      <Target className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
      <span className="text-muted-foreground text-sm">Portfolio artefact</span>
      <div className="ml-auto shrink-0">
        {status === "complete" ? (
          <span className="text-muted-foreground flex items-center gap-1 text-xs">
            <Check className="size-3.5 text-emerald-400" aria-hidden /> Ready
          </span>
        ) : status === "failed" ? (
          <RetryButton
            action={() => retryClusterArtefactUnit(syllabusId, cluster.id)}
          />
        ) : (
          <span className="text-muted-foreground/70 text-xs">
            {status === "running" ? "Generating…" : "Waiting on concepts"}
          </span>
        )}
      </div>
    </div>
  );
}

function UnitIcon({ status }: { status: GenStatus }) {
  if (status === "complete")
    return <Check className="size-4 shrink-0 text-emerald-400" aria-hidden />;
  if (status === "running")
    return (
      <Loader2
        className="text-foreground/70 size-4 shrink-0 animate-spin"
        aria-hidden
      />
    );
  if (status === "failed")
    return (
      <AlertTriangle className="size-4 shrink-0 text-amber-400" aria-hidden />
    );
  return (
    <CircleDashed
      className="text-muted-foreground/50 size-4 shrink-0"
      aria-hidden
    />
  );
}

function RetryButton({ action }: { action: () => Promise<void> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pending}
      className="h-7 gap-1.5 text-xs"
      onClick={() =>
        start(async () => {
          await action();
          router.refresh();
        })
      }
    >
      {pending ? (
        <Loader2 className="size-3 animate-spin" aria-hidden />
      ) : (
        <RotateCw className="size-3" aria-hidden />
      )}
      Retry
    </Button>
  );
}

function PlaceholderCard() {
  return (
    <div className="border-border/60 bg-card/40 overflow-hidden rounded-lg border border-l-4">
      <div className="flex items-center px-4 py-3">
        <div className="bg-muted/60 h-4 w-44 animate-pulse rounded" />
      </div>
      <div className="border-border/40 divide-border/30 flex flex-col divide-y border-t">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex h-11 items-center gap-2.5 px-4">
            <div className="bg-muted/50 size-4 shrink-0 animate-pulse rounded-full" />
            <div className="bg-muted/40 h-3 w-40 animate-pulse rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
