import { describe, it, expect } from "vitest";
import { computeReadinessLedger, type ReadinessInput } from "./model";
import {
  DRIFT_WINDOW_DAYS,
  conceptsVerifiedSince,
  firstUnverifiedConcept,
  mostRecentEvidence,
  verifiedAtOf,
  weeklyPanelData,
} from "./weekly";

const NOW = "2026-10-03T12:00:00.000Z";
const D40 = new Date("2026-08-24T09:00:00Z"); // 40 days before NOW
const D20 = new Date("2026-09-13T09:00:00Z"); // 20 days before NOW
const D3 = new Date("2026-09-30T09:00:00Z"); //  3 days before NOW

const EMPTY: ReadinessInput = {
  clusters: [],
  concepts: [],
  competencyChecks: [],
  artefacts: [],
  foundationItems: [],
};

/**
 *   k1  check D40            → verified 40d ago (outside window)
 *   k2  check D20 + art D3   → verified 20d ago (first evidence), latest evidence D3
 *   k3  art D3 only          → verified 3d ago
 *   k4  check with undated completion → verified, undated
 *   k5  failed check         → unverified
 *   k6  not started          → unverified
 */
const INPUT: ReadinessInput = {
  clusters: [
    { id: "A", weight: 2, isArtefactBearing: true },
    { id: "B", weight: 1, isArtefactBearing: false },
  ],
  concepts: [
    { id: "k1", clusterId: "A", status: "understood" },
    { id: "k2", clusterId: "A", status: "understood" },
    { id: "k3", clusterId: "A", status: "not_started" },
    { id: "k4", clusterId: "B", status: "not_started" },
    { id: "k5", clusterId: "B", status: "understood" },
    { id: "k6", clusterId: "B", status: "not_started" },
  ],
  competencyChecks: [
    { conceptId: "k1", score: 5, completedAt: D40 },
    { conceptId: "k2", score: 4, completedAt: D20 },
    { conceptId: "k4", score: 5, completedAt: "not-a-date" },
    { conceptId: "k5", score: 2, completedAt: D3 },
  ],
  artefacts: [
    { id: "a1", clusterId: "A", verifiedAt: D3, demonstratedConceptIds: ["k2", "k3"], title: "Rig" },
  ],
  foundationItems: [],
};
const ledger = computeReadinessLedger(INPUT);

describe("firstUnverifiedConcept — the P1.9 ordering, from the top", () => {
  it("returns the first unverified concept in syllabus order", () => {
    expect(firstUnverifiedConcept(ledger)).toBe("k5");
  });

  it("is null when every concept is verified", () => {
    const all = computeReadinessLedger({
      ...EMPTY,
      clusters: [{ id: "A", weight: 1, isArtefactBearing: false }],
      concepts: [{ id: "k1", clusterId: "A", status: "not_started" }],
      competencyChecks: [{ conceptId: "k1", score: 5, completedAt: D3 }],
    });
    expect(firstUnverifiedConcept(all)).toBeNull();
    expect(firstUnverifiedConcept(computeReadinessLedger(EMPTY))).toBeNull();
  });
});

describe("mostRecentEvidence", () => {
  it("picks the latest dated evidence across all concepts, with the dated taxonomy label", () => {
    const r = mostRecentEvidence(ledger)!;
    expect(r.occurredAt).toBe(D3.toISOString());
    expect(["k2", "k3"]).toContain(r.conceptId); // same artefact, same instant; first seen wins
    expect(r.evidence.kind).toBe("artefact");
    expect(r.label).toBe("Demonstrated in “Rig” · 30 Sep 2026");
  });

  it("ignores undated evidence and is null when nothing is dated", () => {
    const undatedOnly = computeReadinessLedger({
      ...EMPTY,
      clusters: [{ id: "A", weight: 1, isArtefactBearing: false }],
      concepts: [{ id: "k1", clusterId: "A", status: "not_started" }],
      competencyChecks: [{ conceptId: "k1", score: 5, completedAt: "garbage" }],
    });
    expect(undatedOnly.breakdown.conceptsVerified).toBe(1);
    expect(mostRecentEvidence(undatedOnly)).toBeNull();
    expect(mostRecentEvidence(computeReadinessLedger(EMPTY))).toBeNull();
  });
});

describe("verifiedAtOf / conceptsVerifiedSince — drift", () => {
  it("a concept became verified at its EARLIEST dated evidence", () => {
    const k2 = ledger.evidence.find((e) => e.conceptId === "k2")!;
    expect(verifiedAtOf(k2)).toBe(D20.toISOString()); // the check, not the later artefact
    const k4 = ledger.evidence.find((e) => e.conceptId === "k4")!;
    expect(verifiedAtOf(k4)).toBeNull();
  });

  it("counts concepts verified inside the window, excludes older and undated", () => {
    expect(conceptsVerifiedSince(ledger, NOW)).toBe(2); // k2 (20d), k3 (3d); not k1 (40d), not k4 (undated)
    expect(conceptsVerifiedSince(ledger, NOW, 10)).toBe(1); // only k3
    expect(conceptsVerifiedSince(ledger, NOW, 60)).toBe(3); // k1 too; k4 still excluded
  });

  it("is a floor: never counts self-assessed or failed checks", () => {
    expect(conceptsVerifiedSince(ledger, NOW, 3650)).toBe(ledger.breakdown.conceptsVerified - 1);
  });

  it("tolerates a bad now", () => {
    expect(conceptsVerifiedSince(ledger, "nope")).toBe(0);
  });
});

describe("weeklyPanelData", () => {
  it("assembles the three facts plus totals, serialisably", () => {
    const d = weeklyPanelData(ledger, NOW);
    expect(d).toMatchObject({
      nextConceptId: "k5",
      verifiedInWindow: 2,
      verifiedTotal: 4,
      conceptsTotal: 6,
      windowDays: DRIFT_WINDOW_DAYS,
      asOf: NOW,
    });
    expect(d.recent?.label).toBe("Demonstrated in “Rig” · 30 Sep 2026");
    expect(JSON.parse(JSON.stringify(d))).toEqual(d);
  });

  it("an empty workspace yields all-absent states, not errors", () => {
    expect(weeklyPanelData(computeReadinessLedger(EMPTY), NOW)).toEqual({
      nextConceptId: null,
      recent: null,
      verifiedInWindow: 0,
      verifiedTotal: 0,
      conceptsTotal: 0,
      windowDays: 30,
      asOf: NOW,
    });
  });

  it("verifiedInWindow never exceeds verifiedTotal", () => {
    const d = weeklyPanelData(ledger, NOW, 100000);
    expect(d.verifiedInWindow).toBeLessThanOrEqual(d.verifiedTotal);
  });
});
