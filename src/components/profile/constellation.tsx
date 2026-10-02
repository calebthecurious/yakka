"use client";

/**
 * Constellation — the public profile's evidence map.
 *
 * WHY SVG, NOT CANVAS. A syllabus has on the order of 100–400 concepts. At that
 * scale an SVG DOM is cheap (one <circle> per node, no per-frame redraw), it is
 * crisp at any device pixel ratio with no manual DPR scaling, every node is a
 * real focusable element so keyboard and screen-reader access come from the
 * platform instead of a hand-rolled hit-test layer, and the design-system
 * tokens apply as ordinary CSS classes (fill-foreground, stroke-border). Canvas
 * only wins past several thousand nodes or under continuous animation, and a
 * record has neither.
 *
 * SINGLE TRUTH. This component receives `constellationData`'s payload and reads
 * it. It derives no count, composes no evidence sentence, and formats no date
 * of its own: tier words come from `formatTierLabel`, dates from
 * `formatEvidenceDate`, evidence lines are the refs' own `label`. The only
 * arithmetic here is geometry — angles and radii — which is presentation.
 *
 * VISUAL LANGUAGE (stated in the legend, bound by docs/verification-taxonomy.md):
 *   fill = tier. Verified is solid; self-assessed is a dashed outline (the same
 *   idiom as the profile's dashed chips); in progress is a cool, lighter fill;
 *   not started is dim. Radius = tier too — verified evidence sits nearest the
 *   centre, so the record's core is what has been proven. Angle = cluster.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { ExternalLink, Pause, Play, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatEvidenceDate, formatRecordSinceLabel } from "@/lib/readiness/model";
import {
  canScrub,
  datedEvents,
  formatTierLabel,
  nodeStateAt,
  type ConstellationData,
  type ConstellationNode,
  type ConstellationTier,
} from "@/lib/readiness/constellation";

/* ── time scrubber (C-3) ───────────────────────────────────────────────────── */

/** One sweep from the first dated event to the present. */
const SWEEP_MS = 4000;
/** Slider resolution. Continuous time, not event index, so bursts read as bursts. */
const SLIDER_MAX = 1000;

/* ── geometry (SVG user units; viewBox is a fixed square) ─────────────────── */

const VB = 1000;
const CX = VB / 2;
const CY = VB / 2;
/**
 * Horizontal breathing room so cluster labels at 3 and 9 o'clock never clip.
 * Real cluster names run to ~30 characters; at 17px in a 1000-unit box a
 * 24-character label is ~230 units wide, so 260 clears it with margin.
 */
const VB_PAD_X = 260;
/** Cluster label truncation; pairs with VB_PAD_X above. */
const LABEL_MAX_CHARS = 24;
const CENTER_R = 118;
/** Radius per tier: proven work gravitates to the centre. */
const TIER_RADIUS: Record<ConstellationTier, number> = {
  artefact_verified: 205,
  check_passed: 262,
  self_assessed: 328,
  in_progress: 390,
  not_started: 445,
};
const LABEL_R = 492;
const SECTOR_GAP = (7 * Math.PI) / 180; // radians between cluster sectors
const MIN_SECTOR = (14 * Math.PI) / 180;
/** Tiers drawn inner → outer, so the legend and the rings read the same way. */
const TIER_ORDER: ConstellationTier[] = [
  "artefact_verified",
  "check_passed",
  "self_assessed",
  "in_progress",
  "not_started",
];

/**
 * Rounded to 2 decimals on purpose: trig results can differ in the last ulp
 * between the server's and the browser's math libraries, and React treats
 * `cy="624.21992963402740"` vs `…73` as a hydration mismatch. Two decimals in
 * a 1000-unit viewBox is far below a device pixel.
 */
function polar(r: number, angle: number): [number, number] {
  const round = (v: number) => Math.round(v * 100) / 100;
  return [round(CX + r * Math.cos(angle)), round(CY + r * Math.sin(angle))];
}

