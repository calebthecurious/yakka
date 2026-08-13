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

/** Mirrors `artefact_type` in src/db/schema.ts. */
export type ArtefactType = "project" | "writeup" | "certificate" | "contribution";

/** Mirrors `resource_type` in src/db/schema.ts. */
export type ResourceType =
  | "course"
  | "book"
  | "video"
  | "article"
  | "project"
  | "paper";

/** Mirrors `resource_status` in src/db/schema.ts. */
export type ResourceStatus = "planned" | "consuming" | "completed" | "abandoned";

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
   * "done" signal — there is no artefact status enum. A pasted URL is NOT a
   * completion signal; see {@link isCompletedProject}. */
  verifiedAt: Date | string | null;
  /** `artefacts.demonstratedConceptIds`. May contain stale/foreign ids; they
   * are harmless because verification is evaluated per real concept. */
  demonstratedConceptIds: string[];
  /**
   * `artefacts.title`. OPTIONAL: needed only to render evidence provenance
   * ("Demonstrated in …"). Absent → the evidence entry carries a null title and
   * {@link formatEvidenceLabel} falls back to a generic phrase.
   */
  title?: string | null;
  /**
   * `artefacts.type`. OPTIONAL: needed only to count completed PROJECTS.
   * Absent → the artefact is counted in `coverage.artefactsWithoutType` and
   * never counted as a project, rather than silently assumed to be one.
   */
  type?: ArtefactType | null;
  /**
   * `artefacts.acceptanceCriteria`. OPTIONAL. Absent is indistinguishable from
   * an artefact that genuinely has none — both yield 0/0, which is correct.
   */
  acceptanceCriteria?: { done: boolean }[];
}

/**
 * A resource attached to a concept. Feeds the learning trail only — resources
 * are NEVER evidence and can never move the headline. Notes are deliberately
 * absent from this shape: they are private and must not reach a public surface.
 */
