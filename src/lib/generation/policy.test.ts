import { describe, it, expect, vi } from "vitest";
import {
  MAX_UNIT_ATTEMPTS,
  deriveGenerationLabel,
  isGenerationSettled,
  isUnitClaimable,
  runWithRetry,
  type GenStatus,
} from "./policy";

const NOW = 1_000_000_000_000; // fixed clock; Date math only, no real time

describe("isUnitClaimable — idempotent resume (req 2)", () => {
  it("skips completed units", () => {
    expect(
      isUnitClaimable(
        { status: "complete", attempts: 1, startedAt: null },
        { now: NOW },
      ),
    ).toBe(false);
  });

  it("claims pending units", () => {
    expect(
      isUnitClaimable(
        { status: "pending", attempts: 0, startedAt: null },
        { now: NOW },
      ),
    ).toBe(true);
  });

  it("claims failed units only while attempts remain", () => {
    expect(
      isUnitClaimable(
        { status: "failed", attempts: MAX_UNIT_ATTEMPTS - 1, startedAt: null },
        { now: NOW },
      ),
    ).toBe(true);
    expect(
      isUnitClaimable(
        { status: "failed", attempts: MAX_UNIT_ATTEMPTS, startedAt: null },
        { now: NOW },
      ),
    ).toBe(false);
  });

  it("reclaims a 'running' unit only once its claim is stale", () => {
    const staleMs = 60_000;
    const fresh = new Date(NOW - staleMs + 1); // within window → still owned
    const stale = new Date(NOW - staleMs - 1); // past window → abandoned
    expect(
      isUnitClaimable(
        { status: "running", attempts: 0, startedAt: fresh },
        { now: NOW, staleMs },
      ),
    ).toBe(false);
    expect(
      isUnitClaimable(
        { status: "running", attempts: 0, startedAt: stale },
        { now: NOW, staleMs },
      ),
    ).toBe(true);
  });

  it("a mixed set resumes exactly the incomplete units", () => {
    const units: {
      id: string;
      status: GenStatus;
      attempts: number;
      startedAt: Date | null;
    }[] = [
      { id: "done", status: "complete", attempts: 1, startedAt: null },
      { id: "queued", status: "pending", attempts: 0, startedAt: null },
      { id: "retryable", status: "failed", attempts: 1, startedAt: null },
      { id: "exhausted", status: "failed", attempts: 2, startedAt: null },
    ];
    const claimed = units
      .filter((u) => isUnitClaimable(u, { now: NOW }))
      .map((u) => u.id);
    expect(claimed).toEqual(["queued", "retryable"]);
  });
});

describe("runWithRetry — failure → retry(2) → failed (req 3)", () => {
  it("retries up to maxAttempts then reports failed", async () => {
    const attempt = vi.fn(async () => {
      throw new Error("grok boom");
    });
    const onSuccess = vi.fn();
    const onFailure = vi.fn();
    const delay = vi.fn(async () => {});

    const result = await runWithRetry({
      startAttempt: 1,
      maxAttempts: MAX_UNIT_ATTEMPTS,
      attempt,
      onSuccess,
      onFailure,
      delay,
    });

    expect(result).toBe("failed");
    expect(attempt).toHaveBeenCalledTimes(MAX_UNIT_ATTEMPTS);
    expect(onSuccess).not.toHaveBeenCalled();
    // Non-final attempt: exhausted=false; final attempt: exhausted=true.
    expect(onFailure.mock.calls.map((c) => c[2])).toEqual([false, true]);
    // Backoff runs between attempts, never after the last.
    expect(delay).toHaveBeenCalledTimes(MAX_UNIT_ATTEMPTS - 1);
  });

  it("stops and succeeds as soon as an attempt lands", async () => {
    let calls = 0;
    const attempt = vi.fn(async () => {
      calls += 1;
      if (calls < 2) throw new Error("transient");
      return "concepts";
    });
    const onSuccess = vi.fn();
    const onFailure = vi.fn();

    const result = await runWithRetry({
      startAttempt: 1,
      maxAttempts: MAX_UNIT_ATTEMPTS,
      attempt,
      onSuccess,
      onFailure,
      delay: async () => {},
    });

    expect(result).toBe("complete");
    expect(attempt).toHaveBeenCalledTimes(2);
    expect(onSuccess).toHaveBeenCalledWith("concepts", 2);
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onFailure.mock.calls[0][2]).toBe(false);
  });

  it("resumes attempt numbering from prior attempts", async () => {
    // A unit that already failed once (attempts=1) gets exactly one more try.
    const attempt = vi.fn(async () => {
      throw new Error("still failing");
    });
    const onFailure = vi.fn();
    const result = await runWithRetry({
      startAttempt: 2,
      maxAttempts: MAX_UNIT_ATTEMPTS,
      attempt,
      onSuccess: vi.fn(),
      onFailure,
      delay: async () => {},
    });
    expect(result).toBe("failed");
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(onFailure).toHaveBeenCalledWith(2, expect.any(Error), true);
  });
});

describe("settle / derive — status transitions (reqs 3 & 4)", () => {
  const done = { status: "complete" as const };
  const failed = { status: "failed" as const };
  const running = { status: "running" as const };
  const pending = { status: "pending" as const };

  it("full success settles to complete (req 4)", () => {
    const units = [done, done, done];
    expect(isGenerationSettled(units)).toBe(true);
    expect(deriveGenerationLabel(units)).toBe("complete");
  });

  it("settled with a failed unit is partial (req 3)", () => {
    const units = [done, failed, done];
    expect(isGenerationSettled(units)).toBe(true);
    expect(deriveGenerationLabel(units)).toBe("partial");
  });

  it("still-running / still-pending is not settled", () => {
    expect(isGenerationSettled([done, running])).toBe(false);
    expect(deriveGenerationLabel([done, pending])).toBe("generating");
    // A failure alongside outstanding work is NOT terminal yet.
    expect(deriveGenerationLabel([failed, running])).toBe("generating");
  });
});