function nodeRadiusFor(count: number): number {
  if (count <= 40) return 9;
  if (count <= 120) return 7;
  if (count <= 250) return 5.5;
  return 4.5;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/* ── theme: tier → classes (design-system tokens + the profile's two accents) ── */

const TIER_NODE: Record<ConstellationTier, string> = {
  artefact_verified: "fill-emerald-300 stroke-emerald-200",
  check_passed: "fill-emerald-400/85 stroke-emerald-300",
  self_assessed: "fill-transparent stroke-foreground/55",
  in_progress: "fill-sky-400/55 stroke-sky-300/80",
  not_started: "fill-muted stroke-muted-foreground/35",
};

const TIER_PILL: Record<ConstellationTier, string> = {
  artefact_verified: "bg-emerald-400/10 text-emerald-300",
  check_passed: "bg-emerald-400/10 text-emerald-300",
  self_assessed: "border border-dashed border-border text-muted-foreground",
  in_progress: "bg-sky-400/10 text-sky-300",
  not_started: "bg-muted text-muted-foreground",
};

/** Legend rows. "Verified" appears once: rungs 2–3 share a word and a fill. */
const LEGEND: { tier: ConstellationTier; swatch: string }[] = [
  { tier: "check_passed", swatch: "bg-emerald-400/85 ring-1 ring-emerald-300" },
  { tier: "self_assessed", swatch: "border border-dashed border-foreground/55" },
  { tier: "in_progress", swatch: "bg-sky-400/55 ring-1 ring-sky-300/80" },
  { tier: "not_started", swatch: "bg-muted ring-1 ring-muted-foreground/35" },
];

/* ── layout ────────────────────────────────────────────────────────────────── */

type Placed = { node: ConstellationNode; x: number; y: number; angle: number };
type Sector = {
  id: string;
  label: string | null;
  start: number;
  end: number;
  mid: number;
  total: number;
  done: number;
};

/**
 * Radial layout: one angular sector per cluster (span ∝ concept count, with a
 * floor so small clusters stay legible), nodes spread evenly along the arc of
 * their tier's radius inside that sector. Deterministic — no randomness — so
 * the same record always draws the same map.
 */
function layout(data: ConstellationData): { sectors: Sector[]; placed: Placed[] } {
  const clusters = data.clusters.filter((c) => c.concepts.total > 0);
  if (clusters.length === 0) return { sectors: [], placed: [] };

  const totalConcepts = clusters.reduce((n, c) => n + c.concepts.total, 0);
  const usable = 2 * Math.PI - SECTOR_GAP * clusters.length;
  // Proportional spans, then lift any below the floor and renormalise once.
  let spans = clusters.map((c) => (c.concepts.total / totalConcepts) * usable);
  const lifted = spans.map((s) => Math.max(s, MIN_SECTOR));
  const scale = usable / lifted.reduce((a, b) => a + b, 0);
  spans = lifted.map((s) => s * scale);

  const sectors: Sector[] = [];
  let cursor = -Math.PI / 2 + SECTOR_GAP / 2; // start at 12 o'clock
  clusters.forEach((c, i) => {
    const start = cursor;
    const end = start + spans[i];
    sectors.push({
      id: c.id,
      label: c.label,
      start,
      end,
      mid: (start + end) / 2,
      total: c.concepts.total,
      done: c.concepts.done,
    });
    cursor = end + SECTOR_GAP;
  });

  const sectorById = new Map(sectors.map((s) => [s.id, s]));
  const placed: Placed[] = [];
  for (const s of sectors) {
    const mine = data.nodes.filter((n) => n.clusterId === s.id);
    for (const tier of TIER_ORDER) {
      const ring = mine.filter((n) => n.tier === tier);
      const r = TIER_RADIUS[tier];
      ring.forEach((node, i) => {
        const t = (i + 0.5) / ring.length;
        const angle = s.start + t * (s.end - s.start);
        const [x, y] = polar(r, angle);
        placed.push({ node, x, y, angle });
      });
    }
  }
  // Orphans (cluster unknown to the summary) still render, at the outer ring.
  for (const n of data.nodes) {
    if (!sectorById.has(n.clusterId)) {
      const [x, y] = polar(TIER_RADIUS.not_started, Math.PI / 2);
      placed.push({ node: n, x, y, angle: Math.PI / 2 });
    }
  }
  // Keep syllabus order so Tab walks the record the way the page lists it.
  const order = new Map(data.nodes.map((n, i) => [n.id, i]));
  placed.sort((a, b) => (order.get(a.node.id) ?? 0) - (order.get(b.node.id) ?? 0));
  return { sectors, placed };
}

/* ── component ─────────────────────────────────────────────────────────────── */

export function Constellation({
  data,
  className,
}: {
  data: ConstellationData;
  className?: string;
}) {
  const { sectors, placed } = useMemo(() => layout(data), [data]);
  const nodeR = nodeRadiusFor(data.nodes.length);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const nodeRefs = useRef<(SVGCircleElement | null)[]>([]);

  const selected = selectedId ? (placed.find((p) => p.node.id === selectedId) ?? null) : null;
  const hovered = hoveredId ? (placed.find((p) => p.node.id === hoveredId) ?? null) : null;

  // ── time: `t` is epoch ms, or null for the present (full record). ──
  const scrubbable = canScrub(data);
  const dated = useMemo(() => datedEvents(data), [data]);
  const firstMs = data.range.first ? Date.parse(data.range.first) : 0;
  const lastMs = data.range.last ? Date.parse(data.range.last) : 0;
  const [t, setT] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const rafRef = useRef<number | null>(null);
  const atIso = t == null ? null : new Date(t).toISOString();

  // Per-node state at T, computed once per T for all nodes (cheap: O(refs)).
  // Positions never move — only fill and opacity — so a sweep is a class swap
  // per circle, which is what keeps it at frame rate on a few hundred nodes.
  const stateAt = useMemo(() => {
    const m = new Map<string, { tier: ConstellationTier; verified: boolean }>();
    for (const n of data.nodes) m.set(n.id, nodeStateAt(n, atIso));
    return m;
  }, [data, atIso]);
  const verifiedAt = useMemo(() => {
    let n = 0;
    for (const s of stateAt.values()) if (s.verified) n += 1;
    return n;
  }, [stateAt]);
  const doneAtByCluster = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of data.nodes) {
      if (stateAt.get(n.id)?.verified) m.set(n.clusterId, (m.get(n.clusterId) ?? 0) + 1);
    }
    return m;
  }, [data, stateAt]);

  const stop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setPlaying(false);
  }, []);

  const play = useCallback(() => {
    if (!scrubbable || lastMs <= firstMs) return;
    stop();
    setPlaying(true);
    // Start from the beginning unless paused mid-sweep.
    const startT = t != null && t < lastMs ? t : firstMs;
    const startFrac = (startT - firstMs) / (lastMs - firstMs);
    const t0 = performance.now() - startFrac * SWEEP_MS;
    const tick = (now: number) => {
      const frac = Math.min(1, (now - t0) / SWEEP_MS);
      if (frac >= 1) {
        setT(null); // the present: everything, including undated evidence, lands
        rafRef.current = null;
        setPlaying(false);
        return;
      }
      setT(firstMs + frac * (lastMs - firstMs));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [scrubbable, firstMs, lastMs, t, stop]);

  useEffect(() => stop, [stop]);

  // Escape clears the selection from anywhere in the map.
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  if (data.nodes.length === 0) {
    return (
      <div
        className={cn(
          "border-border/60 bg-card/20 rounded-xl border border-dashed px-6 py-14 text-center",
          className,
        )}
      >
        <p className="font-serif text-2xl text-foreground/90">A record just beginning.</p>
        <p className="text-muted-foreground mx-auto mt-2 max-w-sm text-sm text-pretty">
          Concepts appear here as a syllabus takes shape; evidence lights them
          up as checks are passed and artefacts are finished.
        </p>
      </div>
    );
  }

  const onNodeKey = (e: KeyboardEvent<SVGCircleElement>, index: number, id: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setSelectedId((cur) => (cur === id ? null : id));
      return;
    }
    const step =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (step !== 0) {
      e.preventDefault();
      const next = (index + step + placed.length) % placed.length;
      nodeRefs.current[next]?.focus();
    }
  };

  const tipX = hovered
    ? Math.min(Math.max(hovered.x - 110, -VB_PAD_X + 8), VB + VB_PAD_X - 228)
    : 0;
  const tipAbove = hovered ? hovered.y > CY : false;

  return (
    <div className={cn("grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]", className)}>
      {/* ── the map ── */}
      <div className="relative">
        <svg
          viewBox={`${-VB_PAD_X} 0 ${VB + 2 * VB_PAD_X} ${VB}`}
          role="group"
          aria-label="Evidence map: one node per concept, fill shows its tier"
          className="animate-in fade-in h-auto w-full duration-700 select-none motion-reduce:animate-none"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedId(null);
          }}
        >
          {/* tier rings — faint guides, inner = verified */}
          {TIER_ORDER.map((tier) => (
            <circle
              key={tier}
              cx={CX}
              cy={CY}
              r={TIER_RADIUS[tier]}
              className="fill-none stroke-border"
              strokeWidth={1}
              strokeDasharray={tier === "self_assessed" ? "3 6" : undefined}
            />
          ))}

          {/* sector dividers + cluster labels */}
          {sectors.map((s) => {
            const [x1, y1] = polar(CENTER_R + 28, s.start - SECTOR_GAP / 2);
            const [x2, y2] = polar(LABEL_R - 24, s.start - SECTOR_GAP / 2);
            const [lx, ly] = polar(LABEL_R, s.mid);
            const cos = Math.cos(s.mid);
            const anchor = Math.abs(cos) < 0.25 ? "middle" : cos > 0 ? "start" : "end";
            const isActive =
              (selected?.node.clusterId ?? hovered?.node.clusterId) === s.id;
            return (
              <g key={s.id}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  className="stroke-border"
                  strokeWidth={1}
                />
                <text
                  x={lx}
                  y={ly}
                  textAnchor={anchor}
                  dominantBaseline="middle"
                  className={cn(
                    "text-[17px] font-medium tracking-wide transition-colors duration-200 motion-reduce:transition-none",
                    isActive ? "fill-foreground" : "fill-muted-foreground",
                  )}
                >
                  {s.label ? truncate(s.label, LABEL_MAX_CHARS) : ""}
                </text>
                <text
                  x={lx}
                  y={ly + 20}
                  textAnchor={anchor}
                  dominantBaseline="middle"
                  className="fill-muted-foreground/70 text-[13px] tabular-nums"
                >
                  {atIso == null ? s.done : (doneAtByCluster.get(s.id) ?? 0)} / {s.total}
                </text>
              </g>
            );
          })}

          {/* centre: the one headline number, labelled with the ladder's word */}
          <circle cx={CX} cy={CY} r={CENTER_R} className="fill-card/60 stroke-border" strokeWidth={1} />
          <text
            x={CX}
            y={CY - 6}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-foreground font-serif text-[56px] tabular-nums"
          >
            {atIso == null ? data.totals.verified : verifiedAt}
          </text>
          <text
            x={CX}
            y={CY + 34}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-muted-foreground text-[13px] tracking-[0.18em] uppercase"
          >
            {formatTierLabel("check_passed")}
          </text>
          <text
            x={CX}
            y={CY + 56}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-muted-foreground/70 text-[12px] tabular-nums"
          >
            of {data.totals.concepts}
          </text>

          {/* nodes */}
          {placed.map((p, i) => {
            const { node } = p;
            const isSelected = node.id === selectedId;
            const isHovered = node.id === hoveredId;
            const dimmed =
              selected != null && !isSelected && selected.node.clusterId !== node.clusterId;
            const date = formatEvidenceDate(node.occurredAt);
            // State at T: the fill a node shows now, and whether its evidence has landed yet.
            const st = stateAt.get(node.id) ?? { tier: node.tier, verified: node.verified };
            const pending = atIso != null && st.tier !== node.tier;
            const aria = [node.label ?? "Concept", formatTierLabel(node.tier), date]
              .filter(Boolean)
              .join(", ");
            return (
              <g
                key={node.id}
                className={cn(
                  dimmed && "opacity-35",
                  pending && !dimmed && "opacity-45",
                  "transition-opacity duration-200 motion-reduce:transition-none",
                )}
              >
                {st.tier === "artefact_verified" ? (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={nodeR + 4.5}
                    className="fill-none stroke-emerald-300/35"
                    strokeWidth={1.5}
                  />
                ) : null}
                {isSelected || isHovered ? (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={nodeR + 8}
                    className={cn("fill-none", isSelected ? "stroke-foreground/70" : "stroke-foreground/35")}
                    strokeWidth={1.5}
                  />
                ) : null}
                <circle
                  ref={(el) => {
                    nodeRefs.current[i] = el;
                  }}
                  cx={p.x}
                  cy={p.y}
                  r={isHovered || isSelected ? nodeR + 1.5 : nodeR}
                  tabIndex={0}
                  role="button"
                  aria-label={aria}
                  aria-pressed={isSelected}
                  className={cn(
                    TIER_NODE[st.tier],
                    "cursor-pointer outline-none transition-[r,fill] duration-150 focus-visible:stroke-ring focus-visible:stroke-[3px] motion-reduce:transition-none",
                  )}
                  strokeWidth={st.tier === "self_assessed" ? 1.75 : 1.25}
                  strokeDasharray={st.tier === "self_assessed" ? "3 2.5" : undefined}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedId((cur) => (cur === node.id ? null : node.id));
                  }}
                  onMouseEnter={() => setHoveredId(node.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onFocus={() => setHoveredId(node.id)}
                  onBlur={() => setHoveredId(null)}
                  onKeyDown={(e) => onNodeKey(e, i, node.id)}
                />
              </g>
            );
          })}

          {/* hover tooltip: name + date, nothing composed */}
          {hovered ? (
            <foreignObject
              x={tipX}
              y={tipAbove ? hovered.y - nodeR - 70 : hovered.y + nodeR + 14}
              width={220}
              height={60}
              className="pointer-events-none overflow-visible"
            >
              <div className="border-border bg-card inline-block max-w-[220px] rounded-md border px-2.5 py-1.5 text-xs shadow-md">
                <div className="text-foreground truncate font-medium">
                  {hovered.node.label ?? formatTierLabel(hovered.node.tier)}
                </div>
                <div className="text-muted-foreground truncate">
                  {hovered.node.label ? formatTierLabel(hovered.node.tier) : null}
                  {hovered.node.label && formatEvidenceDate(hovered.node.occurredAt) ? " · " : null}
                  {formatEvidenceDate(hovered.node.occurredAt)}
                </div>
              </div>
            </foreignObject>
          ) : null}
        </svg>

        {data.totals.verified === 0 ? (
          <p className="text-muted-foreground/70 mt-2 text-center text-xs">
            Nothing verified yet. The record fills from the centre outward as
            evidence lands.
          </p>
        ) : null}

        {/* ── time scrubber: the record growing. Hidden below 3 dated events. ── */}
        {scrubbable ? (
          <div className="border-border/50 mt-4 flex flex-col gap-2 border-t pt-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => (playing ? stop() : play())}
                aria-label={playing ? "Pause" : "Play the record from the beginning"}
                aria-pressed={playing}
                className="border-border/60 bg-card/40 text-foreground hover:bg-card flex size-8 shrink-0 items-center justify-center rounded-full border transition-colors motion-reduce:transition-none"
              >
                {playing ? (
                  <Pause className="size-3.5" aria-hidden />
                ) : (
                  <Play className="ml-0.5 size-3.5" aria-hidden />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={SLIDER_MAX}
                step={1}
                value={
                  t == null || lastMs <= firstMs
                    ? SLIDER_MAX
                    : Math.round(((t - firstMs) / (lastMs - firstMs)) * SLIDER_MAX)
                }
                onChange={(e) => {
                  stop();
                  const v = Number(e.target.value);
                  setT(v >= SLIDER_MAX ? null : firstMs + (v / SLIDER_MAX) * (lastMs - firstMs));
                }}
                aria-label="Record over time"
                aria-valuetext={formatEvidenceDate(atIso ?? data.range.last) ?? undefined}
                // Design token, not the browser's default blue. Inline because
                // `accent-foreground` is also the name of a shadcn colour token
                // and the utility resolves ambiguously.
                style={{ accentColor: "var(--foreground)" }}
                className="h-1.5 w-full cursor-pointer"
              />
              <span className="text-foreground/90 w-24 shrink-0 text-right text-xs tabular-nums">
                {atIso == null ? "Now" : formatEvidenceDate(atIso)}
              </span>
            </div>
            <div className="text-muted-foreground/70 flex items-baseline justify-between gap-3 text-[11px]">
              <span>{formatRecordSinceLabel(data.range.first)}</span>
              <span className="tabular-nums">
                {dated.length} dated evidence event{dated.length === 1 ? "" : "s"}
                {data.undatedEvents > 0 ? ` · ${data.undatedEvents} undated, shown at Now` : ""}
              </span>
            </div>
          </div>
        ) : null}
      </div>

      {/* ── side panel: legend, or the selected node's evidence ── */}
      <aside
        className="border-border/60 bg-card/30 flex h-fit flex-col gap-4 rounded-xl border p-5 lg:sticky lg:top-6"
        aria-live="polite"
      >
        {selected ? (
          <SelectedPanel placed={selected} onClose={() => setSelectedId(null)} />
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <h3 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                Legend
              </h3>
              <p className="text-muted-foreground/80 text-xs">
                Fill is the evidence tier. Verified work sits nearest the centre.
              </p>
            </div>
            <ul className="flex flex-col gap-2">
              {LEGEND.map(({ tier, swatch }) => (
                <li key={tier} className="flex items-center gap-2.5 text-sm">
                  <span className={cn("size-3 shrink-0 rounded-full", swatch)} aria-hidden />
                  <span className="text-foreground/90">{formatTierLabel(tier)}</span>
                  {tier === "check_passed" ? (
                    <span className="text-muted-foreground/70 text-xs">
                      · a ring marks an artefact
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground/70 border-border/50 border-t pt-3 text-xs">
              Select a node to see its evidence. Tab moves between nodes; arrow
              keys walk the record; Enter opens.
            </p>
          </>
        )}
      </aside>
    </div>
  );
}

function SelectedPanel({ placed, onClose }: { placed: Placed; onClose: () => void }) {
  const { node } = placed;
  const date = formatEvidenceDate(node.occurredAt);
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span
            className={cn(
              "w-fit rounded-full px-2 py-0.5 text-[11px] font-medium",
              TIER_PILL[node.tier],
            )}
          >
            {formatTierLabel(node.tier)}
          </span>
          <h3 className="text-foreground text-base font-medium tracking-tight text-pretty">
            {node.label ?? formatTierLabel(node.tier)}
          </h3>
          {date ? (
            <span className="text-muted-foreground/70 text-xs tabular-nums">{date}</span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-muted-foreground hover:text-foreground -mt-1 -mr-1 rounded-md p-1 transition-colors"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      {node.evidence.length > 0 ? (
        <ul className="flex flex-col gap-2.5">
          {node.evidence.map((ref, i) => (
            <li
              key={`${ref.kind}-${i}`}
              className="border-border/50 bg-background/40 flex flex-col gap-1.5 rounded-lg border px-3 py-2.5"
            >
              <span className="text-foreground/90 text-xs leading-relaxed">{ref.label}</span>
              {ref.kind === "artefact" && ref.url ? (
                <a
                  href={ref.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-foreground flex w-fit items-center gap-1 text-xs font-medium underline-offset-4 hover:underline"
                >
                  View work
                  <ExternalLink className="size-3" aria-hidden />
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground/80 text-xs">
          {node.tier === "self_assessed"
            ? "Marked understood, not yet backed by a competency check or project."
            : node.tier === "in_progress"
              ? "Being worked on. Not evidence."
              : "No evidence yet."}
        </p>
      )}
    </>
  );
}
