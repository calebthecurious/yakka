"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatCount,
  formatTierLabel,
  formatVerifiedCount,
  type ConstellationTier,
} from "@/lib/readiness/surface-words";

type ClusterType = "technical" | "domain" | "soft" | "meta";

/** One concept dot: its ledger tier is the only state it carries (H-1). */
type MandalaConcept = { id: string; name: string; tier: ConstellationTier };

/**
 * Evidence-gated concept counts for one cluster, computed server-side from the
 * readiness ledger. Counts only — there is no percentage anywhere in this file
 * (H-1 item 5); every number renders as `formatCount`.
 */
export type MandalaReadiness = { done: number; total: number };

export type MandalaCluster = {
  id: string;
  name: string;
  type: ClusterType;
  weight: number;
  readiness: MandalaReadiness;
  concepts: MandalaConcept[];
};

// --- geometry (SVG user units; viewBox is a fixed 1000x1000 square) ---
const VB = 1000;
const CX = VB / 2;
const CY = VB / 2;
const CENTER_R = 92;
const CLUSTER_RING_R = 300;

function polar(cx: number, cy: number, r: number, angle: number): [number, number] {
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}

function clusterAngle(index: number, count: number): number {
  // start at top (-90deg), distribute evenly clockwise for any count (4-7+)
  return -Math.PI / 2 + index * ((2 * Math.PI) / count);
}

