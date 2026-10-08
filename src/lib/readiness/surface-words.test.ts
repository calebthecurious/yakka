import { describe, expect, it } from "vitest";
import {
  ARTEFACT_COMPLETE_REOPEN,
  ARTEFACT_FORM_COMPLETE_HINT,
  ARTEFACT_FORM_COMPLETE_LABEL,
  ARTEFACT_MARK_COMPLETE,
  ARTEFACT_MARK_INCOMPLETE,
  ARTEFACT_SELF_ASSESSED,
  CHECK_FAIL_NEXT,
  CHECK_FAIL_NOTHING_WRITTEN,
  CHECK_INTRO,
  CHECK_PASS_WRITTEN,
  SELF_MARK_STATUSES,
  formatCount,
  formatHoursEstimate,
  formatHoursEstimateShort,
  formatMarkAsLabel,
  formatSelfMarkLabel,
  formatVerifiedCount,
  selfMarkFor,
} from "./surface-words";
import { tierByConceptId, tierOf } from "./constellation";
import { computeReadinessLedger, type ReadinessInput } from "./model";

/**
 * H-1 string pins. Every word a surface may put next to a concept, an
 * artefact or a check result is fixed here, byte for byte. Change the product
 * copy and this file changes with it — deliberately, in the same commit.
 */

describe("the learner's own mark", () => {
  it("offers exactly three statuses and never 'verified'", () => {
    expect(SELF_MARK_STATUSES).toEqual(["not_started", "learning", "understood"]);
    expect((SELF_MARK_STATUSES as readonly string[]).includes("verified")).toBe(false);
  });

  it("labels each mark with the taxonomy's rung word", () => {
    expect(formatSelfMarkLabel("not_started")).toBe("Not started");
    expect(formatSelfMarkLabel("learning")).toBe("In progress");
    expect(formatSelfMarkLabel("understood")).toBe("Self-assessed");
  });

  it("reads a legacy 'verified' self-mark as the strongest mark still available", () => {
    expect(selfMarkFor("verified")).toBe("understood");
    expect(selfMarkFor("understood")).toBe("understood");
    expect(selfMarkFor("learning")).toBe("learning");
    expect(selfMarkFor("not_started")).toBe("not_started");
  });

  it("names the checkbox's next state in the taxonomy's words", () => {
    expect(formatMarkAsLabel("learning")).toBe("Mark concept as in progress");
    expect(formatMarkAsLabel("understood")).toBe("Mark concept as self-assessed");
    expect(formatMarkAsLabel("not_started")).toBe("Mark concept as not started");
  });

  it("never produces the retired words", () => {
    const all = SELF_MARK_STATUSES.flatMap((s) => [
      formatSelfMarkLabel(s),
      formatMarkAsLabel(s),
    ]);
    for (const s of all) {
      expect(s).not.toMatch(/learning|understood|verified/i);
    }
  });
});

describe("counts, never percentages", () => {
  it("formats '7 of 12'", () => {
    expect(formatCount(7, 12)).toBe("7 of 12");
    expect(formatCount(0, 0)).toBe("0 of 0");
  });

  it("formats the verified read-out", () => {
    expect(formatVerifiedCount(3, 8)).toBe("3 of 8 concepts verified");
  });

  it("contains no percent sign", () => {
    expect(formatCount(1, 3)).not.toContain("%");
    expect(formatVerifiedCount(1, 3)).not.toContain("%");
  });
});

describe("hours are labelled as estimates", () => {
  it("header and row forms", () => {
    expect(formatHoursEstimate(47)).toBe("~47h, AI estimate");
    expect(formatHoursEstimateShort(20)).toBe("~20h est.");
  });
});

