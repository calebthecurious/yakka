/**
 * Readiness ledger — pure model.
 *
 * The single source of truth for the "role readiness" headline and its
 * breakdown. This module is intentionally **DB-free**: it contains only types,
 * constants, rule predicates, and one pure reducer over already-loaded plain
 * data. The loader that reads Drizzle and calls `computeReadinessLedger` lives
 * elsewhere; keeping the math here makes it auditable and unit-testable without
 * a database.
 *
 * The rules below are product-defining. See docs/readiness-ledger-model.md for
 * the prose derivation and the rationale behind each one.
 *
 * Honesty contract (do not soften):
 *  - The headline is pure arithmetic over DEFINED, EVIDENCE-GATED milestones:
 *    weightedCompleted / weightedTotal. It is never a probability and never a
 *    "chance of being hired". It must be fully reconstructable from the
 *    breakdown and must never be rendered without it.
 *  - A concept counts as VERIFIED only with backing evidence (a passed
 *    competency check at >= PASS_BAR, or a completed artefact that demonstrates
 *    it). Raw `concepts.status` is NOT trusted — self-declared understood/
 *    verified without evidence is tracked separately as self-assessed.
 *  - An artefact counts toward the headline only when `verifiedAt != null`.
 *  - Foundations (self-declared baselines) are guidance, never part of the
 *    headline; they are exposed as a separate signal.
 */

/** Pass bar for a competency check, out of 5. The ONE pass bar — import this
 * everywhere; never inline a numeric pass threshold. */
export const PASS_BAR = 4;

/** The only label the headline is ever rendered under. Not "chance of hire",
 * not "score" — a defined, reconstructable ratio of completed work. */
export const READINESS_LABEL = "role readiness";

/* ── Enum mirrors ───────────────────────────────────────────────────────────
 * String-literal unions that mirror the pg enums in src/db/schema.ts. Declared
 * locally (not imported) so this module pulls in no DB/ORM code. If the schema
 * enums change, update these to match. */

/** Mirrors `concept_status` in src/db/schema.ts. */
export type ConceptStatus = "not_started" | "learning" | "understood" | "verified";

/** Mirrors `foundation_item_type` in src/db/schema.ts. */
export type FoundationItemType = "assumed_baseline" | "launch_step";

/** Mirrors `foundation_user_status` in src/db/schema.ts. */
export type FoundationUserStatus = "have_it" | "need_it" | "unset";

/* ── Input shapes ───────────────────────────────────────────────────────────
 * Minimal plain projections of the loaded tree. The loader is responsible for
 * resolving each artefact/concept to its parent cluster id (artefacts attach at
 * the sub-skill level in the schema; the cluster is one hop up). Timestamps are
 * accepted as Date | string | null and treated only for presence (non-null). */

export interface ClusterInput {
  id: string;
  /** `skill_clusters.weight`, 1–5 (schema default 3). Used verbatim as the
   * milestone weight — no normalization, no re-scaling. */
  weight: number;
  /** `skill_clusters.isArtefactBearing`. Only bearing clusters define an
   * artefact-target milestone. */
  isArtefactBearing: boolean;
}

export interface ConceptInput {
  id: string;
  /** Parent cluster id (resolved by the loader). */
  clusterId: string;
  /**
   * Parent sub-skill id. OPTIONAL: the ledger's headline and cluster roll-up
   * do not need it, so a loader that omits it still produces a correct ledger —
   * it simply produces no sub-skill roll-up. Concepts without one are counted
   * in `breakdown.conceptsWithoutSubSkill` so the gap is visible rather than
   * silently yielding empty sub-skill rows.
   */
  subSkillId?: string | null;
  /** Raw self-declared `concepts.status`. Used ONLY to detect self-assessment;
   * never trusted as verification evidence. */
  status: ConceptStatus;
}

export interface CompetencyCheckInput {
  conceptId: string;
  /** `competency_checks.score`, 0–5, or null if not completed. */
  score: number | null;
  /** `competency_checks.completedAt`. Non-null = the check was taken. */
  completedAt: Date | string | null;
}

export interface ArtefactInput {
  id: string;
  /** Parent cluster id (resolved by the loader from sub_skill → cluster). */
  clusterId: string;
  /** `artefacts.verifiedAt`. Non-null = completed/backed. The ONLY artefact
   * "done" signal — there is no artefact status enum. */
  verifiedAt: Date | string | null;
  /** `artefacts.demonstratedConceptIds`. May contain stale/foreign ids; they
   * are harmless because verification is evaluated per real concept. */
  demonstratedConceptIds: string[];
}

