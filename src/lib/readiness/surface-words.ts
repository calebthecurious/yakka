/**
 * Surface words (H-1) — the only strings a workspace surface may put next to
 * a concept's state, an artefact's state, or a check result, beyond what
 * `formatTierLabel` and the evidence formatters already emit.
 *
 * Why this file exists: docs/design/app-screen-map.md found six files
 * rendering "Learning" / "Understood", five rendering "Verified" from raw
 * `concepts.status`, a check flow that ended in a self-mark, and artefact
 * rows saying "Self-logged" / "Not yet verified" / "Completed". Every one of
 * those strings now comes from here, so `surface-words.test.ts` can pin them
 * and `taxonomy-conformance.test.ts` can fail the moment a surface composes
 * its own.
 *
 * Vocabulary, per docs/verification-taxonomy.md:
 *   - a concept's STATE is a tier word (`formatTierLabel`): Verified /
 *     Self-assessed / In progress / Not started;
 *   - the learner's own MARK on a concept uses the same words for rungs 0–1
 *     and never offers Verified — raw status grants nothing;
 *   - an artefact without `verifiedAt` is Self-assessed; with it, the ledger
 *     grants Verified and the card says `formatArtefactVerifiedLabel`;
 *   - the owner's action on an artefact is COMPLETION (what `verifiedAt`
 *     records), so the buttons say complete / incomplete, never verified.
 */

import type { ConstellationTier } from "./constellation";
import { formatTierLabel } from "./constellation";
import {
  COMPETENCY_CHECK_OUT_OF,
  PASS_BAR,
  type ConceptStatus,
} from "./model";

/* ── The learner's own mark (status control, tree checkbox) ───────────────── */

/** The raw statuses a learner may SET. `verified` is deliberately absent. */
export type SelfMarkStatus = Exclude<ConceptStatus, "verified">;

export const SELF_MARK_STATUSES: readonly SelfMarkStatus[] = [
  "not_started",
  "learning",
  "understood",
];

/** Taxonomy word for each raw status the learner can set. */
export function formatSelfMarkLabel(status: SelfMarkStatus): string {
  switch (status) {
    case "not_started":
      return formatTierLabel("not_started");
    case "learning":
      return formatTierLabel("in_progress");
    case "understood":
      return formatTierLabel("self_assessed");
  }
}

/**
 * A legacy `verified` self-mark (rows written before H-1) is shown as the
 * strongest mark the learner may still make. It never grants anything.
 */
export function selfMarkFor(status: ConceptStatus): SelfMarkStatus {
  return status === "verified" ? "understood" : status;
}

/** Tree checkbox: what the next click will set, in the taxonomy's words. */
export function formatMarkAsLabel(next: SelfMarkStatus): string {
  return `Mark concept as ${formatSelfMarkLabel(next).toLowerCase()}`;
}

/* ── Counts, never percentages ────────────────────────────────────────────── */

/** `7 of 12` — the only shape a progress number takes on a surface. */
export function formatCount(done: number, total: number): string {
  return `${done} of ${total}`;
}

/** `7 of 12 concepts verified` — the mandala's and tree's read-out. */
export function formatVerifiedCount(done: number, total: number): string {
  return `${formatCount(done, total)} concepts verified`;
}

/** The syllabus header's hours line: a sum of AI estimates, labelled so. */
export function formatHoursEstimate(hours: number): string {
  return `~${hours}h, AI estimate`;
}

/** A sub-skill row's hours: the AI's own estimate for that sub-skill. */
export function formatHoursEstimateShort(hours: number): string {
  return `~${hours}h est.`;
}

/* ── The check flow ───────────────────────────────────────────────────────── */

export const CHECK_INTRO = `A short quiz across everything you've studied for this concept. Scoring ${PASS_BAR}/${COMPETENCY_CHECK_OUT_OF} or better is written to your record as evidence; a lower score writes nothing.`;

/** Shown beneath the taxonomy's dated evidence label after a pass. */
export const CHECK_PASS_WRITTEN = "Written to your record.";

/** Shown with the score after a fail. Nothing else is claimed. */
export const CHECK_FAIL_NOTHING_WRITTEN =
  "Below the pass bar. Nothing was written to your record.";

export const CHECK_FAIL_NEXT =
  "Revisit the resources above for the parts that tripped you up, then run a fresh check when you're ready.";

/* ── Artefacts ────────────────────────────────────────────────────────────── */

/** An artefact the owner has logged but not completed: rung 1's word. */
export const ARTEFACT_SELF_ASSESSED = formatTierLabel("self_assessed");

/** The owner's action, as completion — never "verify". */
export const ARTEFACT_MARK_COMPLETE = "Mark complete";
export const ARTEFACT_MARK_INCOMPLETE = "Mark incomplete";
export const ARTEFACT_COMPLETE_REOPEN = "Completed — click to reopen";
export const ARTEFACT_FORM_COMPLETE_LABEL = "Mark complete";
export const ARTEFACT_FORM_COMPLETE_HINT =
  "— counts as evidence on your public record.";

/* ── Tier words, re-exported so surfaces import one module ───────────────── */

export { formatTierLabel };
export type { ConstellationTier };
