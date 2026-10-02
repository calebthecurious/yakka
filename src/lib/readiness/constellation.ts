/**
 * Constellation payload — the public profile's evidence map, derived from the
 * ledger and nothing else.
 *
 * Every claim (concept) is a node with a taxonomy tier, the date of its best
 * evidence, and click-through evidence refs; clusters group nodes via edges;
 * a time-ordered event list drives the scrubber. The component that draws it
 * receives THIS one serialisable object and composes no string and derives no
 * number of its own (single-truth rule: all of it is computed here, inside
 * src/lib/readiness/, from {@link computeReadinessLedger}'s output).
 *
 * Tiers follow docs/verification-taxonomy.md rungs 0–3. Rungs 4–5 and the
 * E-track states (attestations, process traces, revocation) are RESERVED there
 * and have no representation here yet; when the evidence spine lands (Plan v2
 * A4) they arrive as new `ConstellationEvidenceRef` kinds carrying the strings
 * the taxonomy already fixed — not as component-side wording.
 *
 * Labels are the one input the ledger does not have: it is id-only by design.
 * The loader passes display names and artefact URLs it already holds; mapping
 * an id to a name is not a derivation. A missing label is null, never invented.
 */

import {
  formatEvidenceLabelDated,
  type ConceptEvidence,
  type ConceptLedgerEntry,
  type ReadinessLedger,
} from "./model";
import { summarizeReadinessLedger } from "./summary";

/* ── Tiers ─────────────────────────────────────────────────────────────────── */

/**
 * The taxonomy rung a node sits on. A concept sits at exactly the highest rung
 * it has evidence for; `not_started` is "no rung" — nothing claimed, nothing
 * proven — and is kept distinct from rung 0 so the map can dim it rather than
 * mislabel it.
 */
export type ConstellationTier =
  | "not_started"
  | "in_progress" // rung 0 — self-declared `learning`
  | "self_assessed" // rung 1 — self-declared done, no evidence
  | "check_passed" // rung 2 — passed competency check
  | "artefact_verified"; // rung 3 — demonstrated in a completed artefact

/** Rung number per tier, per the taxonomy ladder. `null` = no rung. */
export const TIER_RUNG: Readonly<Record<ConstellationTier, 0 | 1 | 2 | 3 | null>> = {
  not_started: null,
  in_progress: 0,
  self_assessed: 1,
  check_passed: 2,
  artefact_verified: 3,
};

/** Tiers the taxonomy allows a surface to call "verified" (rungs 2–3). */
export const VERIFIED_TIERS: ReadonlySet<ConstellationTier> = new Set([
  "check_passed",
  "artefact_verified",
]);

/**
 * The tier for one ledger concept state. Rung 3 outranks rung 2 when a concept
 * has both; rung 1 is only reachable WITHOUT evidence (the ledger already
 * guarantees `selfAssessed` is false whenever `verified` is true).
 */
export function tierOf(state: ConceptLedgerEntry): ConstellationTier {
  if (state.artefactBacked) return "artefact_verified";
  if (state.checkPassed) return "check_passed";
  if (state.selfAssessed) return "self_assessed";
  if (state.inProgress) return "in_progress";
  return "not_started";
}

/* ── Labels (loader-supplied display data) ─────────────────────────────────── */

export interface ConstellationLabels {
  /** conceptId → display name. */
  concepts?: Readonly<Record<string, string>>;
  /** clusterId → display name. */
  clusters?: Readonly<Record<string, string>>;
  /** artefactId → public title/url. Title falls back to the ledger's own. */
  artefacts?: Readonly<
    Record<string, { title?: string | null; url?: string | null }>
  >;
}

/* ── Payload ───────────────────────────────────────────────────────────────── */

/** One click-through evidence item on a node. `label` is the taxonomy string. */
export type ConstellationEvidenceRef =
  | {
      kind: "competency_check";
      score: number;
      outOf: number;
      occurredAt: string | null;
      label: string;
    }
  | {
      kind: "artefact";
      artefactId: string;
      title: string | null;
      url: string | null;
      occurredAt: string | null;
      label: string;
    };

export interface ConstellationNode {
  /** Concept id. */
  id: string;
  /** Display name, or null when the loader supplied none. Never invented. */
  label: string | null;
  clusterId: string;
  subSkillId: string | null;
  tier: ConstellationTier;
  /** `TIER_RUNG[tier]`, duplicated so the component needs no lookup table. */
  rung: 0 | 1 | 2 | 3 | null;
  /** Identical to the ledger's verdict for this concept. */
  verified: boolean;
  /**
   * Self-declared `learning`, carried on its own axis because a verified
   * concept can also be in progress; the tier alone would hide that. Never
   * evidence. Σ over nodes equals `ledger.activity.conceptsInProgress`.
   */
  inProgress: boolean;
  /**
   * When the BEST evidence occurred: the earliest dated ref at the node's own
   * tier. Null when the node has no evidence, or its best evidence is undated.
   */
  occurredAt: string | null;
  /** Check evidence first, then artefacts in ledger order. Empty unless verified. */
  evidence: ConstellationEvidenceRef[];
}

export interface ConstellationCluster {
  id: string;
  label: string | null;
  /** `skill_clusters.weight`, for sizing. */
  weight: number;
  /** Concept-grain counts for this cluster — the summary's, verbatim. */
  concepts: { done: number; total: number; selfAssessed: number; pct: number };
}

/** A grouping edge: cluster → concept. One per node. */
export interface ConstellationEdge {
  source: string;
  target: string;
}

/** One evidence occurrence for the scrubber. One per evidence ref, so an
 * artefact demonstrating three concepts yields three events (one per claim). */