export interface FoundationItemInput {
  type: FoundationItemType;
  userStatus: FoundationUserStatus;
}

export interface ReadinessInput {
  clusters: ClusterInput[];
  concepts: ConceptInput[];
  competencyChecks: CompetencyCheckInput[];
  artefacts: ArtefactInput[];
  foundationItems: FoundationItemInput[];
}

/* ── Output shape: the full ReadinessLedger ────────────────────────────────── */

export interface ReadinessHeadline {
  /** weightedCompleted / weightedTotal * 100, in [0, 100]. 0 when there are no
   * milestones. NOT rounded here — presentation decides rounding. */
  pct: number;
  weightedCompleted: number;
  weightedTotal: number;
}

/** One cluster's full contribution to the headline — the raw numbers behind the
 * weighted roll-up, so the headline is reconstructable per cluster. */
export interface ClusterWeightContribution {
  clusterId: string;
  /** The cluster weight applied to every milestone in this cluster. */
  weight: number;
  /** Concepts in this cluster + 1 if the cluster is artefact-bearing. */
  milestonesTotal: number;
  /** Verified concepts + (1 if the artefact target is backed). */
  milestonesCompleted: number;
  /** weight * milestonesTotal. */
  weightedTotal: number;
  /** weight * milestonesCompleted. */
  weightedCompleted: number;
  /* ── Concept-only split of the two milestone counters above. Lets a surface
   * render a concept-grained denominator (what the tree/mandala show today)
   * without re-deriving anything from raw rows, and makes the milestone
   * identity checkable: milestonesTotal === conceptsTotal + artefactTargeted. */
  /** Concept milestones in this cluster, EXCLUDING the artefact target. */
  conceptsTotal: number;
  /** Evidence-verified concepts in this cluster. */
  conceptsVerified: number;
  /** Self-declared-done concepts here with no backing evidence. */
  conceptsSelfAssessed: number;
  /** 1 when this cluster defines an artefact-target milestone, else 0. */
  artefactTargeted: number;
  /** 1 when that target is backed by a completed artefact, else 0. */
  artefactBacked: number;
}

/**
 * One sub-skill's concept roll-up. Sub-skills carry CONCEPT milestones only —
 * the artefact-target milestone is defined per artefact-bearing CLUSTER, not
 * per sub-skill, so it is deliberately absent here. That is why these totals
 * sum to their cluster's `conceptsTotal`, never its `milestonesTotal`.
 *
 * Present only for concepts whose loader supplied a `subSkillId`.
 */
export interface SubSkillContribution {
  subSkillId: string;
  /** Parent cluster, so a consumer can group without a second lookup. */
  clusterId: string;
  conceptsTotal: number;
  conceptsVerified: number;
  conceptsSelfAssessed: number;
}

export interface ReadinessBreakdown {
  /** Concepts with backing evidence (passed check OR demonstrated by a backed
   * artefact). */
  conceptsVerified: number;
  /** All concepts in the syllabus (every concept is one defined milestone). */
  conceptsTotal: number;
  /** Artefact-bearing clusters whose target has >= 1 completed artefact. */
  artefactsBacked: number;
  /** Artefact-bearing clusters (each defines exactly one artefact-target
   * milestone). */
  artefactsTargeted: number;
  /** Per-cluster contributions; Σ weightedCompleted / Σ weightedTotal equals the
   * headline exactly. */
  clusterWeightsApplied: ClusterWeightContribution[];
  /**
   * Per-sub-skill concept roll-ups, in first-seen order. Empty when the loader
   * supplies no `subSkillId` — see `conceptsWithoutSubSkill`. Σ conceptsTotal
   * over a cluster's rows equals that cluster's `conceptsTotal` MINUS its
   * share of `conceptsWithoutSubSkill`.
   */
  subSkillsApplied: SubSkillContribution[];
  /**
   * Concepts that carried no `subSkillId` and so appear in no sub-skill row.
   * 0 once the loader populates it; non-zero means sub-skill roll-ups are
   * incomplete and a consumer should not treat them as exhaustive.
   */
  conceptsWithoutSubSkill: number;
}

/** Self-declared, NOT evidence-backed. Surfaced apart from the headline, never
 * folded into it. */
export interface SelfAssessedCounts {
  /** Concepts marked understood/verified by the user without backing evidence. */
  concepts: number;
  /** Logged artefacts with `verifiedAt == null`. */
  artefacts: number;
}

/** Foundations signal — self-declared baselines. Guidance, never a gate, never
 * in the headline. */
export interface FoundationsSignal {
  /** assumed_baseline items the user marked `need_it`. */
  needIt: number;
  /** Total assumed_baseline items. */
  total: number;
}

