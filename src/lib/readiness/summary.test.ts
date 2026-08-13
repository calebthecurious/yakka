import { describe, it, expect } from "vitest";
import {
  PASS_BAR,
  computeReadinessLedger,
  type ArtefactInput,
  type ClusterInput,
  type CompetencyCheckInput,
  type ConceptInput,
  type ConceptStatus,
  type FoundationItemInput,
  type FoundationUserStatus,
  type ReadinessInput,
  type ReadinessLedger,
} from "./model";
import {
  findClusterSummary,
  findSubSkillSummary,
  ratioPct,
  subSkillsForCluster,
  summarizeReadinessLedger,
} from "./summary";

/* ── fixture builders (mirrors model.test.ts) ───────────────────────────── */

function cluster(
  id: string,
  weight: number,
  isArtefactBearing = false,
): ClusterInput {
  return { id, weight, isArtefactBearing };
}

function concept(
  id: string,
  clusterId: string,
  status: ConceptStatus = "not_started",
  subSkillId: string | null = null,
): ConceptInput {
  return { id, clusterId, status, subSkillId };
}

function passedCheck(conceptId: string, score = PASS_BAR): CompetencyCheckInput {
  return { conceptId, score, completedAt: new Date("2026-01-01") };
}

/** Completed but below the bar — evidence that must NOT verify. */
function failedCheck(conceptId: string, score = PASS_BAR - 1): CompetencyCheckInput {
  return { conceptId, score, completedAt: new Date("2026-01-01") };
}

/** Started but never finished — no completedAt, so not evidence at all. */
function incompleteCheck(conceptId: string): CompetencyCheckInput {
  return { conceptId, score: null, completedAt: null };
}

function backedArtefact(
  id: string,
  clusterId: string,
  demonstrates: string[] = [],
): ArtefactInput {
  return {
    id,
    clusterId,
    verifiedAt: new Date("2026-01-01"),
    demonstratedConceptIds: demonstrates,
  };
}

function unbackedArtefact(
  id: string,
  clusterId: string,
  demonstrates: string[] = [],
): ArtefactInput {
  return { id, clusterId, verifiedAt: null, demonstratedConceptIds: demonstrates };
}

function baseline(userStatus: FoundationUserStatus): FoundationItemInput {
  return { type: "assumed_baseline", userStatus };
}

/* ── the fixture matrix ─────────────────────────────────────────────────── */

/** Empty workspace — nothing generated, nothing done. */
const EMPTY: ReadinessInput = {
  clusters: [],
  concepts: [],
  competencyChecks: [],
  artefacts: [],
  foundationItems: [],
};

/** A generated syllabus where nothing at all is verified. */
const ALL_UNVERIFIED: ReadinessInput = {
  clusters: [cluster("A", 3, true), cluster("B", 2, false)],
  concepts: [
    concept("a1", "A", "not_started", "ssA1"),
    concept("a2", "A", "learning", "ssA1"),
    // Self-declared done with zero evidence — must not count as verified.
    concept("a3", "A", "understood", "ssA2"),
    concept("b1", "B", "verified", "ssB1"),
  ],
  competencyChecks: [incompleteCheck("a2")],
  artefacts: [unbackedArtefact("artA", "A", ["a1", "a3"])],
  foundationItems: [baseline("need_it"), baseline("unset")],
};

/** Passing and failing checks side by side across two clusters. */
const MIXED_CHECKS: ReadinessInput = {
  clusters: [cluster("A", 5, true), cluster("B", 2, false)],
  concepts: [
    // ssA1 straddles a pass and a fail; ssA2 is entirely unverified.
    concept("a1", "A", "learning", "ssA1"),
    concept("a2", "A", "learning", "ssA1"),
    concept("a3", "A", "understood", "ssA2"),
    concept("b1", "B", "learning", "ssB1"),
    concept("b2", "B", "not_started", "ssB1"),
  ],
  competencyChecks: [
    passedCheck("a1", 5),
    failedCheck("a2", 3),
    failedCheck("a3", 1),
    passedCheck("b1", PASS_BAR),
    incompleteCheck("b2"),
  ],
  artefacts: [],
  foundationItems: [baseline("need_it"), baseline("have_it"), baseline("unset")],
};

