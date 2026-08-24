import { describe, it, expect } from "vitest";
import {
  PASS_BAR,
  bestCompletedScore,
  computeReadinessLedger,
  type ConceptLedgerEntry,
  type ReadinessInput,
} from "./model";
import {
  findNextUnverifiedConcept,
  selectConceptCta,
  unbackedBearingClusterIds,
  type ConceptCtaInput,
} from "./concept-cta";

const D = new Date("2026-08-01");

/* ── the state machine, one test per state ─────────────────────────────── */

function entry(over: Partial<ConceptLedgerEntry> = {}): ConceptLedgerEntry {
  return {
    conceptId: "k1",
    clusterId: "C",
    subSkillId: "S",
    verified: false,
    checkAttempted: false,
    bestScore: null,
    checkPassed: false,
    artefactBacked: false,
    ...over,
  };
}

function cta(over: Partial<ConceptCtaInput> = {}) {
  return selectConceptCta({
    concept: entry(),
    unbackedBearingClusterIds: [],
    primaryResourceUnfinished: false,
    nextUnverifiedConceptId: null,
    ...over,
  });
}

describe("selectConceptCta", () => {
  it("state 1 — study: recommended resource unfinished, no check attempted", () => {
    expect(cta({ primaryResourceUnfinished: true })).toEqual({ state: "study" });
  });

  it("state 2 — take_check: nothing attempted and nothing left to read", () => {
    expect(cta()).toEqual({ state: "take_check" });
  });

  it("state 3 — retake_check: a completed check fell below the bar", () => {
    expect(
      cta({
        concept: entry({ checkAttempted: true, bestScore: PASS_BAR - 1 }),
      }),
    ).toEqual({ state: "retake_check", bestScore: PASS_BAR - 1 });
  });

  it("state 3 outranks study — a real attempt beats a reading nudge", () => {
    expect(
      cta({
        concept: entry({ checkAttempted: true, bestScore: 2 }),
        primaryResourceUnfinished: true,
      }),
    ).toEqual({ state: "retake_check", bestScore: 2 });
  });

  it("state 4 — attach_evidence: verified, own cluster's target unbacked", () => {
    expect(
      cta({
        concept: entry({ verified: true, checkAttempted: true, bestScore: 5, checkPassed: true }),
        unbackedBearingClusterIds: ["C"],
        nextUnverifiedConceptId: "k9",
      }),
    ).toEqual({ state: "attach_evidence", clusterId: "C", isCurrentCluster: true });
  });

  it("state 4 is milestone-driven — a foreign-cluster artefact backing this concept does not close C's target", () => {
    // The concept is verified BY an artefact (logged under another cluster),
    // yet cluster C's own artefact-target milestone is still open. The nudge
    // must fire; suppressing it would leave the milestone unroutable.
    expect(
      cta({
        concept: entry({ verified: true, artefactBacked: true }),
        unbackedBearingClusterIds: ["C"],
        nextUnverifiedConceptId: null,
      }),
    ).toEqual({ state: "attach_evidence", clusterId: "C", isCurrentCluster: true });
  });

  it("state 5 — move_on: verified with nothing further HERE, links to the next unverified", () => {
    expect(
      cta({
        concept: entry({ verified: true, checkPassed: true, checkAttempted: true, bestScore: 5 }),
        nextUnverifiedConceptId: "k9",
      }),
    ).toEqual({ state: "move_on", nextConceptId: "k9" });
  });

  it("move_on outranks another cluster's open artefact — concepts come first", () => {
    expect(
      cta({
        concept: entry({ verified: true, checkPassed: true }),
        unbackedBearingClusterIds: ["D"],
        nextUnverifiedConceptId: "k9",
      }),
    ).toEqual({ state: "move_on", nextConceptId: "k9" });
  });

  it("cross-cluster attach_evidence: all concepts verified, another cluster's target open", () => {
    // The false-done repro from review: without this branch the CTA claimed
    // "nothing outstanding" while the headline read < 100%.
    expect(
      cta({
        concept: entry({ verified: true, checkPassed: true }),
        unbackedBearingClusterIds: ["D", "E"],
        nextUnverifiedConceptId: null,
      }),
    ).toEqual({ state: "attach_evidence", clusterId: "D", isCurrentCluster: false });
  });

  it("state 6 — done: verified, no unverified concept, no unbacked target anywhere", () => {
    expect(
      cta({
        concept: entry({ verified: true, checkPassed: true }),
        unbackedBearingClusterIds: [],
        nextUnverifiedConceptId: null,
      }),
    ).toEqual({ state: "done" });
  });

  /* ── the fifth real state from P1.5b ─────────────────────────────────── */

  it("evidence WITHOUT a passed check is never a nag to sit the check", () => {
    const artefactOnly = entry({
      verified: true,
      checkAttempted: false,
      bestScore: null,
      checkPassed: false,
      artefactBacked: true,
    });

    expect(
      cta({
        concept: artefactOnly,
        nextUnverifiedConceptId: "k9",
      }),
    ).toEqual({ state: "move_on", nextConceptId: "k9" });

    // And it is never routed back to the check, whatever else is open.
    for (const unbacked of [[], ["C"], ["D"]]) {
      const result = cta({
        concept: artefactOnly,
        unbackedBearingClusterIds: unbacked,
        nextUnverifiedConceptId: null,
      });
      expect(result.state).not.toBe("take_check");
      expect(result.state).not.toBe("retake_check");
    }
  });

  /* ── the bearing-cluster carve-out ───────────────────────────────────── */

  it("a verified concept in a NON-bearing cluster is move_on, not an artefact nag for that cluster", () => {
    // C is non-bearing, so it can never appear in unbackedBearingClusterIds.
    expect(
      cta({
        concept: entry({ verified: true, checkPassed: true, checkAttempted: true, bestScore: 4 }),
        unbackedBearingClusterIds: [],
        nextUnverifiedConceptId: "k9",
      }),
    ).toEqual({ state: "move_on", nextConceptId: "k9" });
  });

  it("a bearing cluster that already has a backed artefact does not ask again", () => {
    // A backed cluster is absent from unbackedBearingClusterIds by definition.
    expect(
      cta({
        concept: entry({ verified: true, checkPassed: true }),
        unbackedBearingClusterIds: [],
        nextUnverifiedConceptId: "k9",
      }),
    ).toEqual({ state: "move_on", nextConceptId: "k9" });
  });

  it("never consults self-declared status — it is not even in the input shape", () => {
    // ConceptLedgerEntry has no `status` field by construction. This asserts the
    // selector is total over ledger facts alone.
    const keys = Object.keys(entry());
    expect(keys).not.toContain("status");
    expect(keys).not.toContain("selfDeclared");
  });
});

