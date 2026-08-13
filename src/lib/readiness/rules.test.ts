import { describe, it, expect } from "vitest";
import {
  COMPETENCY_CHECK_OUT_OF,
  PASS_BAR,
  TRAIL_NAMED_LIMIT,
  bestPassingScore,
  computeReadinessLedger,
  criteriaProgress,
  formatEvidenceLabel,
  isCompletedProject,
  isConceptInProgress,
  isResourceCompleted,
  type ArtefactInput,
  type ReadinessInput,
  type ResourceInput,
} from "./model";
import { findConceptEvidence, summarizeReadinessLedger } from "./summary";

const D = new Date("2026-08-01");

const EMPTY: ReadinessInput = {
  clusters: [],
  concepts: [],
  competencyChecks: [],
  artefacts: [],
  foundationItems: [],
};

/* ── named rules, in isolation ──────────────────────────────────────────── */

describe("isConceptInProgress", () => {
  it("is true only for learning — self-declaration, never evidence", () => {
    expect(isConceptInProgress("learning")).toBe(true);
    expect(isConceptInProgress("not_started")).toBe(false);
    expect(isConceptInProgress("understood")).toBe(false);
    expect(isConceptInProgress("verified")).toBe(false);
  });
});

describe("isCompletedProject", () => {
  const base = { id: "a", clusterId: "C", demonstratedConceptIds: [] };

  it("requires BOTH type 'project' and a real verifiedAt", () => {
    expect(isCompletedProject({ ...base, type: "project", verifiedAt: D })).toBe(true);
    expect(isCompletedProject({ ...base, type: "project", verifiedAt: null })).toBe(false);
    expect(isCompletedProject({ ...base, type: "writeup", verifiedAt: D })).toBe(false);
  });

  it("a pasted link is NOT a completion (the rule this replaces)", () => {
    // The old profile counted `url || evidenceUrl` as "shipped". Those columns
    // are not even in the model's input — completion is verifiedAt, full stop.
    const linkedButUnverified: ArtefactInput = {
      ...base,
      type: "project",
      verifiedAt: null,
    };
    expect(isCompletedProject(linkedButUnverified)).toBe(false);
  });

  it("an artefact with no type can never be a completed project", () => {
    expect(isCompletedProject({ ...base, verifiedAt: D })).toBe(false);
    expect(isCompletedProject({ ...base, type: null, verifiedAt: D })).toBe(false);
  });
});

describe("bestPassingScore", () => {
  it("returns the highest PASSING score", () => {
    expect(
      bestPassingScore([
        { score: 4, completedAt: D },
        { score: 5, completedAt: D },
        { score: 4, completedAt: D },
      ]),
    ).toBe(5);
  });

  it("ignores failed and unfinished attempts rather than penalising them", () => {
    expect(
      bestPassingScore([
        { score: 1, completedAt: D }, // failed
        { score: 3, completedAt: D }, // failed, just under the bar
        { score: null, completedAt: null }, // never finished
        { score: PASS_BAR, completedAt: D }, // the one that counts
      ]),
    ).toBe(PASS_BAR);
  });

  it("is null when nothing passes, including an unfinished perfect score", () => {
    expect(bestPassingScore([])).toBeNull();
    expect(bestPassingScore([{ score: 3, completedAt: D }])).toBeNull();
    expect(bestPassingScore([{ score: 5, completedAt: null }])).toBeNull();
  });
});

describe("criteriaProgress", () => {
  it("counts done against total", () => {
    expect(
      criteriaProgress([{ done: true }, { done: false }, { done: true }]),
    ).toEqual({ done: 2, total: 3 });
  });

  it("is 0/0 for absent or empty criteria, never NaN", () => {
    expect(criteriaProgress(undefined)).toEqual({ done: 0, total: 0 });
    expect(criteriaProgress([])).toEqual({ done: 0, total: 0 });
  });
});

describe("isResourceCompleted", () => {
  it("counts only finished resources", () => {
    expect(isResourceCompleted("completed")).toBe(true);
    expect(isResourceCompleted("planned")).toBe(false);
    expect(isResourceCompleted("consuming")).toBe(false);
    expect(isResourceCompleted("abandoned")).toBe(false);
  });
});