function nodeRadius(weight: number): number {
  return Math.min(64, Math.max(42, 38 + weight * 5));
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

// --- theme maps (consistent with the tree's type palette) ---
const CLUSTER_FILL: Record<ClusterType, string> = {
  technical: "fill-foreground/10 stroke-foreground/40",
  domain: "fill-amber-500/15 stroke-amber-500/60",
  soft: "fill-sky-500/15 stroke-sky-400/60",
  meta: "fill-emerald-500/15 stroke-emerald-400/60",
};

/**
 * Concept dots by TIER, the Constellation's idiom: verified is the accent
 * (artefact-verified solid, check-passed slightly lighter), self-assessed a
 * dashed outline, in progress and not started two greys. Words come from
 * formatTierLabel only.
 */
const TIER_DOT: Record<ConstellationTier, string> = {
  artefact_verified: "fill-(--lp-accent) stroke-(--lp-accent)",
  check_passed: "fill-(--lp-accent-check) stroke-(--lp-accent)",
  self_assessed: "fill-transparent stroke-(--lp-text-secondary) [stroke-dasharray:3_2]",
  in_progress: "fill-(--lp-node-in-progress) stroke-(--lp-text-secondary)",
  not_started: "fill-(--lp-node-not-started) stroke-(--lp-line)",
};

const TIER_CHIP: Record<ConstellationTier, string> = {
  artefact_verified: "border-(--lp-accent)/50 bg-(--lp-accent)/10 text-(--lp-accent)",
  check_passed: "border-(--lp-accent)/50 bg-(--lp-accent)/10 text-(--lp-accent)",
  self_assessed: "border-dashed border-(--lp-text-secondary) text-muted-foreground",
  in_progress: "border-(--lp-text-secondary) bg-(--lp-node-in-progress)/25 text-foreground/85",
  not_started: "border-muted-foreground/30 text-muted-foreground",
};

const CLUSTER_TYPE_LABEL: Record<ClusterType, string> = {
  technical: "Technical",
  domain: "Domain",
  soft: "Soft",
  meta: "Meta",
};

// mobile fallback styling
const CLUSTER_BORDER: Record<ClusterType, string> = {
  technical: "border-l-foreground/30",
  domain: "border-l-amber-500/50",
  soft: "border-l-sky-400/50",
  meta: "border-l-emerald-400/50",
};

type Hovered = { x: number; y: number; title: string; subtitle: string } | null;

export function GoalMandala({
  targetRole,
  targetCompany,
  clusters,
  overall,
}: {
  targetRole: string;
  targetCompany: string | null;
  clusters: MandalaCluster[];
  /** Syllabus-wide concept counts from the readiness summary. */
  overall: MandalaReadiness;
}) {
  const [focusedId, setFocusedId] = useState<string | null>(null);

  return (
    <>
      {/* Desktop / tablet: radial SVG mandala */}
      <div className="hidden sm:block">
        <RadialMandala
          targetRole={targetRole}
          targetCompany={targetCompany}
          clusters={clusters}
          overall={overall}
          focusedId={focusedId}
          setFocusedId={setFocusedId}
        />
      </div>

      {/* Mobile: stacked-mandala accordion fallback */}
      <div className="sm:hidden">
        <StackedMandala
          targetRole={targetRole}
          targetCompany={targetCompany}
          clusters={clusters}
          overall={overall}
          focusedId={focusedId}
          setFocusedId={setFocusedId}
        />
      </div>
    </>
  );
}

function RadialMandala({
  targetRole,
  targetCompany,
  clusters,
  overall,
  focusedId,
  setFocusedId,
}: {
  targetRole: string;
  targetCompany: string | null;
  clusters: MandalaCluster[];
  overall: MandalaReadiness;
  focusedId: string | null;
  setFocusedId: (id: string | null) => void;
}) {
  const router = useRouter();
  const [hovered, setHovered] = useState<Hovered>(null);
  const count = clusters.length;

  const focused = useMemo(
    () => clusters.find((c) => c.id === focusedId) ?? null,
    [clusters, focusedId],
  );

  const focusedConcepts = useMemo(() => {
    if (!focused) return null;
    const index = clusters.findIndex((c) => c.id === focused.id);
    const angle = clusterAngle(index, count);
    const [nx, ny] = polar(CX, CY, CLUSTER_RING_R, angle);
    const baseR = nodeRadius(focused.weight) + 56;

    const placed: { concept: MandalaConcept; x: number; y: number }[] = [];
    let remaining = focused.concepts;
    let ring = 0;
    while (remaining.length > 0) {
      const r = baseR + ring * 28;
      const capacity = Math.max(6, Math.floor((2 * Math.PI * r) / 26));
      const take = remaining.slice(0, capacity);
      take.forEach((concept, i) => {
        const a = -Math.PI / 2 + (i / take.length) * 2 * Math.PI;
        const [dx, dy] = polar(nx, ny, r, a);
        placed.push({ concept, x: dx, y: dy });
      });
      remaining = remaining.slice(capacity);
      ring += 1;
    }
    return placed;
  }, [focused, clusters, count]);

  const tipW = 196;
  const tipX = hovered
    ? Math.min(VB - tipW - 6, Math.max(6, hovered.x - tipW / 2))
    : 0;

  return (
    <div className="relative mx-auto w-full max-w-2xl">
      <svg
        viewBox={`0 0 ${VB} ${VB}`}
        className="h-auto w-full select-none"
        role="img"
        aria-label={`Goal mandala for ${targetRole}: ${formatVerifiedCount(overall.done, overall.total)}`}
      >
        {/* background: click to clear focus */}
        <rect
          x={0}
          y={0}
          width={VB}
          height={VB}
          fill="transparent"
          onClick={() => setFocusedId(null)}
        />

        {/* spokes from center to each cluster */}
        {clusters.map((cluster, i) => {
          const [x, y] = polar(CX, CY, CLUSTER_RING_R, clusterAngle(i, count));
          const dim = focusedId !== null && focusedId !== cluster.id;
          return (
            <line
              key={`spoke-${cluster.id}`}
              x1={CX}
              y1={CY}
              x2={x}
              y2={y}
              className={cn(
                "stroke-border transition-opacity duration-300",
                focusedId === cluster.id ? "opacity-80" : "opacity-30",
                dim && "opacity-15",
              )}
              strokeWidth={1.5}
            />
          );
        })}

        {/* center node: the role and its verified count. No ring — a ring is a
            percentage drawn (H-1). */}
        <circle
          cx={CX}
          cy={CY}
          r={CENTER_R}
          className="fill-card stroke-border"
          strokeWidth={1}
        />
        <foreignObject
          x={CX - 80}
          y={CY - 52}
          width={160}
          height={104}
          className="overflow-visible"
        >
          <div className="flex h-[104px] flex-col items-center justify-center text-center leading-tight">
            <span className="line-clamp-2 px-1 text-[13px] font-medium text-foreground">
              {targetRole}
            </span>
            {targetCompany ? (
              <span className="mt-0.5 line-clamp-1 px-1 text-[11px] text-muted-foreground">
                {targetCompany}
              </span>
            ) : null}
            <span className="mt-1 text-[15px] font-semibold tabular-nums text-foreground">
              {formatCount(overall.done, overall.total)}
            </span>
            <span className="text-[10px] text-muted-foreground">verified</span>
          </div>
        </foreignObject>

        {/* cluster nodes */}
        {clusters.map((cluster, i) => {
          const angle = clusterAngle(i, count);
          const [x, y] = polar(CX, CY, CLUSTER_RING_R, angle);
          const r = nodeRadius(cluster.weight);
          const prog = cluster.readiness;
          const isFocused = focusedId === cluster.id;
          const dim = focusedId !== null && !isFocused;
          return (
            <g
              key={cluster.id}
              className={cn(
                "cursor-pointer transition-opacity duration-300",
                dim && "opacity-35",
              )}
              onClick={(e) => {
                e.stopPropagation();
                setFocusedId(isFocused ? null : cluster.id);
              }}
              onMouseEnter={() =>
                setHovered({
                  x,
                  y,
                  title: cluster.name,
                  subtitle: `${CLUSTER_TYPE_LABEL[cluster.type]} · ${formatVerifiedCount(prog.done, prog.total)}`,
                })
              }
              onMouseLeave={() => setHovered(null)}
              role="button"
              aria-label={`${cluster.name}, ${formatVerifiedCount(prog.done, prog.total)}. Click to ${isFocused ? "collapse" : "expand"}.`}
            >
              <circle
                cx={x}
                cy={y}
                r={r}
                className={cn(
                  CLUSTER_FILL[cluster.type],
                  isFocused && "stroke-[3px]",
                )}
                strokeWidth={isFocused ? 3 : 2}
              />
              <text
                x={x}
                y={y + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-foreground text-[13px] font-semibold tabular-nums"
              >
                {formatCount(prog.done, prog.total)}
              </text>
              <text
                x={x}
                y={y + r + 20}
                textAnchor="middle"
                className="fill-foreground text-[13px] font-medium"
              >
                {truncate(cluster.name, 22)}
              </text>
            </g>
          );
        })}

        {/* concepts of the focused cluster (drawn on top) */}
        {focusedConcepts?.map(({ concept, x, y }) => (
          <g
            key={concept.id}
            className="animate-in fade-in zoom-in-95 cursor-pointer duration-300 motion-reduce:animate-none"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/concepts/${concept.id}`);
            }}
            onMouseEnter={() =>
              setHovered({
                x,
                y,
                title: concept.name,
                subtitle: formatTierLabel(concept.tier),
              })
            }
            onMouseLeave={() => setHovered(null)}
            role="link"
            aria-label={`${concept.name}, ${formatTierLabel(concept.tier)}`}
          >
            <circle
              cx={x}
              cy={y}
              r={9}
              className={cn(TIER_DOT[concept.tier], "transition-colors")}
              strokeWidth={1.5}
            />
          </g>
        ))}

        {/* tooltip (topmost) */}
        {hovered ? (
          <foreignObject
            x={tipX}
            y={Math.max(6, hovered.y - 62)}
            width={tipW}
            height={52}
            className="pointer-events-none overflow-visible"
          >
            <div className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs shadow-md">
              <div className="truncate font-medium text-foreground">
                {hovered.title}
              </div>
              <div className="truncate text-muted-foreground">
                {hovered.subtitle}
              </div>
            </div>
          </foreignObject>
        ) : null}
      </svg>

      <p className="mt-2 text-center text-xs text-muted-foreground">
        {focused
          ? `${focused.name} — click a concept to open it, or click the center to collapse`
          : "Click a skill cluster to reveal its concepts"}
      </p>
    </div>
  );
}

function StackedMandala({
  targetRole,
  targetCompany,
  clusters,
  overall,
  focusedId,
  setFocusedId,
}: {
  targetRole: string;
  targetCompany: string | null;
  clusters: MandalaCluster[];
  overall: MandalaReadiness;
  focusedId: string | null;
  setFocusedId: (id: string | null) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {/* hero: center node as a card */}
      <div className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-4">
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{targetRole}</p>
          {targetCompany ? (
            <p className="truncate text-sm text-muted-foreground">{targetCompany}</p>
          ) : null}
          <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
            {formatVerifiedCount(overall.done, overall.total)}
          </p>
        </div>
      </div>

      {/* cluster accordion */}
      {clusters.map((cluster) => {
        const prog = cluster.readiness;
        const open = focusedId === cluster.id;
        return (
          <div
            key={cluster.id}
            className={cn(
              "overflow-hidden rounded-lg border border-l-4 border-border bg-card",
              CLUSTER_BORDER[cluster.type],
            )}
          >
            <button
              type="button"
              onClick={() => setFocusedId(open ? null : cluster.id)}
              className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/30"
            >
              <ChevronRight
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform",
                  open && "rotate-90",
                )}
              />
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium">{cluster.name}</span>
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                  {formatVerifiedCount(prog.done, prog.total)}
                </p>
              </div>
            </button>
            {open ? (
              <div className="flex flex-wrap gap-1.5 border-t border-border/40 px-3 py-3">
                {cluster.concepts.length > 0 ? (
                  cluster.concepts.map((concept) => (
                    <Link
                      key={concept.id}
                      href={`/concepts/${concept.id}`}
                      title={formatTierLabel(concept.tier)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs transition-colors",
                        TIER_CHIP[concept.tier],
                      )}
                    >
                      {concept.name}
                    </Link>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">No concepts yet.</p>
                )}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