/* ── next-unverified lookup ─────────────────────────────────────────────── */

const cluster = (id: string, weight = 3, bearing = false) => ({
  id,
  weight,
  isArtefactBearing: bearing,
});

function workspace(verifiedIds: string[]): ReadinessInput {
  const ids = [
    ["A", "a1"], ["A", "a2"], ["A", "a3"],
    ["B", "b1"], ["B", "b2"],
    ["C", "c1"],
  ] as const;
  return {
    clusters: [cluster("A"), cluster("B"), cluster("C")],
    concepts: ids.map(([clusterId, id]) => ({
      id,
      clusterId,
      subSkillId: `s${clusterId}`,
      status: "not_started" as const,
    })),
    competencyChecks: verifiedIds.map((conceptId) => ({
      conceptId,
      score: 5,
      completedAt: D,
    })),
    artefacts: [],
    foundationItems: [],
  };
}

describe("findNextUnverifiedConcept", () => {
  it("prefers the current cluster — finish what you are already in", () => {
    const led = computeReadinessLedger(workspace(["a1"]));
    expect(findNextUnverifiedConcept(led, "a1")).toBe("a2");
  });

  it("skips the concept you are on", () => {
    const led = computeReadinessLedger(workspace([]));
    expect(findNextUnverifiedConcept(led, "a2")).toBe("a1");
    expect(findNextUnverifiedConcept(led, "a1")).toBe("a2");
  });

  it("moves to the next cluster once the current one is fully verified", () => {
    const led = computeReadinessLedger(workspace(["a1", "a2", "a3"]));
    expect(findNextUnverifiedConcept(led, "a1")).toBe("b1");
  });

  it("wraps to earlier clusters rather than giving up", () => {
    // Only B and C verified; from c1 the next unverified is back in A.
    const led = computeReadinessLedger(workspace(["b1", "b2", "c1"]));
    expect(findNextUnverifiedConcept(led, "c1")).toBe("a1");
  });

  it("is null only when no OTHER concept is unverified", () => {
    const led = computeReadinessLedger(
      workspace(["a1", "a2", "a3", "b1", "b2", "c1"]),
    );
    expect(findNextUnverifiedConcept(led, "a1")).toBeNull();
    expect(findNextUnverifiedConcept(led, "c1")).toBeNull();
  });

  it("returns a real unverified id for an unknown starting concept", () => {
    const led = computeReadinessLedger(workspace(["a1"]));
    expect(findNextUnverifiedConcept(led, "nope")).toBe("a2");
  });
});