/** Backed artefacts carrying both the artefact-target milestone and concept evidence. */
const VERIFIED_ARTEFACTS: ReadinessInput = {
  clusters: [cluster("A", 4, true), cluster("B", 1, true), cluster("C", 3, false)],
  concepts: [
    // Both A concepts sit in ONE sub-skill, so a fully-demonstrated sub-skill
    // rolls up to 2/2 while its cluster is 3/3 (concepts + artefact target).
    concept("a1", "A", "not_started", "ssA1"),
    concept("a2", "A", "not_started", "ssA1"),
    concept("b1", "B", "learning", "ssB1"),
    concept("c1", "C", "not_started", "ssC1"),
  ],
  competencyChecks: [],
  artefacts: [
    // Two backed artefacts in one cluster → still ONE artefact-target milestone.
    backedArtefact("artA1", "A", ["a1"]),
    backedArtefact("artA2", "A", ["a2"]),
    // Bearing cluster with only an unbacked artefact → target NOT backed.
    unbackedArtefact("artB", "B", ["b1"]),
  ],
  foundationItems: [],
};

/** Every evidence class at once: passed check, demonstrated-by-backed-artefact,
 *  failed check, incomplete check, unbacked artefact, and self-declaration. */
const EVERY_EVIDENCE_CLASS: ReadinessInput = {
  clusters: [cluster("A", 5, true), cluster("B", 2, true), cluster("C", 1, false)],
  concepts: [
    // ssA1 holds both evidence classes; ssA2 holds both non-evidence classes.
    concept("a1", "A", "learning", "ssA1"), // verified via passed check
    concept("a2", "A", "not_started", "ssA1"), // verified via backed artefact
    concept("a3", "A", "understood", "ssA2"), // failed check → self-assessed only
    concept("a4", "A", "learning", "ssA2"), // incomplete check → nothing
    concept("b1", "B", "verified", "ssB1"), // unbacked artefact → self-assessed only
    concept("c1", "C", "not_started", "ssC1"), // untouched
  ],
  competencyChecks: [
    passedCheck("a1", 5),
    failedCheck("a3", 2),
    incompleteCheck("a4"),
  ],
  artefacts: [backedArtefact("artA", "A", ["a2"]), unbackedArtefact("artB", "B", ["b1"])],
  foundationItems: [baseline("need_it"), baseline("need_it"), baseline("have_it")],
};

/**
 * The pre-wiring state: a loader that does not yet supply `subSkillId`. The
 * headline and cluster roll-up must be unaffected; only the sub-skill view is
 * empty, and coverage must say so rather than reporting a silent zero.
 */
const NO_SUBSKILL_IDS: ReadinessInput = {
  ...MIXED_CHECKS,
  concepts: MIXED_CHECKS.concepts.map((c) => ({ ...c, subSkillId: null })),
};

/** Same, via an omitted key rather than an explicit null. */
const SUBSKILL_KEY_ABSENT: ReadinessInput = {
  ...MIXED_CHECKS,
  concepts: MIXED_CHECKS.concepts.map(({ id, clusterId, status }) => ({
    id,
    clusterId,
    status,
  })),
};

const FIXTURES: { name: string; input: ReadinessInput }[] = [
  { name: "empty workspace", input: EMPTY },
  { name: "all unverified", input: ALL_UNVERIFIED },
  { name: "mixed passed/failed checks", input: MIXED_CHECKS },
  { name: "verified artefacts", input: VERIFIED_ARTEFACTS },
  { name: "every evidence class", input: EVERY_EVIDENCE_CLASS },
  { name: "loader supplies no subSkillId", input: NO_SUBSKILL_IDS },
  { name: "subSkillId key absent entirely", input: SUBSKILL_KEY_ABSENT },
];

