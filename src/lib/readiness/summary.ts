/**
 * Readiness summary — cheap projections of the ledger for non-profile surfaces.
 *
 * The workspace header, syllabus tree, and goal mandala need done/total counts
 * per cluster and an overall percentage at render frequency. This module gives
 * them exactly that, WITHOUT a second computation: `summarizeReadinessLedger`
 * is a pure projection over the OUTPUT of {@link computeReadinessLedger}, so
 * every number it returns is arithmetically forced by the ledger and cannot
 * drift from it. There is no path from raw rows to a summary — the ledger is
 * always the intermediate step.
 *
 * Percentage convention: `pct` is 0–100 EVERYWHERE in this module, matching
 * `ReadinessHeadline.pct`. (The existing tree/mandala code uses a 0–1 fraction
 * and multiplies by 100 at the render site; those surfaces will need to drop
 * that multiply when they migrate. No surface changes here.)
 *
 * Deliberately NOT provided, because the ledger cannot support it and a
 * plausible-looking guess would be worse than an absent field:
 *  - foundations `have_it` — `FoundationsSignal` exposes `needIt`/`total` only,
 *    and `total - needIt` is not `have_it` because `unset` is a third state.
 *    That one still needs a model change, not a summary change.
 *
 * Previously-absent fields that the model now carries, so they are projected
 * here rather than re-derived by a surface:
 *  - per-sub-skill counts (`bySubSkill`) — the reducer accumulates them in the
 *    same concept pass as the cluster roll-up. Populated only for concepts whose
 *    loader supplied a `subSkillId`; check `subSkillCoverage` before treating
 *    `bySubSkill` as exhaustive.
 *  - concepts-only per-cluster counts (`ClusterSummary.concepts`) — the cluster
 *    contribution now splits the artefact-target milestone out, so a surface can
 *    render a concept denominator without touching raw rows.
 */

import type {
  ActivitySignal,
  ArtefactStats,
  ConceptEvidenceEntry,
  LearningTrail,
  LedgerCoverage,
  ReadinessLedger,
} from "./model";

/**
 * Percentage in [0, 100], with the divide-by-zero guard the surfaces keep
 * re-implementing. 0 (never NaN) when there is nothing to measure.
 */
export function ratioPct(done: number, total: number): number {
  return total > 0 ? (done / total) * 100 : 0;
}

/** One cluster's milestone counts, ready to render as a ring/bar/fraction. */
export interface ClusterSummary {
  clusterId: string;
  /** `skill_clusters.weight`, passed through for surfaces that want to size by it. */
  weight: number;
  /** Completed milestones in this cluster (verified concepts + backed artefact target). */
  done: number;
  /** Total milestones in this cluster (concepts + 1 if artefact-bearing). */
  total: number;
  /** done/total as 0–100. */
  pct: number;
  /**
   * Concept-only view of the same cluster — the artefact-target milestone
   * excluded. Use this where the denominator must stay "concepts" (what the
   * tree and mandala render today); use `done`/`total` for the milestone view
   * that reconciles with the headline.
   */
  concepts: { done: number; total: number; selfAssessed: number; pct: number };
}

/**
 * One sub-skill's CONCEPT counts. There is no milestone view here: the
 * artefact-target milestone belongs to the cluster, not the sub-skill, so these
 * roll up to `ClusterSummary.concepts`, never to `ClusterSummary.total`.
 */
export interface SubSkillSummary {
  subSkillId: string;
  clusterId: string;
  /** Evidence-verified concepts in this sub-skill. */
  done: number;
  /** All concepts in this sub-skill. */
  total: number;
  /** Self-declared-done here with no backing evidence. */
  selfAssessed: number;
  /** done/total as 0–100. */
  pct: number;
}

export interface ReadinessSummary {
  /**
   * UNWEIGHTED milestone roll-up — the "3 / 7 done" reading. Equals
   * Σ byCluster.done / Σ byCluster.total. This is NOT the headline: it ignores
   * cluster weight. Use it for counts; use `weighted` for the headline number.
   */
  overall: { done: number; total: number; pct: number };
  /** The weighted headline, passed through verbatim from `ledger.headline`. */
  weighted: { completed: number; total: number; pct: number };
  /** Concept milestones. `selfAssessed` is self-declared and NOT in `verified`. */
  concepts: { verified: number; total: number; selfAssessed: number };
  /**
   * Artefact-target milestones. NOTE: `backed`/`targeted` count CLUSTERS (each
   * bearing cluster is one milestone), not artefact rows; `selfAssessed` counts
   * unverified artefact ROWS. They are different units on purpose.
   */
  artefacts: { backed: number; targeted: number; selfAssessed: number };
  /** Per-cluster counts, in the ledger's cluster order. */
  byCluster: ClusterSummary[];
  /** Per-sub-skill concept counts, in the ledger's first-seen order. */
  bySubSkill: SubSkillSummary[];
  /**
   * How much of the syllabus `bySubSkill` actually accounts for. `complete` is
   * false when any concept reached the ledger without a `subSkillId`, in which
   * case `bySubSkill` is a partial view and must not be summed as if it were
   * the whole. Lets a surface fail loudly instead of rendering short totals.
   */
  subSkillCoverage: {
    complete: boolean;
    conceptsCovered: number;
    conceptsMissing: number;
  };
  /** Foundations signal, passed through verbatim from `ledger.foundations`. */
  foundations: { needIt: number; total: number };
  /**
   * Per-concept evidence provenance, for every verified concept. Render it with
   * `formatEvidenceLabel` rather than composing a sentence at the call site.
   */
  evidence: ConceptEvidenceEntry[];
  /**
   * ARTEFACT-grain counters. Note `artefactCounts.completed` counts artefacts
   * while `artefacts.backed` above counts artefact-bearing CLUSTERS — two
   * completed artefacts in one cluster are 2 and 1 respectively.
   */
  artefactCounts: ArtefactStats;
  /** Self-declared activity. Never evidence, never in the headline. */
  activity: ActivitySignal;
  /** Completed resources. Inventory, never evidence. */
  trail: LearningTrail;
  /** Where the input was incomplete; non-zero means a count is a floor. */
  coverage: LedgerCoverage;
}