/* ── unbacked bearing clusters, and the false-done repro end-to-end ─────── */

describe("unbackedBearingClusterIds", () => {
  it("lists bearing clusters without a backed artefact, in cluster order", () => {
    const input: ReadinessInput = {
      clusters: [cluster("A", 3, true), cluster("B"), cluster("C", 3, true)],
      concepts: [
        { id: "a1", clusterId: "A", subSkillId: "sA", status: "not_started" },
        { id: "b1", clusterId: "B", subSkillId: "sB", status: "not_started" },
        { id: "c1", clusterId: "C", subSkillId: "sC", status: "not_started" },
      ],
      competencyChecks: [],
      artefacts: [
        // C's target is backed; A's is not. B is non-bearing.
        { id: "art1", clusterId: "C", verifiedAt: D, demonstratedConceptIds: ["c1"] },
      ],
      foundationItems: [],
    };
    expect(unbackedBearingClusterIds(computeReadinessLedger(input))).toEqual(["A"]);
  });

  it("REGRESSION (review repro): all checks passed, bearing cluster unbacked — the CTA routes there instead of claiming done", () => {
    // Cluster A non-bearing, cluster B bearing, both concepts check-passed,
    // zero artefacts. The headline is < 100% (B's artefact milestone is open),
    // so `done` on a1 would be a lie the ledger contradicts.
    const input: ReadinessInput = {
      clusters: [cluster("A"), cluster("B", 3, true)],
      concepts: [
        { id: "a1", clusterId: "A", subSkillId: "sA", status: "not_started" },
        { id: "b1", clusterId: "B", subSkillId: "sB", status: "not_started" },
      ],
      competencyChecks: [
        { conceptId: "a1", score: 5, completedAt: D },
        { conceptId: "b1", score: 5, completedAt: D },
      ],
      artefacts: [],
      foundationItems: [],
    };
    const led = computeReadinessLedger(input);
    expect(led.headline.pct).toBeLessThan(100);

    const a1 = led.conceptStates.find((c) => c.conceptId === "a1")!;
    const result = selectConceptCta({
      concept: a1,
      unbackedBearingClusterIds: unbackedBearingClusterIds(led),
      primaryResourceUnfinished: false,
      nextUnverifiedConceptId: findNextUnverifiedConcept(led, "a1"),
    });
    expect(result).toEqual({
      state: "attach_evidence",
      clusterId: "B",
      isCurrentCluster: false,
    });
  });

  it("done agrees with a 100% headline — same ledger, both grains closed", () => {
    const input: ReadinessInput = {
      clusters: [cluster("A"), cluster("B", 3, true)],
      concepts: [
        { id: "a1", clusterId: "A", subSkillId: "sA", status: "not_started" },
        { id: "b1", clusterId: "B", subSkillId: "sB", status: "not_started" },
      ],
      competencyChecks: [
        { conceptId: "a1", score: 5, completedAt: D },
        { conceptId: "b1", score: 5, completedAt: D },
      ],
      artefacts: [
        { id: "art1", clusterId: "B", verifiedAt: D, demonstratedConceptIds: ["b1"] },
      ],
      foundationItems: [],
    };
    const led = computeReadinessLedger(input);
    expect(led.headline.pct).toBe(100);

    const a1 = led.conceptStates.find((c) => c.conceptId === "a1")!;
    const result = selectConceptCta({
      concept: a1,
      unbackedBearingClusterIds: unbackedBearingClusterIds(led),
      primaryResourceUnfinished: false,
      nextUnverifiedConceptId: findNextUnverifiedConcept(led, "a1"),
    });
    expect(result).toEqual({ state: "done" });
  });
});