export interface ResourceInput {
  conceptId: string;
  type: ResourceType;
  status: ResourceStatus;
  title?: string | null;
  author?: string | null;
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
  /** OPTIONAL. Absent behaves exactly like "no completed resources": an empty
   * trail. Loaders that don't render a trail can omit it entirely. */
  resources?: ResourceInput[];
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

/* ── Evidence provenance ────────────────────────────────────────────────────
 * WHY a concept is verified, not just that it is. The public profile renders
 * this next to each verified competency, so it is derived HERE, under test,
 * rather than rebuilt inline by whichever surface happens to need it. */

/** One piece of backing evidence for one concept. */
export type ConceptEvidence =
  | { kind: "competency_check"; score: number; outOf: number }
  | { kind: "artefact"; artefactId: string; artefactTitle: string | null };

/** All evidence for one concept. Emitted ONLY for concepts that are verified;
 * a concept with no evidence has no entry (never an empty one). */
export interface ConceptEvidenceEntry {
  conceptId: string;
  clusterId: string;
  /** Competency-check evidence first, then artefacts in input order. */
  evidence: ConceptEvidence[];
}

/** Artefact counters at ARTEFACT grain. Distinct from
 * `breakdown.artefactsBacked`/`artefactsTargeted`, which count artefact-bearing
 * CLUSTERS (one milestone each) — two completed artefacts in one cluster are
 * 2 here and 1 there. Different units, both correct, never interchangeable. */
export interface ArtefactStats {
  /** Artefacts with `verifiedAt != null`. A pasted URL is not a completion. */
  completed: number;
  /** Completed artefacts whose type is 'project'. */
  projectsCompleted: number;
  /** Every artefact supplied, completed or not. */
  total: number;
}

/** Self-declared activity. NOT evidence and never in the headline — exposed so
 * a surface can say "in progress" honestly instead of inventing a number. */
export interface ActivitySignal {
  /** Concepts the user marked `learning`. */
  conceptsInProgress: number;
}

export interface TrailByType {
  type: ResourceType;
  count: number;
}

export interface TrailNamedResource {
  title: string | null;
  author: string | null;
  type: ResourceType;
}

/** Resources actually worked through. Inventory, never evidence. */
export interface LearningTrail {
  total: number;
  /** Counts per resource type, in first-seen order. */
  byType: TrailByType[];
  /** Up to {@link TRAIL_NAMED_LIMIT} named completed resources, input order. */
  named: TrailNamedResource[];
}

/** Where the input was incomplete. Non-zero means a derived count is a floor,
 * not a total — surfaces should prefer failing loudly over rendering it. */
export interface LedgerCoverage {
  /** Concepts with no `subSkillId`; they appear in no sub-skill row. */
  conceptsWithoutSubSkill: number;
  /** Artefacts with no `type`; they can never count as a completed project. */
  artefactsWithoutType: number;
}

export interface ReadinessLedger {
  headline: ReadinessHeadline;
  breakdown: ReadinessBreakdown;
  selfAssessed: SelfAssessedCounts;
  foundations: FoundationsSignal;
  /** Per-concept provenance for every verified concept. */
  evidence: ConceptEvidenceEntry[];
  artefacts: ArtefactStats;
  activity: ActivitySignal;
  trail: LearningTrail;
  coverage: LedgerCoverage;
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

/**
 * A concept is "in progress" iff the user marked it `learning`. Purely
 * self-declared: it is never evidence, never in the headline, and deliberately
 * has no evidence-gated counterpart — "I am working on this" is a claim only
 * the learner can make.
 */
export function isConceptInProgress(status: ConceptStatus): boolean {
  return status === "learning";
}

/**
 * A completed PROJECT: type 'project' AND actually verified. An artefact with a
 * pasted URL but no `verifiedAt` is not completed — the public profile
 * previously counted links as "shipped", which this rule replaces.
 */
export function isCompletedProject(artefact: ArtefactInput): boolean {
  return artefact.type === "project" && isArtefactBacked(artefact.verifiedAt);
}

/**
 * The highest PASSING score among a concept's checks, or null when none pass.
 * Failing and unfinished attempts are invisible — a learner is represented by
 * their best passing result, never penalised for having tried.
 */
export function bestPassingScore(
  checks: { score: number | null; completedAt: Date | string | null }[],
): number | null {
  let best: number | null = null;
  for (const c of checks) {
    if (!isCompetencyPass(c.score, c.completedAt)) continue;
    if (c.score != null && (best == null || c.score > best)) best = c.score;
  }
  return best;
}

/** Acceptance-criteria progress for one artefact. 0/0 when it has none. */
export function criteriaProgress(criteria: { done: boolean }[] | undefined): {
  done: number;
  total: number;
} {
  const list = criteria ?? [];
  return { done: list.filter((c) => c.done).length, total: list.length };
}

/** A resource counts toward the trail iff the learner finished it. */
export function isResourceCompleted(status: ResourceStatus): boolean {
  return status === "completed";
}

/** How many named resources the trail exposes. */
export const TRAIL_NAMED_LIMIT = 8;

/** Out of how many a competency check is scored. */
export const COMPETENCY_CHECK_OUT_OF = 5;

/**
 * The canonical human label for one piece of evidence. Kept beside the rule
 * that produces it so wording and semantics can never drift apart; a surface
 * renders what this returns rather than composing its own sentence.
 */
export function formatEvidenceLabel(evidence: ConceptEvidence): string {
  if (evidence.kind === "competency_check") {
    return `Competency check passed · ${evidence.score}/${evidence.outOf}`;
  }
  return evidence.artefactTitle == null
    ? "Demonstrated in a completed artefact"
    : `Demonstrated in “${evidence.artefactTitle}”`;
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

  // Evidence source 1 — passed competency checks, keyed by concept. The best
  // passing score is retained so provenance can name it.
  const passedConceptIds = new Set<string>();
  const checksByConcept = new Map<string, CompetencyCheckInput[]>();
  for (const ck of input.competencyChecks) {
    const list = checksByConcept.get(ck.conceptId) ?? [];
    list.push(ck);
    checksByConcept.set(ck.conceptId, list);
    if (isCompetencyPass(ck.score, ck.completedAt)) {
      passedConceptIds.add(ck.conceptId);
    }
  }

  // Evidence source 2 — concepts demonstrated by a backed (completed) artefact.
  // The backing artefacts are retained so provenance can name them.
  const demonstratedConceptIds = new Set<string>();
  const backingArtefacts = new Map<string, ArtefactInput[]>();
  for (const a of input.artefacts) {
    if (!isArtefactBacked(a.verifiedAt)) continue;
    for (const cid of a.demonstratedConceptIds) {
      demonstratedConceptIds.add(cid);
      const list = backingArtefacts.get(cid) ?? [];
      list.push(a);
      backingArtefacts.set(cid, list);
    }
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
  let conceptsInProgress = 0;
  const evidenceEntries: ConceptEvidenceEntry[] = [];
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

      // Provenance, derived from the SAME verdict that just counted it — the
      // evidence list can never disagree with the verified count.
      const items: ConceptEvidence[] = [];
      const best = bestPassingScore(checksByConcept.get(concept.id) ?? []);
      if (best != null) {
        items.push({
          kind: "competency_check",
          score: best,
          outOf: COMPETENCY_CHECK_OUT_OF,
        });
      }
      for (const a of backingArtefacts.get(concept.id) ?? []) {
        items.push({
          kind: "artefact",
          artefactId: a.id,
          artefactTitle: a.title ?? null,
        });
      }
      evidenceEntries.push({
        conceptId: concept.id,
        clusterId: concept.clusterId,
        evidence: items,
      });
    } else if (selfAssessed) {
      entry.conceptsSelfAssessed += 1;
      selfAssessedConcepts += 1;
    }

    if (isConceptInProgress(concept.status)) conceptsInProgress += 1;

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

  // Artefact-grain counters (NOT the cluster-grain milestone counters above).
  let artefactsCompleted = 0;
  let projectsCompleted = 0;
  let artefactsWithoutType = 0;
  for (const a of input.artefacts) {
    if (isArtefactBacked(a.verifiedAt)) artefactsCompleted += 1;
    if (isCompletedProject(a)) projectsCompleted += 1;
    if (a.type == null) artefactsWithoutType += 1;
  }

  // Learning trail — completed resources only. Inventory, never evidence.
  const completedResources = (input.resources ?? []).filter((r) =>
    isResourceCompleted(r.status),
  );
  const trailCounts = new Map<ResourceType, number>();
  for (const r of completedResources) {
    trailCounts.set(r.type, (trailCounts.get(r.type) ?? 0) + 1);
  }
  const trail: LearningTrail = {
    total: completedResources.length,
    byType: [...trailCounts.entries()].map(([type, count]) => ({ type, count })),
    named: completedResources.slice(0, TRAIL_NAMED_LIMIT).map((r) => ({
      title: r.title ?? null,
      author: r.author ?? null,
      type: r.type,
    })),
  };

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
    evidence: evidenceEntries,
    artefacts: {
      completed: artefactsCompleted,
      projectsCompleted,
      total: input.artefacts.length,
    },
    activity: { conceptsInProgress },
    trail,
    coverage: { conceptsWithoutSubSkill, artefactsWithoutType },
  };
}