describe("formatEvidenceLabel", () => {
  it("renders the competency-check label exactly as the profile always has", () => {
    expect(
      formatEvidenceLabel({ kind: "competency_check", score: 4, outOf: 5 }),
    ).toBe("Competency check passed · 4/5");
    expect(
      formatEvidenceLabel({ kind: "competency_check", score: 5, outOf: 5 }),
    ).toBe("Competency check passed · 5/5");
  });

  it("renders the artefact label with the same curly quotes", () => {
    expect(
      formatEvidenceLabel({
        kind: "artefact",
        artefactId: "a1",
        artefactTitle: "Seizure detection pipeline",
      }),
    ).toBe("Demonstrated in “Seizure detection pipeline”");
  });

  it("falls back to a generic phrase when the loader supplied no title", () => {
    expect(
      formatEvidenceLabel({ kind: "artefact", artefactId: "a1", artefactTitle: null }),
    ).toBe("Demonstrated in a completed artefact");
  });
});

/* ── the disposition: evidence without self-declaration ─────────────────── */

describe("evidence is never gated behind self-declaration", () => {
  it("a passed check on a 'learning' concept verifies it AND yields provenance", () => {
    // This is the exact bug removed from /u/[handle]: the profile skipped any
    // concept whose raw status was not understood/verified, so real evidence
    // was invisible. The ledger has always counted it; now provenance does too.
    const input: ReadinessInput = {
      ...EMPTY,
      clusters: [{ id: "C", weight: 3, isArtefactBearing: false }],
      concepts: [{ id: "k1", clusterId: "C", status: "learning" }],
      competencyChecks: [{ conceptId: "k1", score: 5, completedAt: D }],
    };

    const led = computeReadinessLedger(input);

    expect(led.breakdown.conceptsVerified).toBe(1);
    expect(led.selfAssessed.concepts).toBe(0);
    expect(led.evidence).toEqual([
      {
        conceptId: "k1",
        clusterId: "C",
        evidence: [
          { kind: "competency_check", score: 5, outOf: COMPETENCY_CHECK_OUT_OF },
        ],
      },
    ]);
    // It is simultaneously verified AND in progress — those are different axes.
    expect(led.activity.conceptsInProgress).toBe(1);
  });

  it("a backed artefact verifies a not_started concept", () => {
    const input: ReadinessInput = {
      ...EMPTY,
      clusters: [{ id: "C", weight: 1, isArtefactBearing: true }],
      concepts: [{ id: "k1", clusterId: "C", status: "not_started" }],
      artefacts: [
        {
          id: "a1",
          clusterId: "C",
          verifiedAt: D,
          demonstratedConceptIds: ["k1"],
          title: "Bench rig",
        },
      ],
    };

    const led = computeReadinessLedger(input);
    expect(led.breakdown.conceptsVerified).toBe(1);
    expect(led.evidence[0].evidence).toEqual([
      { kind: "artefact", artefactId: "a1", artefactTitle: "Bench rig" },
    ]);
  });
});

/* ── evidence provenance, in the reducer ────────────────────────────────── */