export interface ReadinessLedger {
  headline: ReadinessHeadline;
  breakdown: ReadinessBreakdown;
  selfAssessed: SelfAssessedCounts;
  foundations: FoundationsSignal;
}

/* ── Rule predicates (pure) ─────────────────────────────────────────────────
 * Exported so the rules are importable and testable in isolation. */

/** A competency check is a pass iff it was completed and scored at or above the
 * single PASS_BAR. */
export function isCompetencyPass(
  score: number | null,
  completedAt: Date | string | null,
): boolean {
  return completedAt != null && score != null && score >= PASS_BAR;
}

/** An artefact is backed iff it has been verified (`verifiedAt != null`). */
export function isArtefactBacked(verifiedAt: Date | string | null): boolean {
  return verifiedAt != null;
}

/** A concept status counts as self-declared "done" iff understood or verified.
 * (Verification evidence is evaluated separately; this is only the user's mark.) */
export function isSelfDeclaredDone(status: ConceptStatus): boolean {
  return status === "understood" || status === "verified";
}

/* ── The pure reducer ───────────────────────────────────────────────────────── */

/**
 * Compute the readiness ledger from already-loaded plain data. Pure: no DB, no
 * I/O, deterministic. See docs/readiness-ledger-model.md for the audited
 * derivation. Invariants it guarantees:
 *  - headline.weightedCompleted === Σ clusterWeightsApplied[].weightedCompleted
 *  - headline.weightedTotal     === Σ clusterWeightsApplied[].weightedTotal
 *  - Σ clusterWeightsApplied[].milestonesTotal === conceptsTotal + artefactsTargeted
 *  - per cluster: milestonesTotal     === conceptsTotal + artefactTargeted
 *  - per cluster: milestonesCompleted === conceptsVerified + artefactBacked
 *  - Σ subSkillsApplied[].conceptsTotal + conceptsWithoutSubSkill === conceptsTotal
 *  - per cluster: Σ its subSkillsApplied[].conceptsTotal <= its conceptsTotal
 *    (equal once every concept carries a subSkillId)
 */
