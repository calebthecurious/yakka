/**
 * Weekly loop (W-3) — the three facts a current-role workspace shows to earn a
 * weekly return, derived HERE from the ledger and nowhere else:
 *
 *   1. the next unverified concept — the P1.9 CTA state machine's ordering
 *      (`findNextUnverifiedConcept`), started from no concept so it yields
 *      the first unverified in syllabus order;
 *   2. the most recent evidence, with its date — PR-3's `occurredAt`;
 *   3. one line of drift — how many concepts became verified in a window.
 *
 * Pure over `ReadinessLedger` plus an explicit `now`, so it is deterministic
 * and unit-tested. The panel renders what this returns and composes nothing.
 * Fields the ledger did not already carry are flagged in the W-3 report.
 */

import { findNextUnverifiedConcept } from "./concept-cta";
import {
  formatEvidenceLabelDated,
  type ConceptEvidence,
  type ReadinessLedger,
} from "./model";

/** The drift window. One number, imported — never inlined in a surface. */
export const DRIFT_WINDOW_DAYS = 30;

export interface RecentEvidence {
  conceptId: string;
  clusterId: string;
  evidence: ConceptEvidence;
  /** ISO instant; never null — undated evidence cannot be "most recent". */
  occurredAt: string;
  /** The taxonomy string, dated. */
  label: string;
}

export interface WeeklyPanelData {
  /** First unverified concept in syllabus order, or null when every concept is verified. */
  nextConceptId: string | null;
  /** Most recent DATED evidence, or null when none exists. */
  recent: RecentEvidence | null;
  /** Concepts whose first evidence landed within the window ending at `now`. */
  verifiedInWindow: number;
  /** Every verified concept, for the "overall" clause. */
  verifiedTotal: number;
  conceptsTotal: number;
  windowDays: number;
  /** ISO instant the window ends at — the `now` the caller supplied. */
  asOf: string;
}

/** First unverified concept in syllabus order, via the CTA machine's ordering. */
export function firstUnverifiedConcept(
  ledger: Pick<ReadinessLedger, "conceptStates" | "breakdown">,
): string | null {
  // An empty "from" id matches no concept, so the machine starts at the first
  // cluster and walks in ledger order without excluding anything.
  return findNextUnverifiedConcept(ledger, "");
}

/** The most recent dated piece of evidence across the whole ledger. */
export function mostRecentEvidence(
  ledger: Pick<ReadinessLedger, "evidence">,
): RecentEvidence | null {
  let best: RecentEvidence | null = null;
  for (const entry of ledger.evidence) {
    for (const e of entry.evidence) {
      if (e.occurredAt == null) continue;
      if (best == null || e.occurredAt > best.occurredAt) {
        best = {
          conceptId: entry.conceptId,
          clusterId: entry.clusterId,
          evidence: e,
          occurredAt: e.occurredAt,
          label: formatEvidenceLabelDated(e),
        };
      }
    }
  }
  return best;
}

/**
 * The instant a concept BECAME verified: the earliest dated evidence it has.
 * Null when the concept is unverified or all its evidence is undated.
 */
export function verifiedAtOf(
  entry: { evidence: ConceptEvidence[] },
): string | null {
  let first: string | null = null;
  for (const e of entry.evidence) {
    if (e.occurredAt == null) continue;
    if (first == null || e.occurredAt < first) first = e.occurredAt;
  }
  return first;
}

/**
 * How many concepts became verified in the `days` ending at `now`. Undated
 * evidence cannot be placed in a window and is excluded — the count is a
 * floor, never an estimate.
 */
export function conceptsVerifiedSince(
  ledger: Pick<ReadinessLedger, "evidence">,
  now: string,
  days: number = DRIFT_WINDOW_DAYS,
): number {
  const nowMs = Date.parse(now);
  if (Number.isNaN(nowMs)) return 0;
  const since = new Date(nowMs - days * 86_400_000).toISOString();
  let n = 0;
  for (const entry of ledger.evidence) {
    const at = verifiedAtOf(entry);
    if (at != null && at >= since && at <= now) n += 1;
  }
  return n;
}

/** Everything the weekly panel renders, in one serialisable object. */
export function weeklyPanelData(
  ledger: ReadinessLedger,
  now: string,
  days: number = DRIFT_WINDOW_DAYS,
): WeeklyPanelData {
  return {
    nextConceptId: firstUnverifiedConcept(ledger),
    recent: mostRecentEvidence(ledger),
    verifiedInWindow: conceptsVerifiedSince(ledger, now, days),
    verifiedTotal: ledger.breakdown.conceptsVerified,
    conceptsTotal: ledger.breakdown.conceptsTotal,
    windowDays: days,
    asOf: now,
  };
}
