import { describe, it, expect } from "vitest";
import {
  PASS_BAR,
  computeReadinessLedger,
  isArtefactBacked,
  isCompetencyPass,
  isSelfDeclaredDone,
  type ArtefactInput,
  type ClusterInput,
  type CompetencyCheckInput,
  type ConceptInput,
  type ConceptStatus,
  type FoundationItemInput,
  type FoundationUserStatus,
  type ReadinessInput,
} from "./model";

/* ── fixture builders ───────────────────────────────────────────────────── */

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
): ConceptInput {
  return { id, clusterId, status };
}

function passedCheck(conceptId: string, score = PASS_BAR): CompetencyCheckInput {
  return { conceptId, score, completedAt: new Date("2026-01-01") };
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
  return {
    id,
    clusterId,
    verifiedAt: null,
    demonstratedConceptIds: demonstrates,
  };
}

function baseline(userStatus: FoundationUserStatus): FoundationItemInput {
  return { type: "assumed_baseline", userStatus };
}

const EMPTY: ReadinessInput = {
  clusters: [],
  concepts: [],
  competencyChecks: [],
  artefacts: [],
  foundationItems: [],
};

/* ── the reducer ────────────────────────────────────────────────────────── */

describe("computeReadinessLedger", () => {
  it("empty syllabus → 0%, no divide-by-zero", () => {
    const led = computeReadinessLedger(EMPTY);

    expect(led.headline.pct).toBe(0);
    expect(Number.isNaN(led.headline.pct)).toBe(false);
    expect(led.headline.weightedCompleted).toBe(0);
    expect(led.headline.weightedTotal).toBe(0);
    expect(led.breakdown.conceptsVerified).toBe(0);
    expect(led.breakdown.conceptsTotal).toBe(0);
    expect(led.breakdown.artefactsBacked).toBe(0);
    expect(led.breakdown.artefactsTargeted).toBe(0);
    expect(led.breakdown.clusterWeightsApplied).toEqual([]);
    expect(led.selfAssessed).toEqual({ concepts: 0, artefacts: 0 });
    expect(led.foundations).toEqual({ needIt: 0, total: 0 });
  });

  it("all concepts evidence-verified + all artefact milestones backed → 100%", () => {
    // Cluster A (weight 3, bearing): a1 via passed check, a2 via backed artefact.
    // Cluster B (weight 2, non-bearing): b1 via passed check. No artefact milestone.
    const input: ReadinessInput = {
      clusters: [cluster("A", 3, true), cluster("B", 2, false)],
      concepts: [
        concept("a1", "A", "learning"),
        concept("a2", "A", "not_started"),
        concept("b1", "B", "learning"),
      ],
      competencyChecks: [passedCheck("a1", 5), passedCheck("b1", 4)],
      artefacts: [backedArtefact("artA", "A", ["a2"])],
      foundationItems: [],
    };

    const led = computeReadinessLedger(input);

    // Milestones: A = 2 concepts + 1 artefact = 3 (×3), B = 1 concept (×2).
    // weightedTotal = 9 + 2 = 11; all completed.
    expect(led.headline.weightedTotal).toBe(11);
    expect(led.headline.weightedCompleted).toBe(11);
    expect(led.headline.pct).toBe(100);
    expect(led.breakdown.conceptsVerified).toBe(3);
    expect(led.breakdown.conceptsTotal).toBe(3);
    expect(led.breakdown.artefactsBacked).toBe(1);
    expect(led.breakdown.artefactsTargeted).toBe(1);
    expect(led.selfAssessed).toEqual({ concepts: 0, artefacts: 0 });
  });

  it("mixed case → exact hand-computed pct (54.84%)", () => {
    // Cluster A (weight 5, bearing), 4 concepts:
    //   a1 verified (check 4/5), a2 verified (backed artefact demonstrates it),
    //   a3 understood w/ NO evidence (self-assessed), a4 not started.
    //   artefact artA backed → artefact target backed.
    // Cluster B (weight 2, non-bearing), 3 concepts: b1 verified (check 5/5),
    //   b2/b3 not started. No artefact milestone.
    const input: ReadinessInput = {
      clusters: [cluster("A", 5, true), cluster("B", 2, false)],
      concepts: [
        concept("a1", "A", "learning"),
        concept("a2", "A", "not_started"),
        concept("a3", "A", "understood"),
        concept("a4", "A", "not_started"),
        concept("b1", "B", "learning"),
        concept("b2", "B", "not_started"),
        concept("b3", "B", "not_started"),
      ],
      competencyChecks: [passedCheck("a1", 4), passedCheck("b1", 5)],
      artefacts: [backedArtefact("artA", "A", ["a2"])],
      foundationItems: [baseline("need_it"), baseline("need_it"), baseline("have_it")],
    };

    const led = computeReadinessLedger(input);

    // weightedTotal = A(5×5=25) + B(2×3=6) = 31
    // weightedCompleted = A(5×3=15) + B(2×1=2) = 17
    expect(led.headline.weightedCompleted).toBe(17);
    expect(led.headline.weightedTotal).toBe(31);
    expect(led.headline.pct).toBe((17 / 31) * 100);
    expect(led.headline.pct).toBeCloseTo(54.83870967, 6);

    expect(led.breakdown.conceptsVerified).toBe(3);
    expect(led.breakdown.conceptsTotal).toBe(7);
    expect(led.breakdown.artefactsBacked).toBe(1);
    expect(led.breakdown.artefactsTargeted).toBe(1);
    expect(led.selfAssessed.concepts).toBe(1);
    expect(led.foundations).toEqual({ needIt: 2, total: 3 });

    // Invariants from the spec.
    const cwa = led.breakdown.clusterWeightsApplied;
    expect(cwa.reduce((n, c) => n + c.weightedCompleted, 0)).toBe(17);
    expect(cwa.reduce((n, c) => n + c.weightedTotal, 0)).toBe(31);
    expect(cwa.reduce((n, c) => n + c.milestonesTotal, 0)).toBe(
      led.breakdown.conceptsTotal + led.breakdown.artefactsTargeted,
    );
    expect(cwa.reduce((n, c) => n + c.milestonesCompleted, 0)).toBe(
      led.breakdown.conceptsVerified + led.breakdown.artefactsBacked,
    );
  });

  it("weighting bites: completing a heavy cluster moves the headline more than a light one", () => {
    // Two otherwise-identical non-bearing clusters: H weight 5, L weight 1,
    // each with one concept. Same shape, only the weight differs.
    const base = {
      clusters: [cluster("H", 5, false), cluster("L", 1, false)],
      concepts: [concept("h1", "H", "not_started"), concept("l1", "L", "not_started")],
      artefacts: [],
      foundationItems: [],
    };

    const completeHeavy = computeReadinessLedger({
      ...base,
      competencyChecks: [passedCheck("h1")],
    });
    const completeLight = computeReadinessLedger({
      ...base,
      competencyChecks: [passedCheck("l1")],
    });

    // weightedTotal is 6 in both (5 + 1). Heavy completed = 5, light = 1.
    expect(completeHeavy.headline.weightedTotal).toBe(6);
    expect(completeLight.headline.weightedTotal).toBe(6);
    expect(completeHeavy.headline.weightedCompleted).toBe(5);
    expect(completeLight.headline.weightedCompleted).toBe(1);

    expect(completeHeavy.headline.pct).toBe((5 / 6) * 100);
    expect(completeLight.headline.pct).toBe((1 / 6) * 100);
    expect(completeHeavy.headline.pct).toBeGreaterThan(completeLight.headline.pct);

    // Same number of concepts verified — only the weight differs.
    expect(completeHeavy.breakdown.conceptsVerified).toBe(1);
    expect(completeLight.breakdown.conceptsVerified).toBe(1);
  });

  it("self-assessment cannot inflate the headline", () => {
    // Cluster (weight 3, bearing): c1 understood, c2 verified — BOTH self-declared
    // with no passed check and no backing artefact. Plus an unbacked artefact that
    // demonstrates c1 (verifiedAt null must NOT verify it).
    const input: ReadinessInput = {
      clusters: [cluster("S", 3, true)],
      concepts: [concept("c1", "S", "understood"), concept("c2", "S", "verified")],
      competencyChecks: [],
      artefacts: [unbackedArtefact("artS", "S", ["c1"])],
      foundationItems: [],
    };

    const led = computeReadinessLedger(input);

    // Nothing is evidence-backed → headline must be 0 despite self-marked status.
    expect(led.headline.pct).toBe(0);
    expect(led.headline.weightedCompleted).toBe(0);
    // Milestones still exist: 2 concepts + 1 artefact target (×3 weight) = 9.
    expect(led.headline.weightedTotal).toBe(9);

    expect(led.breakdown.conceptsVerified).toBe(0);
    expect(led.breakdown.conceptsTotal).toBe(2);
    expect(led.breakdown.artefactsBacked).toBe(0);
    expect(led.breakdown.artefactsTargeted).toBe(1);

    // The self-declared work surfaces here instead — never in the headline.
    expect(led.selfAssessed.concepts).toBe(2);
    expect(led.selfAssessed.artefacts).toBe(1);
  });

  it("foundations (need_it) are excluded from the headline and reported separately", () => {
    const input: ReadinessInput = {
      clusters: [cluster("A", 2, false)],
      concepts: [concept("a1", "A", "learning")],
      competencyChecks: [passedCheck("a1")],
      artefacts: [],
      foundationItems: [
        baseline("need_it"),
        baseline("have_it"),
        baseline("unset"),
        // launch_step carries no userStatus and must be ignored entirely.
        { type: "launch_step", userStatus: "unset" },
      ],
    };

    const led = computeReadinessLedger(input);

    // The one verified concept fully determines the headline — foundations don't touch it.
    expect(led.headline.pct).toBe(100);
    expect(led.headline.weightedCompleted).toBe(2);
    expect(led.headline.weightedTotal).toBe(2);

    // Only assumed_baseline counts toward total; only need_it toward needIt.
    expect(led.foundations).toEqual({ needIt: 1, total: 3 });
  });
});

