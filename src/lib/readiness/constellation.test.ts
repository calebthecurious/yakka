import { describe, it, expect } from "vitest";
import {
  computeReadinessLedger,
  formatEvidenceLabelDated,
  type ReadinessInput,
} from "./model";
import { summarizeReadinessLedger } from "./summary";
import {
  TIER_RUNG,
  VERIFIED_TIERS,
  constellationData,
  tierOf,
  type ConstellationLabels,
} from "./constellation";

const EARLY = new Date("2026-03-12T09:00:00Z");
const MID = new Date("2026-05-20T09:00:00Z");
const LATE = new Date("2026-08-03T09:00:00Z");

const EMPTY: ReadinessInput = {
  clusters: [],
  concepts: [],
  competencyChecks: [],
  artefacts: [],
  foundationItems: [],
};

/**
 * One fixture that exercises every tier and both evidence kinds:
 *   k1  check 5 (LATE) + artefact a1 (EARLY)   → artefact_verified, best date EARLY
 *   k2  artefact a1 only, status learning       → artefact_verified AND inProgress
 *   k3  check 4 (MID), status understood        → check_passed (self-mark irrelevant)
 *   k4  status understood, check 3 (failed)     → self_assessed
 *   k5  status learning                         → in_progress
 *   k6  not_started                             → not_started
 *   k7  (cluster B) check 5 with an unparsable completedAt → check_passed, UNDATED
 */
const FIXTURE: ReadinessInput = {
  clusters: [
    { id: "A", weight: 3, isArtefactBearing: true },
    { id: "B", weight: 1, isArtefactBearing: false },
  ],
  concepts: [
    { id: "k1", clusterId: "A", subSkillId: "sA1", status: "verified" },
    { id: "k2", clusterId: "A", subSkillId: "sA1", status: "learning" },
    { id: "k3", clusterId: "A", subSkillId: "sA2", status: "understood" },
    { id: "k4", clusterId: "A", subSkillId: "sA2", status: "understood" },
    { id: "k5", clusterId: "A", subSkillId: "sA2", status: "learning" },
    { id: "k6", clusterId: "A", subSkillId: "sA2", status: "not_started" },
    { id: "k7", clusterId: "B", subSkillId: "sB1", status: "not_started" },
  ],
  competencyChecks: [
    { conceptId: "k1", score: 5, completedAt: LATE },
    { conceptId: "k3", score: 4, completedAt: MID },
    { conceptId: "k4", score: 3, completedAt: MID }, // fails the bar
    { conceptId: "k7", score: 5, completedAt: "not-a-date" }, // completed, undated
  ],
  artefacts: [
    {
      id: "a1",
      clusterId: "A",
      verifiedAt: EARLY,
      demonstratedConceptIds: ["k1", "k2"],
      title: "Bench rig",
      type: "project",
    },
    {
      id: "a2",
      clusterId: "A",
      verifiedAt: null,
      demonstratedConceptIds: ["k4"],
      title: "Draft",
      type: "writeup",
    },
  ],
  foundationItems: [],
};

const LABELS: ConstellationLabels = {
  concepts: { k1: "Filtering", k2: "Epoching", k3: "CSP", k4: "LDA", k5: "Riemann" },
  clusters: { A: "Signal processing", B: "Evaluation" },
  artefacts: { a1: { title: "Bench rig (public)", url: "https://example.test/a1" } },
};

const ledger = computeReadinessLedger(FIXTURE);
const data = constellationData(ledger, LABELS);
const byId = new Map(data.nodes.map((n) => [n.id, n]));