/* ── the ledger extension backing it ────────────────────────────────────── */

describe("ledger.conceptStates", () => {
  it("distinguishes never-attempted from attempted-and-failed", () => {
    const input: ReadinessInput = {
      clusters: [cluster("A")],
      concepts: [
        { id: "k1", clusterId: "A", subSkillId: "s", status: "not_started" },
        { id: "k2", clusterId: "A", subSkillId: "s", status: "learning" },
      ],
      competencyChecks: [{ conceptId: "k2", score: 2, completedAt: D }],
      artefacts: [],
      foundationItems: [],
    };

    const states = computeReadinessLedger(input).conceptStates;
    const k1 = states.find((c) => c.conceptId === "k1")!;
    const k2 = states.find((c) => c.conceptId === "k2")!;

    // Both unverified and both absent from `evidence` — only conceptStates
    // can tell them apart, which is why the extension exists.
    expect(k1.verified).toBe(false);
    expect(k2.verified).toBe(false);
    expect(k1.checkAttempted).toBe(false);
    expect(k2.checkAttempted).toBe(true);
    expect(k1.bestScore).toBeNull();
    expect(k2.bestScore).toBe(2);
  });

  it("reports the best COMPLETED score, pass or fail", () => {
    const input: ReadinessInput = {
      clusters: [cluster("A")],
      concepts: [{ id: "k1", clusterId: "A", subSkillId: "s", status: "learning" }],
      competencyChecks: [
        { conceptId: "k1", score: 1, completedAt: D },
        { conceptId: "k1", score: 3, completedAt: D },
        { conceptId: "k1", score: 5, completedAt: null }, // unfinished, ignored
      ],
      artefacts: [],
      foundationItems: [],
    };
    const k1 = computeReadinessLedger(input).conceptStates[0];
    expect(k1.bestScore).toBe(3);
    expect(k1.checkPassed).toBe(false);
    expect(k1.verified).toBe(false);
  });

  it("has one entry per concept, in display order, agreeing with the counts", () => {
    const led = computeReadinessLedger(workspace(["a1", "b1"]));
    expect(led.conceptStates.map((c) => c.conceptId)).toEqual([
      "a1", "a2", "a3", "b1", "b2", "c1",
    ]);
    expect(led.conceptStates.filter((c) => c.verified).length).toBe(
      led.breakdown.conceptsVerified,
    );
  });

  it("marks artefact-backed concepts without requiring a check", () => {
    const input: ReadinessInput = {
      clusters: [cluster("A", 3, true)],
      concepts: [{ id: "k1", clusterId: "A", subSkillId: "s", status: "not_started" }],
      competencyChecks: [],
      artefacts: [
        { id: "a1", clusterId: "A", verifiedAt: D, demonstratedConceptIds: ["k1"] },
      ],
      foundationItems: [],
    };
    const k1 = computeReadinessLedger(input).conceptStates[0];
    expect(k1).toMatchObject({
      verified: true,
      checkAttempted: false,
      checkPassed: false,
      artefactBacked: true,
    });
  });
});

describe("bestCompletedScore", () => {
  it("includes failing scores, unlike bestPassingScore", () => {
    expect(bestCompletedScore([{ score: 2, completedAt: D }])).toBe(2);
  });

  it("ignores unfinished checks and is null when there are none", () => {
    expect(bestCompletedScore([{ score: 5, completedAt: null }])).toBeNull();
    expect(bestCompletedScore([])).toBeNull();
  });
});