describe("computeReadinessLedger — evidence provenance", () => {
  const input: ReadinessInput = {
    clusters: [{ id: "C", weight: 2, isArtefactBearing: true }],
    concepts: [
      { id: "k1", clusterId: "C", status: "understood" }, // check + 2 artefacts
      { id: "k2", clusterId: "C", status: "understood" }, // no evidence
      { id: "k3", clusterId: "C", status: "not_started" }, // nothing at all
    ],
    competencyChecks: [
      { conceptId: "k1", score: 4, completedAt: D },
      { conceptId: "k1", score: 5, completedAt: D }, // best wins
      { conceptId: "k1", score: 2, completedAt: D }, // failure ignored
      { conceptId: "k2", score: 3, completedAt: D }, // fails the bar
    ],
    artefacts: [
      { id: "a1", clusterId: "C", verifiedAt: D, demonstratedConceptIds: ["k1"], title: "First" },
      { id: "a2", clusterId: "C", verifiedAt: D, demonstratedConceptIds: ["k1"], title: "Second" },
      { id: "a3", clusterId: "C", verifiedAt: null, demonstratedConceptIds: ["k2"], title: "Draft" },
    ],
    foundationItems: [],
  };

  it("emits entries only for verified concepts — never an empty one", () => {
    const led = computeReadinessLedger(input);
    expect(led.evidence.map((e) => e.conceptId)).toEqual(["k1"]);
    expect(led.evidence.every((e) => e.evidence.length > 0)).toBe(true);
  });

  it("orders competency-check evidence first, then artefacts in input order", () => {
    const led = computeReadinessLedger(input);
    expect(led.evidence[0].evidence).toEqual([
      { kind: "competency_check", score: 5, outOf: 5 },
      { kind: "artefact", artefactId: "a1", artefactTitle: "First" },
      { kind: "artefact", artefactId: "a2", artefactTitle: "Second" },
    ]);
  });

  it("renders as the profile's evidence list", () => {
    const led = computeReadinessLedger(input);
    expect(led.evidence[0].evidence.map(formatEvidenceLabel)).toEqual([
      "Competency check passed · 5/5",
      "Demonstrated in “First”",
      "Demonstrated in “Second”",
    ]);
  });

  it("evidence entry count always equals conceptsVerified", () => {
    const led = computeReadinessLedger(input);
    expect(led.evidence.length).toBe(led.breakdown.conceptsVerified);
  });

  it("is reachable through the summary", () => {
    const s = summarizeReadinessLedger(computeReadinessLedger(input));
    expect(findConceptEvidence(s, "k1")?.evidence).toHaveLength(3);
    expect(findConceptEvidence(s, "k2")).toBeNull();
    expect(findConceptEvidence(s, "nope")).toBeNull();
  });
});

/* ── artefact grain vs cluster grain ────────────────────────────────────── */

describe("computeReadinessLedger — artefact counters", () => {
  it("counts ARTEFACTS, where the milestone counters count CLUSTERS", () => {
    const input: ReadinessInput = {
      ...EMPTY,
      clusters: [{ id: "C", weight: 1, isArtefactBearing: true }],
      artefacts: [
        { id: "a1", clusterId: "C", verifiedAt: D, demonstratedConceptIds: [], type: "project" },
        { id: "a2", clusterId: "C", verifiedAt: D, demonstratedConceptIds: [], type: "writeup" },
      ],
    };

    const led = computeReadinessLedger(input);
    expect(led.artefacts.completed).toBe(2); // two artefacts
    expect(led.breakdown.artefactsBacked).toBe(1); // one bearing cluster
    expect(led.artefacts.projectsCompleted).toBe(1);
    expect(led.artefacts.total).toBe(2);
  });

  it("unverified artefacts count toward total but nothing else", () => {
    const input: ReadinessInput = {
      ...EMPTY,
      clusters: [{ id: "C", weight: 1, isArtefactBearing: true }],
      artefacts: [
        { id: "a1", clusterId: "C", verifiedAt: null, demonstratedConceptIds: [], type: "project" },
      ],
    };

    const led = computeReadinessLedger(input);
    expect(led.artefacts).toEqual({ completed: 0, projectsCompleted: 0, total: 1 });
    expect(led.selfAssessed.artefacts).toBe(1);
  });

  it("untyped artefacts are reported in coverage, not silently miscounted", () => {
    const input: ReadinessInput = {
      ...EMPTY,
      clusters: [{ id: "C", weight: 1, isArtefactBearing: true }],
      artefacts: [
        { id: "a1", clusterId: "C", verifiedAt: D, demonstratedConceptIds: [] },
        { id: "a2", clusterId: "C", verifiedAt: D, demonstratedConceptIds: [], type: "project" },
      ],
    };

    const led = computeReadinessLedger(input);
    expect(led.artefacts.completed).toBe(2);
    expect(led.artefacts.projectsCompleted).toBe(1); // a1 cannot qualify
    expect(led.coverage.artefactsWithoutType).toBe(1);
  });
});

/* ── activity + trail ───────────────────────────────────────────────────── */