describe("constellationData — tiers agree with the ledger", () => {
  it("node tier is verified iff the ledger says the concept is verified", () => {
    const states = new Map(ledger.conceptStates.map((s) => [s.conceptId, s]));
    for (const n of data.nodes) {
      const s = states.get(n.id)!;
      expect(VERIFIED_TIERS.has(n.tier)).toBe(s.verified);
      expect(n.verified).toBe(s.verified);
      expect(n.tier === "self_assessed").toBe(s.selfAssessed);
      expect(n.inProgress).toBe(s.inProgress);
      expect(n.rung).toBe(TIER_RUNG[n.tier]);
      expect(tierOf(s)).toBe(n.tier);
    }
  });

  it("places each fixture concept on the expected rung", () => {
    expect(byId.get("k1")!.tier).toBe("artefact_verified");
    expect(byId.get("k2")!.tier).toBe("artefact_verified");
    expect(byId.get("k3")!.tier).toBe("check_passed");
    expect(byId.get("k4")!.tier).toBe("self_assessed");
    expect(byId.get("k5")!.tier).toBe("in_progress");
    expect(byId.get("k6")!.tier).toBe("not_started");
    expect(byId.get("k7")!.tier).toBe("check_passed");
  });

  it("rung 3 outranks rung 2 when a concept holds both, and both refs remain", () => {
    const k1 = byId.get("k1")!;
    expect(k1.rung).toBe(3);
    expect(k1.evidence.map((e) => e.kind)).toEqual(["competency_check", "artefact"]);
  });

  it("verified and in-progress are separate axes — a verified concept can be learning", () => {
    const k2 = byId.get("k2")!;
    expect(k2.verified).toBe(true);
    expect(k2.inProgress).toBe(true);
    expect(k2.tier).not.toBe("in_progress");
  });
});

describe("constellationData — parity with the summary counts", () => {
  const summary = summarizeReadinessLedger(ledger);

  it("totals equal the ledger's counts", () => {
    expect(data.totals.concepts).toBe(ledger.breakdown.conceptsTotal);
    expect(data.totals.verified).toBe(ledger.breakdown.conceptsVerified);
    expect(data.totals.selfAssessed).toBe(ledger.selfAssessed.concepts);
    expect(
      data.totals.verified +
        data.totals.selfAssessed +
        data.totals.inProgress +
        data.totals.notStarted,
    ).toBe(data.nodes.length);
    expect(data.nodes.filter((n) => n.inProgress).length).toBe(
      ledger.activity.conceptsInProgress,
    );
  });

  it("cluster rows are the summary's concept counts, and the nodes add up to them", () => {
    expect(data.clusters.map((c) => c.id)).toEqual(summary.byCluster.map((c) => c.clusterId));
    for (const c of data.clusters) {
      const s = summary.byCluster.find((x) => x.clusterId === c.id)!;
      expect(c.concepts).toEqual(s.concepts);
      expect(c.weight).toBe(s.weight);
      const mine = data.nodes.filter((n) => n.clusterId === c.id);
      expect(mine.length).toBe(c.concepts.total);
      expect(mine.filter((n) => n.verified).length).toBe(c.concepts.done);
      expect(mine.filter((n) => n.tier === "self_assessed").length).toBe(
        c.concepts.selfAssessed,
      );
    }
  });

  it("edges group every node under its cluster, one edge per node", () => {
    expect(data.edges).toHaveLength(data.nodes.length);
    for (const n of data.nodes) {
      expect(data.edges).toContainEqual({ source: n.clusterId, target: n.id });
    }
  });
});

