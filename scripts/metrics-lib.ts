/**
 * Pure helpers for scripts/metrics.ts (8.3 / W-4). No I/O. Everything with a
 * judgement in it — windows, cohort eligibility, "insufficient data" — lives
 * here under test, so the script is a thin shell of SQL + printing.
 */

export const DAY_MS = 86_400_000;
/** Activity window for "weekly active". */
export const WEEK_DAYS = 7;
/** Week-4 return: the workspace must be at least this old to be in the cohort. */
export const W4_MIN_AGE_DAYS = 28;
/** Week 4 = days 22..28 after creation, inclusive. */
export const W4_WINDOW = { fromDay: 22, toDay: 28 } as const;

export interface Workspace {
  syllabusId: string;
  userId: string | null;
  createdAt: string; // ISO
}

/** One activity instant for a user (passed check, verified artefact, logged session). */
export interface Activity {
  userId: string;
  at: string; // ISO
}

export function daysBetween(fromIso: string, toIso: string): number {
  return (Date.parse(toIso) - Date.parse(fromIso)) / DAY_MS;
}

/** The week-4 window for a workspace, as ISO bounds. */
export function week4Window(createdAtIso: string): { from: string; to: string } {
  const c = Date.parse(createdAtIso);
  return {
    from: new Date(c + W4_WINDOW.fromDay * DAY_MS).toISOString(),
    to: new Date(c + W4_WINDOW.toDay * DAY_MS).toISOString(),
  };
}

export interface CohortResult {
  eligible: number;
  returned: number;
  /** 0–100, or null when eligible is 0. */
  ratePct: number | null;
  /** Age in days of the oldest workspace, or null when there are none. */
  oldestAgeDays: number | null;
}

/**
 * Week-4 return cohort: among workspaces at least 28 days old, how many had
 * ANY activity by their user in days 22–28 after creation. A workspace with no
 * user (orphan) is never eligible. Deterministic over `now`.
 */
export function week4Cohort(
  workspaces: Workspace[],
  activity: Activity[],
  nowIso: string,
): CohortResult {
  const byUser = new Map<string, string[]>();
  for (const a of activity) {
    const list = byUser.get(a.userId) ?? [];
    list.push(a.at);
    byUser.set(a.userId, list);
  }
  let eligible = 0;
  let returned = 0;
  let oldest: number | null = null;
  for (const w of workspaces) {
    const age = daysBetween(w.createdAt, nowIso);
    if (oldest == null || age > oldest) oldest = age;
    if (w.userId == null || age < W4_MIN_AGE_DAYS) continue;
    eligible += 1;
    const { from, to } = week4Window(w.createdAt);
    const acts = byUser.get(w.userId) ?? [];
    if (acts.some((at) => at >= from && at <= to)) returned += 1;
  }
  return {
    eligible,
    returned,
    ratePct: eligible > 0 ? Math.round((returned / eligible) * 1000) / 10 : null,
    oldestAgeDays: oldest == null ? null : Math.floor(oldest),
  };
}

/** The one honest sentence for the cohort line. */
export function cohortLine(r: CohortResult): string {
  if (r.eligible === 0) {
    if (r.oldestAgeDays == null) return "insufficient data — no current_role workspaces yet";
    return `insufficient data — no current_role workspace is ${W4_MIN_AGE_DAYS} days old yet (oldest: ${r.oldestAgeDays}d)`;
  }
  return `${r.returned} / ${r.eligible} returned in week 4 (${r.ratePct}%)`;
}

/** Format a count that may be "not instrumented". */
export function fmtCount(n: number | null, note?: string): string {
  if (n == null) return note ? `not instrumented — ${note}` : "not instrumented";
  return String(n);
}

/* ── Snapshot mode (A8.3 v2) ─────────────────────────────────────────────── */

/** `YYYY-MM` → the month's half-open bounds in UTC, or null when malformed. */
export function monthBounds(month: string): { from: string; to: string; label: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  const from = new Date(Date.UTC(y, mo - 1, 1));
  const to = new Date(Date.UTC(y, mo, 1));
  return { from: from.toISOString(), to: to.toISOString(), label: `${m[1]}-${m[2]}` };
}

/** The month before the one containing `nowIso` — what a 1st-of-month run snapshots. */
export function previousMonth(nowIso: string): string {
  const d = new Date(nowIso);
  const y = d.getUTCFullYear();
  const mo = d.getUTCMonth(); // 0-based current month
  const prev = new Date(Date.UTC(y, mo - 1, 1));
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Every `YYYY-MM` from `firstMonth` through `lastMonth` inclusive. */
export function monthRange(firstMonth: string, lastMonth: string): string[] {
  const a = monthBounds(firstMonth);
  const b = monthBounds(lastMonth);
  if (!a || !b) return [];
  const out: string[] = [];
  let cur = new Date(a.from);
  const end = new Date(b.from);
  while (cur <= end) {
    out.push(`${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, "0")}`);
    cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
  }
  return out;
}

/** A metric value: a number, or an honest reason it is absent. */
export type MetricValue = number | { notInstrumented: string };

export interface MetricsSnapshot {
  /** Schema version of this file's shape. Bump when fields change meaning. */
  schema: 1;
  month: string;
  /** Window bounds (half-open) the in-window numbers were computed over. */
  window: { from: string; to: string };
  env: "dev" | "prod";
  generatedAt: string;
  /** Cumulative as of `window.to`. */
  cumulative: {
    signups: MetricValue;
    activated: MetricValue;
    profilesSharedExternally: MetricValue;
    currentRoleWorkspaces: MetricValue;
  };
  /** Events/people inside the window. */
  inWindow: {
    evidenceEvents: MetricValue;
    activeUsers: MetricValue;
    profilesSharedExternally: MetricValue;
    currentRoleWorkspacesCreated: MetricValue;
    currentRoleActiveUsers: MetricValue;
  };
  /** As of `window.to`. */
  week4Return: { eligible: number; returned: number; ratePct: number | null } | { notInstrumented: string };
  mrr: MetricValue;
  displacementEvents: MetricValue;
}

export function fmtMetric(v: MetricValue): string {
  return typeof v === "number" ? String(v) : `not yet instrumented — ${v.notInstrumented}`;
}