/* ── the invariant contract, enforced over every fixture ────────────────── */

/**
 * The single-source-of-truth check: a summary must be arithmetically forced by
 * the ledger it was projected from. Any drift here means a parallel path crept
 * in.
 */
function expectSummaryMatchesLedger(ledger: ReadinessLedger) {
  const s = summarizeReadinessLedger(ledger);
  const b = ledger.breakdown;

  // Unweighted roll-up === breakdown counters.
  expect(s.overall.done).toBe(b.conceptsVerified + b.artefactsBacked);
  expect(s.overall.total).toBe(b.conceptsTotal + b.artefactsTargeted);

  // Unweighted roll-up === sum of the per-cluster rows it was built from.
  expect(s.byCluster.reduce((n, c) => n + c.done, 0)).toBe(s.overall.done);
  expect(s.byCluster.reduce((n, c) => n + c.total, 0)).toBe(s.overall.total);

  // Weighted block is the headline verbatim.
  expect(s.weighted.completed).toBe(ledger.headline.weightedCompleted);
  expect(s.weighted.total).toBe(ledger.headline.weightedTotal);
  expect(s.weighted.pct).toBe(ledger.headline.pct);

  // Pass-throughs.
  expect(s.concepts).toEqual({
    verified: b.conceptsVerified,
    total: b.conceptsTotal,
    selfAssessed: ledger.selfAssessed.concepts,
  });
  expect(s.artefacts).toEqual({
    backed: b.artefactsBacked,
    targeted: b.artefactsTargeted,
    selfAssessed: ledger.selfAssessed.artefacts,
  });
  expect(s.foundations).toEqual(ledger.foundations);

  // One summary row per ledger cluster row, same order, same ids and weights.
  expect(s.byCluster.map((c) => c.clusterId)).toEqual(
    b.clusterWeightsApplied.map((c) => c.clusterId),
  );
  expect(s.byCluster.map((c) => c.weight)).toEqual(
    b.clusterWeightsApplied.map((c) => c.weight),
  );

  // Percentages are real numbers in range, and consistent with their own counts.
  const inRange = (p: number) =>
    Number.isFinite(p) && !Number.isNaN(p) && p >= 0 && p <= 100;
  expect(inRange(s.overall.pct)).toBe(true);
  expect(inRange(s.weighted.pct)).toBe(true);
  expect(s.overall.pct).toBe(ratioPct(s.overall.done, s.overall.total));
  for (const c of s.byCluster) {
    expect(inRange(c.pct)).toBe(true);
    expect(c.pct).toBe(ratioPct(c.done, c.total));
    expect(c.done).toBeLessThanOrEqual(c.total);
  }

  /* ── concept-only split reconciles with the milestone view ─────────────── */

  for (const [i, c] of s.byCluster.entries()) {
    const led = b.clusterWeightsApplied[i];
    // The milestone identity: milestones === concepts + the artefact target.
    expect(c.concepts.total + led.artefactTargeted).toBe(c.total);
    expect(c.concepts.done + led.artefactBacked).toBe(c.done);
    expect(led.artefactTargeted === 0 || led.artefactTargeted === 1).toBe(true);
    expect(led.artefactBacked).toBeLessThanOrEqual(led.artefactTargeted);
    expect(inRange(c.concepts.pct)).toBe(true);
    expect(c.concepts.pct).toBe(ratioPct(c.concepts.done, c.concepts.total));
    expect(c.concepts.done).toBeLessThanOrEqual(c.concepts.total);
  }
  // Concept counters reconcile across the whole syllabus.
  expect(s.byCluster.reduce((n, c) => n + c.concepts.total, 0)).toBe(
    s.concepts.total,
  );
  expect(s.byCluster.reduce((n, c) => n + c.concepts.done, 0)).toBe(
    s.concepts.verified,
  );
  expect(s.byCluster.reduce((n, c) => n + c.concepts.selfAssessed, 0)).toBe(
    s.concepts.selfAssessed,
  );

  /* ── sub-skill totals sum to their cluster's CONCEPT totals ────────────── */

  // Coverage is self-consistent and describes the real gap.
  expect(s.subSkillCoverage.conceptsCovered + s.subSkillCoverage.conceptsMissing)
    .toBe(s.concepts.total);
  expect(s.subSkillCoverage.complete).toBe(
    s.subSkillCoverage.conceptsMissing === 0,
  );
  expect(s.bySubSkill.reduce((n, x) => n + x.total, 0)).toBe(
    s.subSkillCoverage.conceptsCovered,
  );

  // Every sub-skill row is well formed and points at a real cluster.
  const clusterIds = new Set(s.byCluster.map((c) => c.clusterId));
  const seenSubSkillIds = new Set<string>();
  for (const x of s.bySubSkill) {
    expect(clusterIds.has(x.clusterId)).toBe(true);
    expect(seenSubSkillIds.has(x.subSkillId)).toBe(false); // no duplicate rows
    seenSubSkillIds.add(x.subSkillId);
    expect(inRange(x.pct)).toBe(true);
    expect(x.pct).toBe(ratioPct(x.done, x.total));
    expect(x.done).toBeLessThanOrEqual(x.total);
    expect(x.done + x.selfAssessed).toBeLessThanOrEqual(x.total);
    expect(findSubSkillSummary(s, x.subSkillId)).toEqual(x);
  }

  // THE LOCK: per cluster, its sub-skill rows sum to its concept counts —
  // exactly when coverage is complete, and never exceeding them otherwise.
  for (const c of s.byCluster) {
    const rows = subSkillsForCluster(s, c.clusterId);
    const rowTotal = rows.reduce((n, x) => n + x.total, 0);
    const rowDone = rows.reduce((n, x) => n + x.done, 0);
    const rowSelf = rows.reduce((n, x) => n + x.selfAssessed, 0);

    if (s.subSkillCoverage.complete) {
      expect(rowTotal).toBe(c.concepts.total);
      expect(rowDone).toBe(c.concepts.done);
      expect(rowSelf).toBe(c.concepts.selfAssessed);
      // And explicitly NOT the milestone total, whenever the two differ.
      if (c.total !== c.concepts.total) expect(rowTotal).not.toBe(c.total);
    } else {
      expect(rowTotal).toBeLessThanOrEqual(c.concepts.total);
      expect(rowDone).toBeLessThanOrEqual(c.concepts.done);
    }
  }
}