export interface ConstellationEvent {
  /** ISO instant, or null for undated evidence — sorted last, never dropped. */
  at: string | null;
  kind: ConstellationEvidenceRef["kind"];
  conceptId: string;
  clusterId: string;
  artefactId: string | null;
  score: number | null;
  label: string;
}

export interface ConstellationData {
  nodes: ConstellationNode[];
  clusters: ConstellationCluster[];
  edges: ConstellationEdge[];
  /** Ascending by `at`; undated events last, in node order. */
  events: ConstellationEvent[];
  /** Scrubber bounds over DATED events. Both null when none are dated. */
  range: { first: string | null; last: string | null };
  /** How many events have no date — a floor on what the scrubber can place. */
  undatedEvents: number;
  /** Node counts per tier. Sum equals `nodes.length`. */
  totals: {
    concepts: number;
    verified: number;
    selfAssessed: number;
    inProgress: number;
    notStarted: number;
  };
}

/* ── The projection ────────────────────────────────────────────────────────── */

function refFor(
  e: ConceptEvidence,
  labels: ConstellationLabels,
): ConstellationEvidenceRef {
  const label = formatEvidenceLabelDated(e);
  if (e.kind === "competency_check") {
    return {
      kind: "competency_check",
      score: e.score,
      outOf: e.outOf,
      occurredAt: e.occurredAt,
      label,
    };
  }
  const extra = labels.artefacts?.[e.artefactId];
  return {
    kind: "artefact",
    artefactId: e.artefactId,
    title: extra?.title ?? e.artefactTitle ?? null,
    url: extra?.url ?? null,
    occurredAt: e.occurredAt,
    label,
  };
}

/** Earliest dated ref among those at the node's own tier; null otherwise. */
function bestOccurredAt(
  tier: ConstellationTier,
  refs: ConstellationEvidenceRef[],
): string | null {
  const wantKind =
    tier === "artefact_verified"
      ? "artefact"
      : tier === "check_passed"
        ? "competency_check"
        : null;
  if (wantKind == null) return null;
  let best: string | null = null;
  for (const r of refs) {
    if (r.kind !== wantKind || r.occurredAt == null) continue;
    if (best == null || r.occurredAt < best) best = r.occurredAt;
  }
  return best;
}

/**
 * Build the Constellation payload from a computed ledger. Pure, deterministic,
 * O(concepts + evidence). Invariants (asserted in constellation.test.ts):
 *  - every node's tier agrees with the ledger's verdict for that concept
 *  - Σ nodes by tier equals the ledger's verified / self-assessed / in-progress
 *    counts, and per cluster equals the summary's concept counts
 *  - events.length === Σ nodes[].evidence.length === Σ ledger.evidence[].evidence.length
 *  - the payload survives JSON round-tripping unchanged
 *  - an empty ledger yields a valid, empty payload
 */
export function constellationData(
  ledger: ReadinessLedger,
  labels: ConstellationLabels = {},
): ConstellationData {
  const summary = summarizeReadinessLedger(ledger);
  const evidenceByConcept = new Map(
    ledger.evidence.map((e) => [e.conceptId, e.evidence] as const),
  );

  const nodes: ConstellationNode[] = [];
  const edges: ConstellationEdge[] = [];
  const events: ConstellationEvent[] = [];
  const totals = { concepts: 0, verified: 0, selfAssessed: 0, inProgress: 0, notStarted: 0 };

  for (const state of ledger.conceptStates) {
    const tier = tierOf(state);
    const refs = (evidenceByConcept.get(state.conceptId) ?? []).map((e) =>
      refFor(e, labels),
    );

    nodes.push({
      id: state.conceptId,
      label: labels.concepts?.[state.conceptId] ?? null,
      clusterId: state.clusterId,
      subSkillId: state.subSkillId,
      tier,
      rung: TIER_RUNG[tier],
      verified: state.verified,
      inProgress: state.inProgress,
      occurredAt: bestOccurredAt(tier, refs),
      evidence: refs,
    });
    edges.push({ source: state.clusterId, target: state.conceptId });

    for (const r of refs) {
      events.push({
        at: r.occurredAt,
        kind: r.kind,
        conceptId: state.conceptId,
        clusterId: state.clusterId,
        artefactId: r.kind === "artefact" ? r.artefactId : null,
        score: r.kind === "competency_check" ? r.score : null,
        label: r.label,
      });
    }

    totals.concepts += 1;
    if (VERIFIED_TIERS.has(tier)) totals.verified += 1;
    else if (tier === "self_assessed") totals.selfAssessed += 1;
    else if (tier === "in_progress") totals.inProgress += 1;
    else totals.notStarted += 1;
  }

  // Dated first, ascending (ISO strings sort lexicographically); undated last.
  // Stable, so ties and undated events keep node order.
  const dated = events.filter((e) => e.at != null);
  const undated = events.filter((e) => e.at == null);
  dated.sort((a, b) => (a.at as string).localeCompare(b.at as string));
  const ordered = [...dated, ...undated];

  const clusters: ConstellationCluster[] = summary.byCluster.map((c) => ({
    id: c.clusterId,
    label: labels.clusters?.[c.clusterId] ?? null,
    weight: c.weight,
    concepts: { ...c.concepts },
  }));

  return {
    nodes,
    clusters,
    edges,
    events: ordered,
    range: {
      first: dated.length > 0 ? dated[0].at : null,
      last: dated.length > 0 ? dated[dated.length - 1].at : null,
    },
    undatedEvents: undated.length,
    totals,
  };
}