export function computeReadinessLedger(input: ReadinessInput): ReadinessLedger {
  const weightByCluster = new Map<string, number>();
  for (const c of input.clusters) weightByCluster.set(c.id, c.weight);

  // Evidence source 1 — passed competency checks, keyed by concept.
  const passedConceptIds = new Set<string>();
  for (const ck of input.competencyChecks) {
    if (isCompetencyPass(ck.score, ck.completedAt)) {
      passedConceptIds.add(ck.conceptId);
    }
  }

  // Evidence source 2 — concepts demonstrated by a backed (completed) artefact.
  const demonstratedConceptIds = new Set<string>();
  for (const a of input.artefacts) {
    if (!isArtefactBacked(a.verifiedAt)) continue;
    for (const cid of a.demonstratedConceptIds) demonstratedConceptIds.add(cid);
  }

  const conceptIsVerified = (conceptId: string): boolean =>
    passedConceptIds.has(conceptId) || demonstratedConceptIds.has(conceptId);

  // Per-cluster accumulator. Seed every known cluster so the audit array is
  // complete even for clusters with zero milestones. Unknown cluster ids (which
  // FK integrity should prevent) fall back to weight 0.
  type Acc = {
    weight: number;
    total: number;
    completed: number;
    conceptsTotal: number;
    conceptsVerified: number;
    conceptsSelfAssessed: number;
    artefactTargeted: number;
    artefactBacked: number;
  };
  const acc = new Map<string, Acc>();
  const ensure = (clusterId: string): Acc => {
    let entry = acc.get(clusterId);
    if (!entry) {
      entry = {
        weight: weightByCluster.get(clusterId) ?? 0,
        total: 0,
        completed: 0,
        conceptsTotal: 0,
        conceptsVerified: 0,
        conceptsSelfAssessed: 0,
        artefactTargeted: 0,
        artefactBacked: 0,
      };
      acc.set(clusterId, entry);
    }
    return entry;
  };
  for (const c of input.clusters) ensure(c.id);

  // Sub-skill accumulator, filled from the SAME concept pass as the cluster one
  // below — there is no second traversal and no second verification rule, so the
  // two grains cannot disagree.
  type SubAcc = {
    clusterId: string;
    conceptsTotal: number;
    conceptsVerified: number;
    conceptsSelfAssessed: number;
  };
  const subAcc = new Map<string, SubAcc>();
  const ensureSub = (subSkillId: string, clusterId: string): SubAcc => {
    let entry = subAcc.get(subSkillId);
    if (!entry) {
      entry = {
        clusterId,
        conceptsTotal: 0,
        conceptsVerified: 0,
        conceptsSelfAssessed: 0,
      };
      subAcc.set(subSkillId, entry);
    }
    return entry;
  };

  // Concept milestones — one per concept, completed iff evidence-verified.
  let conceptsVerified = 0;
  let selfAssessedConcepts = 0;
  let conceptsWithoutSubSkill = 0;
  for (const concept of input.concepts) {
    const entry = ensure(concept.clusterId);
    entry.total += 1;
    entry.conceptsTotal += 1;

    // Evaluated once; both grains and both totals below read this same verdict.
    const verified = conceptIsVerified(concept.id);
    const selfAssessed = !verified && isSelfDeclaredDone(concept.status);

    if (verified) {
      entry.completed += 1;
      entry.conceptsVerified += 1;
      conceptsVerified += 1;
    } else if (selfAssessed) {
      entry.conceptsSelfAssessed += 1;
      selfAssessedConcepts += 1;
    }

    if (concept.subSkillId != null) {
      const sub = ensureSub(concept.subSkillId, concept.clusterId);
      sub.conceptsTotal += 1;
      if (verified) sub.conceptsVerified += 1;
      else if (selfAssessed) sub.conceptsSelfAssessed += 1;
    } else {
      conceptsWithoutSubSkill += 1;
    }
  }

  // Artefact-target milestones — one per artefact-bearing cluster, completed iff
  // the cluster has >= 1 backed artefact.
  const clusterHasBackedArtefact = new Set<string>();
  for (const a of input.artefacts) {
    if (isArtefactBacked(a.verifiedAt)) clusterHasBackedArtefact.add(a.clusterId);
  }

  let artefactsTargeted = 0;
  let artefactsBacked = 0;
  for (const c of input.clusters) {
    if (!c.isArtefactBearing) continue;
    artefactsTargeted += 1;
    const entry = ensure(c.id);
    entry.total += 1;
    entry.artefactTargeted = 1;
    if (clusterHasBackedArtefact.has(c.id)) {
      artefactsBacked += 1;
      entry.completed += 1;
      entry.artefactBacked = 1;
    }
  }

  const selfAssessedArtefacts = input.artefacts.filter(
    (a) => !isArtefactBacked(a.verifiedAt),
  ).length;

  // Weighted roll-up over every accumulated cluster (preserves insertion order:
  // declared clusters first, any orphans last).
  const clusterWeightsApplied: ClusterWeightContribution[] = [];
  let weightedCompleted = 0;
  let weightedTotal = 0;
  for (const [clusterId, entry] of acc) {
    const wTotal = entry.weight * entry.total;
    const wCompleted = entry.weight * entry.completed;
    weightedTotal += wTotal;
    weightedCompleted += wCompleted;
    clusterWeightsApplied.push({
      clusterId,
      weight: entry.weight,
      milestonesTotal: entry.total,
      milestonesCompleted: entry.completed,
      weightedTotal: wTotal,
      weightedCompleted: wCompleted,
      conceptsTotal: entry.conceptsTotal,
      conceptsVerified: entry.conceptsVerified,
      conceptsSelfAssessed: entry.conceptsSelfAssessed,
      artefactTargeted: entry.artefactTargeted,
      artefactBacked: entry.artefactBacked,
    });
  }

  const subSkillsApplied: SubSkillContribution[] = [];
  for (const [subSkillId, entry] of subAcc) {
    subSkillsApplied.push({
      subSkillId,
      clusterId: entry.clusterId,
      conceptsTotal: entry.conceptsTotal,
      conceptsVerified: entry.conceptsVerified,
      conceptsSelfAssessed: entry.conceptsSelfAssessed,
    });
  }

  const pct = weightedTotal > 0 ? (weightedCompleted / weightedTotal) * 100 : 0;

  // Foundations — assumed_baseline items only; launch_steps carry no userStatus.
  const baselines = input.foundationItems.filter(
    (f) => f.type === "assumed_baseline",
  );
  const needIt = baselines.filter((f) => f.userStatus === "need_it").length;

  return {
    headline: { pct, weightedCompleted, weightedTotal },
    breakdown: {
      conceptsVerified,
      conceptsTotal: input.concepts.length,
      artefactsBacked,
      artefactsTargeted,
      clusterWeightsApplied,
      subSkillsApplied,
      conceptsWithoutSubSkill,
    },
    selfAssessed: {
      concepts: selfAssessedConcepts,
      artefacts: selfAssessedArtefacts,
    },
    foundations: { needIt, total: baselines.length },
  };
}