describe("summarizeReadinessLedger — totals always equal ledger totals", () => {
  for (const { name, input } of FIXTURES) {
    it(name, () => {
      expectSummaryMatchesLedger(computeReadinessLedger(input));
    });
  }

  it("is pure — repeated calls on the same ledger deep-equal", () => {
    const led = computeReadinessLedger(EVERY_EVIDENCE_CLASS);
    expect(summarizeReadinessLedger(led)).toEqual(summarizeReadinessLedger(led));
  });
});

/* ── sub-skill grain ────────────────────────────────────────────────────── */

describe("summarizeReadinessLedger — per-sub-skill rollups", () => {
  it("mixed evidence: sub-skill rows sum to their cluster's CONCEPT totals", () => {
    const s = summarizeReadinessLedger(
      computeReadinessLedger(EVERY_EVIDENCE_CLASS),
    );

    expect(s.subSkillCoverage).toEqual({
      complete: true,
      conceptsCovered: 6,
      conceptsMissing: 0,
    });

    // ssA1: a1 (passed check) + a2 (backed artefact) → both verified.
    expect(findSubSkillSummary(s, "ssA1")).toEqual({
      subSkillId: "ssA1",
      clusterId: "A",
      done: 2,
      total: 2,
      selfAssessed: 0,
      pct: 100,
    });
    // ssA2: a3 (failed check, self-declared) + a4 (incomplete check) → 0 verified.
    expect(findSubSkillSummary(s, "ssA2")).toEqual({
      subSkillId: "ssA2",
      clusterId: "A",
      done: 0,
      total: 2,
      selfAssessed: 1,
      pct: 0,
    });

    // Cluster A: sub-skills sum to its CONCEPT counts (2/4), NOT its milestone
    // counts (3/5) — the artefact target lives on the cluster, not a sub-skill.
    const a = findClusterSummary(s, "A")!;
    const aRows = subSkillsForCluster(s, "A");
    expect(aRows.reduce((n, x) => n + x.total, 0)).toBe(a.concepts.total); // 4
    expect(aRows.reduce((n, x) => n + x.done, 0)).toBe(a.concepts.done); // 2
    expect(a.concepts.total).toBe(4);
    expect(a.total).toBe(5); // milestone view still includes the target
  });

  it("a fully-demonstrated sub-skill reads 100% inside a cluster that is not", () => {
    const s = summarizeReadinessLedger(
      computeReadinessLedger(VERIFIED_ARTEFACTS),
    );

    // ssB1's only concept is demonstrated by an UNBACKED artefact → 0/1.
    expect(findSubSkillSummary(s, "ssB1")).toEqual({
      subSkillId: "ssB1",
      clusterId: "B",
      done: 0,
      total: 1,
      selfAssessed: 0,
      pct: 0,
    });
    // ssA1 is fully verified via two backed artefacts.
    expect(findSubSkillSummary(s, "ssA1")?.pct).toBe(100);
  });

  it("groups by cluster without duplicating or dropping rows", () => {
    const s = summarizeReadinessLedger(computeReadinessLedger(MIXED_CHECKS));

    expect(s.bySubSkill.map((x) => x.subSkillId)).toEqual([
      "ssA1",
      "ssA2",
      "ssB1",
    ]);
    expect(subSkillsForCluster(s, "A").map((x) => x.subSkillId)).toEqual([
      "ssA1",
      "ssA2",
    ]);
    expect(subSkillsForCluster(s, "B").map((x) => x.subSkillId)).toEqual(["ssB1"]);
    expect(subSkillsForCluster(s, "nope")).toEqual([]);
    expect(findSubSkillSummary(s, "nope")).toBeNull();

    // ssA1 holds one pass (a1) and one fail (a2).
    expect(findSubSkillSummary(s, "ssA1")).toEqual({
      subSkillId: "ssA1",
      clusterId: "A",
      done: 1,
      total: 2,
      selfAssessed: 0,
      pct: 50,
    });
  });

  it("no subSkillId → empty rollup, coverage reports the gap, cluster view intact", () => {
    const wired = summarizeReadinessLedger(computeReadinessLedger(MIXED_CHECKS));
    for (const input of [NO_SUBSKILL_IDS, SUBSKILL_KEY_ABSENT]) {
      const s = summarizeReadinessLedger(computeReadinessLedger(input));

      expect(s.bySubSkill).toEqual([]);
      expect(s.subSkillCoverage).toEqual({
        complete: false,
        conceptsCovered: 0,
        conceptsMissing: 5,
      });

      // Everything ABOVE sub-skill grain is byte-identical to the wired fixture:
      // adding the dimension changed no existing number.
      expect(s.overall).toEqual(wired.overall);
      expect(s.weighted).toEqual(wired.weighted);
      expect(s.concepts).toEqual(wired.concepts);
      expect(s.artefacts).toEqual(wired.artefacts);
      expect(s.byCluster).toEqual(wired.byCluster);
      expect(s.foundations).toEqual(wired.foundations);
    }
  });
});

