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

/* ── AI-written text (H-2) ────────────────────────────────────────────────── */

/**
 * Prefix on every AI-composed summary sentence, rendered muted. Nothing
 * AI-written may read as a ledger fact; the prefix names the author.
 */
export const AI_SUMMARY_PREFIX = "AI summary —";

/**
 * The gap report compares the RESUME to the role. Its findings are matches
 * and gaps in that text, never evidence, so the words "evidenced" and
 * "verified" do not appear here. "In progress" (a tier word) is likewise
 * not used for the AI's "covered by a started concept" bucket.
 */
export const GAP_STRENGTHS_SUBTITLE = "Role requirements your resume already covers.";
export const GAP_STARTED_TITLE = "Covered by concepts you've started";
export const GAP_STARTED_SUBTITLE =
  "Not on your resume yet, but a concept in your syllabus covers it and you've begun.";
export const GAP_NOT_STARTED_SUBTITLE =
  "Requirements your resume doesn't cover and you haven't started.";
export const GAP_NOTHING_OUTSTANDING =
  "Nothing outstanding — every requirement is covered by your resume or by a started concept.";

export function formatGapSummary(input: {
  strengthCount: number;
  topGaps: string[];
  blindSpotCount: number;
}): string {
  const { strengthCount, topGaps, blindSpotCount } = input;
  const strengthPart =
    strengthCount > 0
      ? `${strengthCount} role requirement${strengthCount === 1 ? "" : "s"} matched from your resume`
      : "No role requirement matched from your resume yet";
  const gapPart =
    topGaps.length > 0
      ? `main gaps are ${topGaps.join(", ")}`
      : "no outstanding gaps identified";
  const blindNote =
    blindSpotCount > 0 ? ` (${blindSpotCount} not yet in your syllabus)` : "";
  return `${strengthPart}; ${gapPart}${blindNote}.`;
}

/**
 * Company insight draws on PUBLIC SOURCES. A claim with a retrieved source is
 * "confirmed by a public source" — a statement about provenance, not an
 * evidence tier — so the word "verified" is reserved for the ledger.
 */
export const COMPANY_SOURCED_HEADING = "Confirmed by a public source";
export const COMPANY_SOURCED_EMPTY =
  "No standalone facts could be confirmed from public sources.";
export const COMPANY_SIGNALS_EMPTY =
  "No tech signals could be confirmed from public sources.";
export const COMPANY_DISCLAIMER =
  "Company insights are drawn from public sources and informed inference. Check specifics directly — internal practices aren't always public. Every sourced item links to a page that was retrieved at generation time; inferences are clearly marked and are not facts.";
export const COMPANY_THIN_RESULT =
  "We found limited public information about this company's internal practices — nothing concrete could be tied to a public source this time.";
export const COMPANY_INFERENCES_SUBTITLE =
  "Informed guesses reasoned from public facts — not confirmed by a source, not stated as certain.";

/** The relevance card's third row: where in the role the AI found its basis. */
export const RELEVANCE_BASIS_LABEL = "Basis in the role";

/* ── Tier words, re-exported so surfaces import one module ───────────────── */

export { formatTierLabel };
export type { ConstellationTier };
