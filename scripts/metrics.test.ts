import { describe, it, expect } from "vitest";
import {
  W4_MIN_AGE_DAYS,
  cohortLine,
  daysBetween,
  fmtCount,
  week4Cohort,
  week4Window,
} from "./metrics-lib";

const NOW = "2026-10-03T12:00:00.000Z";
const ago = (days: number) => new Date(Date.parse(NOW) - days * 86_400_000).toISOString();

describe("week4Window", () => {
  it("is days 22..28 after creation, inclusive bounds", () => {
    const w = week4Window("2026-09-01T00:00:00.000Z");
    expect(w.from).toBe("2026-09-23T00:00:00.000Z");
    expect(w.to).toBe("2026-09-29T00:00:00.000Z");
  });
});

describe("week4Cohort", () => {
  it("renders insufficient data with no workspaces", () => {
    const r = week4Cohort([], [], NOW);
    expect(r).toEqual({ eligible: 0, returned: 0, ratePct: null, oldestAgeDays: null });
    expect(cohortLine(r)).toBe("insufficient data — no current_role workspaces yet");
  });

  it("renders insufficient data while every workspace is younger than 28 days, naming the oldest", () => {
    const r = week4Cohort(
      [
        { syllabusId: "a", userId: "u1", createdAt: ago(3) },
        { syllabusId: "b", userId: "u1", createdAt: ago(27.9) },
      ],
      [{ userId: "u1", at: ago(1) }],
      NOW,
    );
    expect(r.eligible).toBe(0);
    expect(r.oldestAgeDays).toBe(27);
    expect(cohortLine(r)).toBe(
      `insufficient data — no current_role workspace is ${W4_MIN_AGE_DAYS} days old yet (oldest: 27d)`,
    );
  });

  it("counts a return only for activity inside days 22–28 of THAT workspace", () => {
    const ws = [
      { syllabusId: "a", userId: "u1", createdAt: ago(30) }, // window: ago(8)..ago(2)
      { syllabusId: "b", userId: "u2", createdAt: ago(40) }, // window: ago(18)..ago(12)
      { syllabusId: "c", userId: "u3", createdAt: ago(28) }, // window: ago(6)..ago(0)
    ];
    const acts = [
      { userId: "u1", at: ago(5) }, // inside a's window → returned
      { userId: "u2", at: ago(5) }, // outside b's window (too late) → not returned
      { userId: "u2", at: ago(20) }, // before b's window → not returned
      { userId: "u3", at: ago(0.5) }, // inside c's window → returned
    ];
    const r = week4Cohort(ws, acts, NOW);
    expect(r).toMatchObject({ eligible: 3, returned: 2, ratePct: 66.7 });
    expect(cohortLine(r)).toBe("2 / 3 returned in week 4 (66.7%)");
  });

  it("never counts an orphan workspace as eligible", () => {
    const r = week4Cohort([{ syllabusId: "a", userId: null, createdAt: ago(60) }], [], NOW);
    expect(r.eligible).toBe(0);
    expect(r.oldestAgeDays).toBe(60);
  });

  it("activity by another user never counts", () => {
    const r = week4Cohort(
      [{ syllabusId: "a", userId: "u1", createdAt: ago(30) }],
      [{ userId: "u2", at: ago(5) }],
      NOW,
    );
    expect(r).toMatchObject({ eligible: 1, returned: 0, ratePct: 0 });
  });
});

describe("helpers", () => {
  it("daysBetween", () => {
    expect(daysBetween(ago(7), NOW)).toBe(7);
  });
  it("fmtCount says not instrumented for null", () => {
    expect(fmtCount(3)).toBe("3");
    expect(fmtCount(null)).toBe("not instrumented");
    expect(fmtCount(null, "A8")).toBe("not instrumented — A8");
  });
});