/* ── rule predicates ────────────────────────────────────────────────────── */

describe("isCompetencyPass", () => {
  it("fails just below PASS_BAR and passes at PASS_BAR", () => {
    const completed = new Date("2026-01-01");
    expect(isCompetencyPass(PASS_BAR - 1, completed)).toBe(false); // 3 fails
    expect(isCompetencyPass(PASS_BAR, completed)).toBe(true); // 4 passes
    expect(isCompetencyPass(5, completed)).toBe(true);
  });

  it("requires the check to be completed and scored", () => {
    expect(isCompetencyPass(5, null)).toBe(false); // not completed
    expect(isCompetencyPass(null, new Date("2026-01-01"))).toBe(false); // no score
  });
});

describe("isArtefactBacked", () => {
  it("is backed only when verifiedAt is set", () => {
    expect(isArtefactBacked(null)).toBe(false);
    expect(isArtefactBacked(new Date("2026-01-01"))).toBe(true);
    expect(isArtefactBacked("2026-01-01T00:00:00Z")).toBe(true);
  });
});

describe("isSelfDeclaredDone", () => {
  it("is true only for understood/verified", () => {
    expect(isSelfDeclaredDone("understood")).toBe(true);
    expect(isSelfDeclaredDone("verified")).toBe(true);
    expect(isSelfDeclaredDone("learning")).toBe(false);
    expect(isSelfDeclaredDone("not_started")).toBe(false);
  });
});