describe("the check flow's copy", () => {
  it("states the pass bar and that a fail writes nothing", () => {
    expect(CHECK_INTRO).toBe(
      "A short quiz across everything you've studied for this concept. Scoring 4/5 or better is written to your record as evidence; a lower score writes nothing.",
    );
    expect(CHECK_PASS_WRITTEN).toBe("Written to your record.");
    expect(CHECK_FAIL_NOTHING_WRITTEN).toBe(
      "Below the pass bar. Nothing was written to your record.",
    );
    expect(CHECK_FAIL_NEXT).toBe(
      "Revisit the resources above for the parts that tripped you up, then run a fresh check when you're ready.",
    );
  });

  it("never offers a self-mark after a pass", () => {
    for (const s of [CHECK_INTRO, CHECK_PASS_WRITTEN, CHECK_FAIL_NOTHING_WRITTEN, CHECK_FAIL_NEXT]) {
      expect(s).not.toMatch(/mark (it|this concept)? ?as understood|understood/i);
    }
  });
});

describe("artefact words", () => {
  it("an incomplete artefact is Self-assessed, the taxonomy's rung-1 word", () => {
    expect(ARTEFACT_SELF_ASSESSED).toBe("Self-assessed");
  });

  it("the owner's action is completion, never 'verify'", () => {
    expect(ARTEFACT_MARK_COMPLETE).toBe("Mark complete");
    expect(ARTEFACT_MARK_INCOMPLETE).toBe("Mark incomplete");
    expect(ARTEFACT_COMPLETE_REOPEN).toBe("Completed — click to reopen");
    expect(ARTEFACT_FORM_COMPLETE_LABEL).toBe("Mark complete");
    expect(ARTEFACT_FORM_COMPLETE_HINT).toBe("— counts as evidence on your public record.");
    for (const s of [
      ARTEFACT_MARK_COMPLETE,
      ARTEFACT_MARK_INCOMPLETE,
      ARTEFACT_COMPLETE_REOPEN,
      ARTEFACT_FORM_COMPLETE_LABEL,
      ARTEFACT_FORM_COMPLETE_HINT,
    ]) {
      expect(s).not.toMatch(/verif/i);
    }
  });
});

describe("tierByConceptId — the surfaces' one lookup", () => {
  const input: ReadinessInput = {
    clusters: [{ id: "C", weight: 3, isArtefactBearing: true }],
    concepts: [
      { id: "k1", clusterId: "C", status: "not_started" },
      { id: "k2", clusterId: "C", status: "learning" },
      { id: "k3", clusterId: "C", status: "understood" },
      { id: "k4", clusterId: "C", status: "verified" }, // self-mark, no evidence
      { id: "k5", clusterId: "C", status: "learning" }, // passed check
      { id: "k6", clusterId: "C", status: "not_started" }, // artefact
    ],
    competencyChecks: [{ conceptId: "k5", score: 5, completedAt: "2026-08-15T00:00:00Z" }],
    artefacts: [
      {
        id: "a1",
        clusterId: "C",
        verifiedAt: "2026-08-17T00:00:00Z",
        demonstratedConceptIds: ["k6"],
      },
    ],
    foundationItems: [],
  };
  const ledger = computeReadinessLedger(input);
  const tiers = tierByConceptId(ledger);

  it("agrees with tierOf for every concept and covers every concept", () => {
    expect(tiers.size).toBe(ledger.conceptStates.length);
    for (const s of ledger.conceptStates) {
      expect(tiers.get(s.conceptId)).toBe(tierOf(s));
    }
  });

  it("a raw 'verified' self-mark is Self-assessed, not Verified", () => {
    expect(tiers.get("k4")).toBe("self_assessed");
  });

  it("evidence promotes regardless of the self-mark", () => {
    expect(tiers.get("k5")).toBe("check_passed");
    expect(tiers.get("k6")).toBe("artefact_verified");
    expect(tiers.get("k2")).toBe("in_progress");
    expect(tiers.get("k3")).toBe("self_assessed");
    expect(tiers.get("k1")).toBe("not_started");
  });

  it("an unknown id is absent, never invented", () => {
    expect(tiers.has("nope")).toBe(false);
  });
});