describe("computeReadinessLedger — activity and learning trail", () => {
  it("counts in-progress concepts without letting them touch the headline", () => {
    const input: ReadinessInput = {
      ...EMPTY,
      clusters: [{ id: "C", weight: 4, isArtefactBearing: false }],
      concepts: [
        { id: "k1", clusterId: "C", status: "learning" },
        { id: "k2", clusterId: "C", status: "learning" },
        { id: "k3", clusterId: "C", status: "not_started" },
      ],
    };

    const led = computeReadinessLedger(input);
    expect(led.activity.conceptsInProgress).toBe(2);
    expect(led.headline.pct).toBe(0);
    expect(led.headline.weightedCompleted).toBe(0);
  });

  it("trail counts completed resources by type and never anything else", () => {
    const resources: ResourceInput[] = [
      { conceptId: "k1", type: "book", status: "completed", title: "B1", author: "A1" },
      { conceptId: "k1", type: "book", status: "completed", title: "B2", author: null },
      { conceptId: "k1", type: "course", status: "completed", title: "C1", author: null },
      { conceptId: "k1", type: "paper", status: "consuming", title: "P1", author: null },
      { conceptId: "k1", type: "video", status: "planned", title: "V1", author: null },
      { conceptId: "k1", type: "article", status: "abandoned", title: "X1", author: null },
    ];

    const led = computeReadinessLedger({ ...EMPTY, resources });
    expect(led.trail.total).toBe(3);
    expect(led.trail.byType).toEqual([
      { type: "book", count: 2 },
      { type: "course", count: 1 },
    ]);
    expect(led.trail.named.map((n) => n.title)).toEqual(["B1", "B2", "C1"]);
    expect(led.trail.named[0]).toEqual({ title: "B1", author: "A1", type: "book" });
  });

  it(`caps named resources at TRAIL_NAMED_LIMIT (${TRAIL_NAMED_LIMIT}) but not the total`, () => {
    const resources: ResourceInput[] = Array.from({ length: 12 }, (_, i) => ({
      conceptId: "k1",
      type: "article" as const,
      status: "completed" as const,
      title: `R${i}`,
      author: null,
    }));

    const led = computeReadinessLedger({ ...EMPTY, resources });
    expect(led.trail.total).toBe(12);
    expect(led.trail.named).toHaveLength(TRAIL_NAMED_LIMIT);
    expect(led.trail.byType).toEqual([{ type: "article", count: 12 }]);
  });

  it("omitted resources behave exactly like none completed", () => {
    const led = computeReadinessLedger(EMPTY);
    expect(led.trail).toEqual({ total: 0, byType: [], named: [] });
  });
});

/* ── the new sections survive projection ────────────────────────────────── */

describe("summarizeReadinessLedger — new sections pass through unchanged", () => {
  it("mirrors evidence, artefact counts, activity, trail and coverage", () => {
    const input: ReadinessInput = {
      clusters: [{ id: "C", weight: 3, isArtefactBearing: true }],
      concepts: [
        { id: "k1", clusterId: "C", status: "learning", subSkillId: "S" },
        { id: "k2", clusterId: "C", status: "understood", subSkillId: "S" },
      ],
      competencyChecks: [{ conceptId: "k1", score: 5, completedAt: D }],
      artefacts: [
        { id: "a1", clusterId: "C", verifiedAt: D, demonstratedConceptIds: [], type: "project", title: "T" },
      ],
      foundationItems: [],
      resources: [{ conceptId: "k1", type: "book", status: "completed", title: "B", author: null }],
    };

    const led = computeReadinessLedger(input);
    const s = summarizeReadinessLedger(led);

    expect(s.evidence).toEqual(led.evidence);
    expect(s.artefactCounts).toEqual(led.artefacts);
    expect(s.activity).toEqual(led.activity);
    expect(s.trail).toEqual(led.trail);
    expect(s.coverage).toEqual(led.coverage);

    // And the two artefact units remain distinguishable after projection.
    expect(s.artefactCounts.completed).toBe(1);
    expect(s.artefacts.backed).toBe(1);
    expect(s.concepts.verified).toBe(1);
    expect(s.activity.conceptsInProgress).toBe(1);
  });
});
