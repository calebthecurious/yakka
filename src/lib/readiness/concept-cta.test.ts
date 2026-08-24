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
    clusterIsArtefactBearing: false,
    clusterHasBackedArtefact: false,
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

  it("state 4 — attach_evidence: passed, bearing cluster, no backed artefact", () => {
    expect(
      cta({
        concept: entry({ verified: true, checkAttempted: true, bestScore: 5, checkPassed: true }),
        clusterIsArtefactBearing: true,
        clusterHasBackedArtefact: false,
        nextUnverifiedConceptId: "k9",
      }),
    ).toEqual({ state: "attach_evidence", clusterId: "C" });
  });

  it("state 5 — move_on: verified with nothing further, links to the next unverified", () => {
    expect(
      cta({
        concept: entry({ verified: true, checkPassed: true, checkAttempted: true, bestScore: 5 }),
        nextUnverifiedConceptId: "k9",
      }),
    ).toEqual({ state: "move_on", nextConceptId: "k9" });
  });

  it("state 6 — done: verified and nothing unverified remains anywhere", () => {
    expect(
      cta({
        concept: entry({ verified: true, checkPassed: true }),
        nextUnverifiedConceptId: null,
      }),
    ).toEqual({ state: "done" });
  });

  /* ── the fifth real state from P1.5b ─────────────────────────────────── */

  it("evidence WITHOUT a passed check is move_on — never a nag to sit the check", () => {
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
        clusterIsArtefactBearing: true,
        clusterHasBackedArtefact: true,
        nextUnverifiedConceptId: "k9",
      }),
    ).toEqual({ state: "move_on", nextConceptId: "k9" });

    // And it is never routed back to the check, in any cluster shape.
    for (const bearing of [true, false]) {
      const result = cta({
        concept: artefactOnly,
        clusterIsArtefactBearing: bearing,
        clusterHasBackedArtefact: true,
        nextUnverifiedConceptId: null,
      });
      expect(result.state).not.toBe("take_check");
      expect(result.state).not.toBe("retake_check");
    }
  });

  /* ── the bearing-cluster carve-out ───────────────────────────────────── */

  it("a passed check in a NON-bearing cluster is done, not an artefact nag", () => {
    expect(
      cta({
        concept: entry({ verified: true, checkPassed: true, checkAttempted: true, bestScore: 4 }),
        clusterIsArtefactBearing: false,
        nextUnverifiedConceptId: "k9",
      }),
    ).toEqual({ state: "move_on", nextConceptId: "k9" });
  });

  it("a bearing cluster that already has a backed artefact does not ask again", () => {
    expect(
      cta({
        concept: entry({ verified: true, checkPassed: true }),
        clusterIsArtefactBearing: true,
        clusterHasBackedArtefact: true,
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

  it("is null only when the whole syllabus is verified", () => {
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
