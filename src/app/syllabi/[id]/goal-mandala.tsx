"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Status = "not_started" | "learning" | "understood" | "verified";
type ClusterType = "technical" | "domain" | "soft" | "meta";

type MandalaConcept = { id: string; name: string; status: Status };

export type MandalaCluster = {
  id: string;
  name: string;
  type: ClusterType;
  weight: number;
  concepts: MandalaConcept[];
};

// --- geometry (SVG user units; viewBox is a fixed 1000x1000 square) ---
const VB = 1000;
const CX = VB / 2;
const CY = VB / 2;
const CENTER_R = 92;
const CENTER_RING_R = 112;
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

function progressOf(concepts: MandalaConcept[]): { done: number; total: number; pct: number } {
  const total = concepts.length;
  const done = concepts.filter(
    (c) => c.status === "understood" || c.status === "verified",
  ).length;
  return { done, total, pct: total > 0 ? done / total : 0 };
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

// --- theme maps (consistent with the tree's type/status palette) ---
const CLUSTER_FILL: Record<ClusterType, string> = {
  technical: "fill-foreground/10 stroke-foreground/40",
  domain: "fill-amber-500/15 stroke-amber-500/60",
  soft: "fill-sky-500/15 stroke-sky-400/60",
  meta: "fill-emerald-500/15 stroke-emerald-400/60",
};

const CLUSTER_ARC: Record<ClusterType, string> = {
  technical: "stroke-foreground/70",
  domain: "stroke-amber-400",
  soft: "stroke-sky-300",
  meta: "stroke-emerald-300",
};

const STATUS_DOT: Record<Status, string> = {
  not_started: "fill-muted stroke-muted-foreground/50",
  learning: "fill-amber-500 stroke-amber-300",
  understood: "fill-foreground/80 stroke-foreground",
  verified: "fill-emerald-400 stroke-emerald-200",
};

const STATUS_LABEL: Record<Status, string> = {
  not_started: "Not started",
  learning: "Learning",
  understood: "Understood",
  verified: "Verified",
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

const STATUS_CHIP: Record<Status, string> = {
  not_started: "border-muted-foreground/30 text-muted-foreground",
  learning: "border-amber-500/50 bg-amber-500/10 text-amber-200",
  understood: "border-foreground/40 bg-foreground/10 text-foreground",
  verified: "border-emerald-400/50 bg-emerald-500/10 text-emerald-200",
};

type Hovered = { x: number; y: number; title: string; subtitle: string } | null;

export function GoalMandala({
  targetRole,
  targetCompany,
  clusters,
}: {
  targetRole: string;
  targetCompany: string | null;
  clusters: MandalaCluster[];
}) {
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const overall = useMemo(
    () => progressOf(clusters.flatMap((c) => c.concepts)),
    [clusters],
  );

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
  overall: { done: number; total: number; pct: number };
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

  const centerCircumference = 2 * Math.PI * CENTER_RING_R;
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
        aria-label={`Goal mandala for ${targetRole}: ${overall.done} of ${overall.total} concepts understood`}
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

        {/* center node + overall progress ring */}
        <circle
          cx={CX}
          cy={CY}
          r={CENTER_RING_R}
          fill="none"
          className="stroke-muted"
          strokeWidth={7}
        />
        <circle
          cx={CX}
          cy={CY}
          r={CENTER_RING_R}
          fill="none"
          className="stroke-foreground/70 transition-all duration-500"
          strokeWidth={7}
          strokeLinecap="round"
          strokeDasharray={`${overall.pct * centerCircumference} ${centerCircumference}`}
          transform={`rotate(-90 ${CX} ${CY})`}
        />
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
            <span className="mt-1 text-lg font-semibold tabular-nums text-foreground">
              {Math.round(overall.pct * 100)}%
            </span>
          </div>
        </foreignObject>

        {/* cluster nodes */}
        {clusters.map((cluster, i) => {
          const angle = clusterAngle(i, count);
          const [x, y] = polar(CX, CY, CLUSTER_RING_R, angle);
          const r = nodeRadius(cluster.weight);
          const prog = progressOf(cluster.concepts);
          const arcR = r + 7;
          const arcC = 2 * Math.PI * arcR;
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
                  subtitle: `${CLUSTER_TYPE_LABEL[cluster.type]} · ${prog.done}/${prog.total} understood`,
                })
              }
              onMouseLeave={() => setHovered(null)}
              role="button"
              aria-label={`${cluster.name}, ${prog.done} of ${prog.total} concepts understood. Click to ${isFocused ? "collapse" : "expand"}.`}
            >
              {/* progress track + arc around the node */}
              <circle
                cx={x}
                cy={y}
                r={arcR}
                fill="none"
                className="stroke-muted/40"
                strokeWidth={4}
              />
              <circle
                cx={x}
                cy={y}
                r={arcR}
                fill="none"
                className={cn(CLUSTER_ARC[cluster.type], "transition-all duration-500")}
                strokeWidth={4}
                strokeLinecap="round"
                strokeDasharray={`${prog.pct * arcC} ${arcC}`}
                transform={`rotate(-90 ${x} ${y})`}
              />
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
                className="fill-foreground text-[15px] font-semibold tabular-nums"
              >
                {Math.round(prog.pct * 100)}%
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
                subtitle: STATUS_LABEL[concept.status],
              })
            }
            onMouseLeave={() => setHovered(null)}
            role="link"
            aria-label={`${concept.name}, ${STATUS_LABEL[concept.status]}`}
          >
            <circle
              cx={x}
              cy={y}
              r={9}
              className={cn(STATUS_DOT[concept.status], "transition-colors")}
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
  overall: { done: number; total: number; pct: number };
  focusedId: string | null;
  setFocusedId: (id: string | null) => void;
}) {
  const ringR = 30;
  const ringC = 2 * Math.PI * ringR;
  return (
    <div className="flex flex-col gap-3">
      {/* hero: center node as a card */}
      <div className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-4">
        <svg viewBox="0 0 72 72" className="size-16 shrink-0" aria-hidden>
          <circle cx={36} cy={36} r={ringR} fill="none" className="stroke-muted" strokeWidth={6} />
          <circle
            cx={36}
            cy={36}
            r={ringR}
            fill="none"
            className="stroke-foreground/70"
            strokeWidth={6}
            strokeLinecap="round"
            strokeDasharray={`${overall.pct * ringC} ${ringC}`}
            transform="rotate(-90 36 36)"
          />
          <text
            x={36}
            y={37}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-foreground text-[16px] font-semibold tabular-nums"
          >
            {Math.round(overall.pct * 100)}
          </text>
        </svg>
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{targetRole}</p>
          {targetCompany ? (
            <p className="truncate text-sm text-muted-foreground">{targetCompany}</p>
          ) : null}
          <p className="mt-0.5 text-xs text-muted-foreground">
            {overall.done} / {overall.total} concepts understood
          </p>
        </div>
      </div>

      {/* cluster accordion */}
      {clusters.map((cluster) => {
        const prog = progressOf(cluster.concepts);
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
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1 w-24 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-foreground/60 transition-all"
                      style={{ width: `${prog.pct * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {prog.done}/{prog.total}
                  </span>
                </div>
              </div>
            </button>
            {open ? (
              <div className="flex flex-wrap gap-1.5 border-t border-border/40 px-3 py-3">
                {cluster.concepts.length > 0 ? (
                  cluster.concepts.map((concept) => (
                    <Link
                      key={concept.id}
                      href={`/concepts/${concept.id}`}
                      title={STATUS_LABEL[concept.status]}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs transition-colors",
                        STATUS_CHIP[concept.status],
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