/**
 * Project a computed ledger into the cheap shapes the non-profile surfaces
 * need. Pure, O(clusters), no I/O, no caching.
 *
 * Guaranteed invariants (asserted in summary.test.ts against the reducer):
 *  - overall.done  === breakdown.conceptsVerified + breakdown.artefactsBacked
 *  - overall.total === breakdown.conceptsTotal    + breakdown.artefactsTargeted
 *  - overall.done  === Σ byCluster.done, overall.total === Σ byCluster.total
 *  - weighted      === headline, field for field
 *
 * Note this does not make the LEDGER cheap — it makes the projection cheap. The
 * cost is in loading the tree and reducing it; measure that before adding any
 * memoisation.
 */
export function summarizeReadinessLedger(
  ledger: ReadinessLedger,
): ReadinessSummary {
  const byCluster: ClusterSummary[] = ledger.breakdown.clusterWeightsApplied.map(
    (c) => ({
      clusterId: c.clusterId,
      weight: c.weight,
      done: c.milestonesCompleted,
      total: c.milestonesTotal,
      pct: ratioPct(c.milestonesCompleted, c.milestonesTotal),
      concepts: {
        done: c.conceptsVerified,
        total: c.conceptsTotal,
        selfAssessed: c.conceptsSelfAssessed,
        pct: ratioPct(c.conceptsVerified, c.conceptsTotal),
      },
    }),
  );

  const bySubSkill: SubSkillSummary[] = ledger.breakdown.subSkillsApplied.map(
    (s) => ({
      subSkillId: s.subSkillId,
      clusterId: s.clusterId,
      done: s.conceptsVerified,
      total: s.conceptsTotal,
      selfAssessed: s.conceptsSelfAssessed,
      pct: ratioPct(s.conceptsVerified, s.conceptsTotal),
    }),
  );

  const conceptsMissing = ledger.breakdown.conceptsWithoutSubSkill;
  const conceptsCovered = ledger.breakdown.conceptsTotal - conceptsMissing;

  // Roll up from the per-cluster contributions rather than re-deriving from the
  // breakdown counters: same numbers by the ledger's own invariant, but sourced
  // from a single place so a future model change can only break them together.
  let done = 0;
  let total = 0;
  for (const c of byCluster) {
    done += c.done;
    total += c.total;
  }

  return {
    overall: { done, total, pct: ratioPct(done, total) },
    weighted: {
      completed: ledger.headline.weightedCompleted,
      total: ledger.headline.weightedTotal,
      pct: ledger.headline.pct,
    },
    concepts: {
      verified: ledger.breakdown.conceptsVerified,
      total: ledger.breakdown.conceptsTotal,
      selfAssessed: ledger.selfAssessed.concepts,
    },
    artefacts: {
      backed: ledger.breakdown.artefactsBacked,
      targeted: ledger.breakdown.artefactsTargeted,
      selfAssessed: ledger.selfAssessed.artefacts,
    },
    byCluster,
    bySubSkill,
    subSkillCoverage: {
      complete: conceptsMissing === 0,
      conceptsCovered,
      conceptsMissing,
    },
    foundations: {
      needIt: ledger.foundations.needIt,
      total: ledger.foundations.total,
    },
    evidence: ledger.evidence,
    artefactCounts: ledger.artefacts,
    activity: ledger.activity,
    trail: ledger.trail,
    coverage: ledger.coverage,
  };
}

/**
 * Look up one cluster's summary by id. Returns null for an unknown id rather
 * than a zero-filled row, so a surface can tell "no such cluster" apart from
 * "cluster with nothing done".
 */
export function findClusterSummary(
  summary: ReadinessSummary,
  clusterId: string,
): ClusterSummary | null {
  return summary.byCluster.find((c) => c.clusterId === clusterId) ?? null;
}

/**
 * Look up one sub-skill's summary by id. Returns null when the sub-skill has no
 * row — which means either "no such sub-skill" or "its concepts reached the
 * ledger without a subSkillId". Check `summary.subSkillCoverage.complete` to
 * tell those apart rather than rendering a zero.
 */
export function findSubSkillSummary(
  summary: ReadinessSummary,
  subSkillId: string,
): SubSkillSummary | null {
  return summary.bySubSkill.find((s) => s.subSkillId === subSkillId) ?? null;
}

/** Every sub-skill row belonging to one cluster, in ledger order. */
export function subSkillsForCluster(
  summary: ReadinessSummary,
  clusterId: string,
): SubSkillSummary[] {
  return summary.bySubSkill.filter((s) => s.clusterId === clusterId);
}

/**
 * One concept's evidence, or null when it has none. Null means "not verified" —
 * there are no empty evidence entries, so a null here and an absent row are the
 * same fact.
 */
export function findConceptEvidence(
  summary: ReadinessSummary,
  conceptId: string,
): ConceptEvidenceEntry | null {
  return summary.evidence.find((e) => e.conceptId === conceptId) ?? null;
}