describe("constellationData — events and dates", () => {
  it("event count equals the evidence count, from both the nodes and the ledger", () => {
    const fromNodes = data.nodes.reduce((n, node) => n + node.evidence.length, 0);
    const fromLedger = ledger.evidence.reduce((n, e) => n + e.evidence.length, 0);
    expect(data.events).toHaveLength(fromNodes);
    expect(data.events).toHaveLength(fromLedger);
    expect(fromLedger).toBe(5); // k1 ×2, k2, k3, k7
  });

  it("events are ascending by date with undated events last, never dropped", () => {
    const dated = data.events.filter((e) => e.at != null).map((e) => e.at as string);
    expect(dated).toEqual([...dated].sort());
    const firstUndated = data.events.findIndex((e) => e.at == null);
    expect(firstUndated).toBe(dated.length);
    expect(data.undatedEvents).toBe(1);
    expect(data.events[data.events.length - 1]).toMatchObject({ conceptId: "k7", at: null });
  });

  it("range spans the dated events only", () => {
    expect(data.range.first).toBe(EARLY.toISOString());
    expect(data.range.last).toBe(LATE.toISOString());
  });

  it("a node's occurredAt is the earliest dated evidence AT ITS OWN TIER", () => {
    expect(byId.get("k1")!.occurredAt).toBe(EARLY.toISOString()); // artefact wins over later check
    expect(byId.get("k2")!.occurredAt).toBe(EARLY.toISOString());
    expect(byId.get("k3")!.occurredAt).toBe(MID.toISOString());
    expect(byId.get("k4")!.occurredAt).toBeNull(); // no evidence
    expect(byId.get("k7")!.occurredAt).toBeNull(); // evidence undated
  });

  it("event rows carry the concept, cluster, artefact/score, and the taxonomy label", () => {
    const k1Artefact = data.events.find((e) => e.conceptId === "k1" && e.kind === "artefact")!;
    expect(k1Artefact).toEqual({
      at: EARLY.toISOString(),
      kind: "artefact",
      conceptId: "k1",
      clusterId: "A",
      artefactId: "a1",
      score: null,
      label: "Demonstrated in “Bench rig” · 12 Mar 2026",
    });
    const k3Check = data.events.find((e) => e.conceptId === "k3")!;
    expect(k3Check.score).toBe(4);
    expect(k3Check.artefactId).toBeNull();
    expect(k3Check.label).toBe("Competency check passed · 4/5 · 20 May 2026");
  });
});

describe("constellationData — labels and refs", () => {
  it("evidence ref labels are exactly the ledger's dated labels", () => {
    for (const entry of ledger.evidence) {
      const node = byId.get(entry.conceptId)!;
      expect(node.evidence.map((r) => r.label)).toEqual(
        entry.evidence.map(formatEvidenceLabelDated),
      );
    }
  });

  it("maps ids to supplied names and urls, and leaves missing ones null — never invented", () => {
    expect(byId.get("k1")!.label).toBe("Filtering");
    expect(byId.get("k6")!.label).toBeNull();
    expect(byId.get("k7")!.label).toBeNull();
    expect(data.clusters.find((c) => c.id === "A")!.label).toBe("Signal processing");

    const a1 = byId.get("k1")!.evidence.find((e) => e.kind === "artefact")!;
    expect(a1).toMatchObject({
      artefactId: "a1",
      title: "Bench rig (public)",
      url: "https://example.test/a1",
    });
  });

  it("falls back to the ledger's artefact title when labels carry none", () => {
    const bare = constellationData(ledger);
    const a1 = bare.nodes
      .find((n) => n.id === "k1")!
      .evidence.find((e) => e.kind === "artefact")!;
    expect(a1).toMatchObject({ title: "Bench rig", url: null });
    expect(bare.nodes.every((n) => n.label === null)).toBe(true);
  });
});

describe("constellationData — shape", () => {
  it("an empty workspace yields a valid empty payload", () => {
    expect(constellationData(computeReadinessLedger(EMPTY))).toEqual({
      nodes: [],
      clusters: [],
      edges: [],
      events: [],
      range: { first: null, last: null },
      undatedEvents: 0,
      totals: { concepts: 0, verified: 0, selfAssessed: 0, inProgress: 0, notStarted: 0 },
    });
  });

  it("is a plain serialisable payload — survives a JSON round trip unchanged", () => {
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
  });

  it("keeps nodes in ledger (syllabus display) order", () => {
    expect(data.nodes.map((n) => n.id)).toEqual(ledger.conceptStates.map((s) => s.conceptId));
  });
});