/* ── per-fixture hand-computed expectations ─────────────────────────────── */

describe("summarizeReadinessLedger — fixture specifics", () => {
  it("empty workspace → all zeros, 0%, no NaN, empty byCluster", () => {
    const s = summarizeReadinessLedger(computeReadinessLedger(EMPTY));

    expect(s.overall).toEqual({ done: 0, total: 0, pct: 0 });
    expect(s.weighted).toEqual({ completed: 0, total: 0, pct: 0 });
    expect(s.concepts).toEqual({ verified: 0, total: 0, selfAssessed: 0 });
    expect(s.artefacts).toEqual({ backed: 0, targeted: 0, selfAssessed: 0 });
    expect(s.byCluster).toEqual([]);
    expect(s.foundations).toEqual({ needIt: 0, total: 0 });
    expect(Number.isNaN(s.overall.pct)).toBe(false);
  });

  it("all unverified → 0 done against a real denominator, self-assessment visible", () => {
    const s = summarizeReadinessLedger(computeReadinessLedger(ALL_UNVERIFIED));

    // Milestones: A = 3 concepts + 1 artefact target = 4; B = 1 concept. Total 5.
    expect(s.overall).toEqual({ done: 0, total: 5, pct: 0 });
    expect(s.weighted.completed).toBe(0);
    expect(s.weighted.total).toBe(3 * 4 + 2 * 1); // 14
    expect(s.weighted.pct).toBe(0);

    // a3 (understood) and b1 (verified) are self-declared with no evidence.
    expect(s.concepts).toEqual({ verified: 0, total: 4, selfAssessed: 2 });
    expect(s.artefacts).toEqual({ backed: 0, targeted: 1, selfAssessed: 1 });

    expect(findClusterSummary(s, "A")).toEqual({
      clusterId: "A",
      weight: 3,
      done: 0,
      total: 4,
      pct: 0,
      concepts: { done: 0, total: 3, selfAssessed: 1, pct: 0 },
    });
    expect(findClusterSummary(s, "B")).toEqual({
      clusterId: "B",
      weight: 2,
      done: 0,
      total: 1,
      pct: 0,
      concepts: { done: 0, total: 1, selfAssessed: 1, pct: 0 },
    });
  });

  it("mixed passed/failed checks → only passes count; failures fall to self-assessed", () => {
    const s = summarizeReadinessLedger(computeReadinessLedger(MIXED_CHECKS));

    // Verified: a1 (5/5) and b1 (exactly PASS_BAR). a2/a3 failed, b2 incomplete.
    expect(s.concepts.verified).toBe(2);
    expect(s.concepts.total).toBe(5);
    // a3 is 'understood' but its check failed → self-assessed, not verified.
    expect(s.concepts.selfAssessed).toBe(1);

    // Milestones: A = 3 concepts + 1 target = 4 (1 done); B = 2 concepts (1 done).
    expect(s.overall).toEqual({ done: 2, total: 6, pct: (2 / 6) * 100 });

    expect(findClusterSummary(s, "A")).toEqual({
      clusterId: "A",
      weight: 5,
      done: 1,
      total: 4,
      pct: 25,
      concepts: { done: 1, total: 3, selfAssessed: 1, pct: (1 / 3) * 100 },
    });
    expect(findClusterSummary(s, "B")).toEqual({
      clusterId: "B",
      weight: 2,
      done: 1,
      total: 2,
      pct: 50,
      concepts: { done: 1, total: 2, selfAssessed: 0, pct: 50 },
    });

    // Weighted diverges from unweighted — the heavy cluster is the laggard.
    expect(s.weighted.completed).toBe(5 * 1 + 2 * 1); // 7
    expect(s.weighted.total).toBe(5 * 4 + 2 * 2); // 24
    expect(s.weighted.pct).toBeLessThan(s.overall.pct);
  });

  it("verified artefacts → one target milestone per bearing cluster, however many artefacts", () => {
    const s = summarizeReadinessLedger(computeReadinessLedger(VERIFIED_ARTEFACTS));

    // Two backed artefacts in cluster A collapse to ONE backed target milestone.
    expect(s.artefacts.backed).toBe(1);
    expect(s.artefacts.targeted).toBe(2); // clusters A and B are bearing
    expect(s.artefacts.selfAssessed).toBe(1); // the unbacked artB row

    // Both A concepts are demonstrated by backed artefacts → verified.
    expect(s.concepts.verified).toBe(2);
    expect(s.concepts.total).toBe(4);

    // A: 2 concepts + 1 target = 3, all done. B: 1 concept + 1 target = 2, none
    // done (its artefact is unbacked). C: 1 concept, not done.
    expect(findClusterSummary(s, "A")).toEqual({
      clusterId: "A",
      weight: 4,
      done: 3,
      total: 3,
      pct: 100,
      concepts: { done: 2, total: 2, selfAssessed: 0, pct: 100 },
    });
    expect(findClusterSummary(s, "B")).toEqual({
      clusterId: "B",
      weight: 1,
      done: 0,
      total: 2,
      pct: 0,
      concepts: { done: 0, total: 1, selfAssessed: 0, pct: 0 },
    });
    expect(findClusterSummary(s, "C")).toEqual({
      clusterId: "C",
      weight: 3,
      done: 0,
      total: 1,
      pct: 0,
      concepts: { done: 0, total: 1, selfAssessed: 0, pct: 0 },
    });

    expect(s.overall).toEqual({ done: 3, total: 6, pct: 50 });
  });

  it("every evidence class → each class lands in exactly one bucket", () => {
    const s = summarizeReadinessLedger(
      computeReadinessLedger(EVERY_EVIDENCE_CLASS),
    );

    // Verified: a1 (passed check) + a2 (demonstrated by backed artefact).
    expect(s.concepts.verified).toBe(2);
    expect(s.concepts.total).toBe(6);
    // Self-assessed: a3 (understood, failed check) + b1 (verified, unbacked artefact).
    expect(s.concepts.selfAssessed).toBe(2);
    // a4 (incomplete check, still 'learning') is in neither bucket.

    expect(s.artefacts).toEqual({ backed: 1, targeted: 2, selfAssessed: 1 });

    // A: 4 concepts + 1 target = 5, done 3 (a1, a2, target).
    // B: 1 concept + 1 target = 2, done 0. C: 1 concept, done 0.
    expect(findClusterSummary(s, "A")).toEqual({
      clusterId: "A",
      weight: 5,
      done: 3,
      total: 5,
      pct: 60,
      concepts: { done: 2, total: 4, selfAssessed: 1, pct: 50 },
    });
    expect(s.overall).toEqual({ done: 3, total: 8, pct: (3 / 8) * 100 });
    expect(s.foundations).toEqual({ needIt: 2, total: 3 });
  });
});

/* ── helpers ────────────────────────────────────────────────────────────── */

describe("ratioPct", () => {
  it("returns 0 rather than NaN when there is nothing to measure", () => {
    expect(ratioPct(0, 0)).toBe(0);
    expect(Number.isNaN(ratioPct(0, 0))).toBe(false);
  });

  it("scales to 0–100, not 0–1", () => {
    expect(ratioPct(1, 4)).toBe(25);
    expect(ratioPct(4, 4)).toBe(100);
    expect(ratioPct(0, 4)).toBe(0);
  });
});

describe("findClusterSummary", () => {
  it("returns null for an unknown id, distinguishing it from a zero row", () => {
    const s = summarizeReadinessLedger(computeReadinessLedger(ALL_UNVERIFIED));
    expect(findClusterSummary(s, "nope")).toBeNull();
    expect(findClusterSummary(s, "B")?.total).toBe(1);
  });
});
