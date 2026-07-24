/**
 * Pure, DB-free generation policy.
 *
 * The claim / retry / settle DECISIONS the resumable worker (run.ts) makes,
 * extracted so they are unit-testable without a database. run.ts imports these
 * and applies them against Drizzle; keeping the math here mirrors the readiness
 * ledger split (pure model + DB loader).
 */

export type GenStatus = "pending" | "running" | "complete" | "failed";

/** Max attempts per unit before it is marked permanently 'failed'. */
export const MAX_UNIT_ATTEMPTS = 2;

/** A unit left 'running' longer than this is presumed abandoned (its instance
 * died) and may be re-claimed. */
export const STALE_RUNNING_MS = 3 * 60 * 1000;

export interface UnitState {
  status: GenStatus;
  attempts: number;
  /** When the current 'running' claim was taken; null otherwise. */
  startedAt: Date | null;
}

/**
 * Is a unit available to (re)claim? This is the idempotent-resume rule:
 *  - 'complete' → never (finished units are skipped),
 *  - 'pending'  → always,
 *  - 'failed'   → only while attempts remain,
 *  - 'running'  → only once the claim has gone stale (crash recovery).
 */
export function isUnitClaimable(
  unit: UnitState,
  opts: { now: number; maxAttempts?: number; staleMs?: number },
): boolean {
  const maxAttempts = opts.maxAttempts ?? MAX_UNIT_ATTEMPTS;
  const staleMs = opts.staleMs ?? STALE_RUNNING_MS;
  switch (unit.status) {
    case "pending":
      return true;
    case "failed":
      return unit.attempts < maxAttempts;
    case "running":
      return (
        unit.startedAt !== null &&
        unit.startedAt.getTime() < opts.now - staleMs
      );
    case "complete":
      return false;
  }
}

/**
 * Run one unit with bounded retries. Returns 'complete' on the first successful
 * attempt, or 'failed' once `maxAttempts` attempts are exhausted. `onFailure`'s
 * `exhausted` flag is true on the final attempt (caller marks the unit 'failed'),
 * false otherwise (still 'running', will be retried).
 */
export async function runWithRetry<T>(opts: {
  startAttempt: number;
  maxAttempts: number;
  attempt: () => Promise<T>;
  onSuccess: (result: T, attemptNo: number) => Promise<void>;
  onFailure: (
    attemptNo: number,
    err: unknown,
    exhausted: boolean,
  ) => Promise<void>;
  delay?: (attemptNo: number) => Promise<void>;
}): Promise<"complete" | "failed"> {
  for (
    let attempt = opts.startAttempt;
    attempt <= opts.maxAttempts;
    attempt++
  ) {
    try {
      const result = await opts.attempt();
      await opts.onSuccess(result, attempt);
      return "complete";
    } catch (err) {
      const exhausted = attempt >= opts.maxAttempts;
      await opts.onFailure(attempt, err, exhausted);
      if (!exhausted && opts.delay) await opts.delay(attempt);
    }
  }
  return "failed";
}

/** No unit is still pending or running — generation has stopped for this syllabus. */
export function isGenerationSettled(units: { status: GenStatus }[]): boolean {
  return !units.some(
    (u) => u.status === "pending" || u.status === "running",
  );
}

export function hasFailedUnit(units: { status: GenStatus }[]): boolean {
  return units.some((u) => u.status === "failed");
}

/**
 * Syllabus-level label derived from unit statuses (skeleton assumed complete):
 *  - 'generating' → work still outstanding,
 *  - 'complete'   → every unit done,
 *  - 'partial'    → settled with ≥1 permanent failure.
 * The stored `syllabi.status` settles to 'ready' in BOTH terminal cases;
 * 'partial' is a derived label, never a stored status.
 */
export function deriveGenerationLabel(
  units: { status: GenStatus }[],
): "generating" | "complete" | "partial" {
  if (!isGenerationSettled(units)) return "generating";
  return hasFailedUnit(units) ? "partial" : "complete";
}
