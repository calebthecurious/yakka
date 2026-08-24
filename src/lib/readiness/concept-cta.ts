/**
 * Concept CTA — the one next step to offer on a concept page.
 *
 * Pure selection over ledger data. Raw `concepts.status` is NOT consulted:
 * self-declaration moves no ledger number, so it cannot decide what the learner
 * should do next either. The single input that is not ledger-derived is whether
 * the recommended resource has been finished — a per-row fact about one
 * resource, passed in explicitly rather than read here.
 *
 * States, in precedence order:
 *   study           a recommended resource is unfinished and no check attempted
 *   take_check      no completed check yet
 *   retake_check    a completed check fell below the pass bar
 *   attach_evidence an artefact-BEARING cluster's target is unbacked — the
 *                   current concept's own cluster first; any other cluster's
 *                   only once no unverified concept remains anywhere
 *   move_on         verified, nothing further here — go to the next unverified
 *   done            every ledger milestone is evidenced: no unverified concept
 *                   and no unbacked artefact target anywhere (headline 100%)
 *
 * `done` is deliberately strict: the ledger's milestone set counts one
 * artefact-target milestone per bearing cluster alongside the concept
 * milestones, so this module may not claim "nothing outstanding" while any of
 * those still moves the headline. The selector therefore consumes BOTH grains —
 * concepts via `nextUnverifiedConceptId`, artefact targets via
 * `unbackedBearingClusterIds`.
 *
 * Notes on states that deliberately do NOT exist:
 *  - a concept verified by artefact but with no passed check is never nagged to
 *    sit the check. Verified is verified; the ledger already said so.
 *  - a verified concept in a NON-bearing cluster is `move_on`, not
 *    `attach_evidence` for that cluster. Soft, regulatory and pure-knowledge
 *    clusters are `isArtefactBearing: false` by design — asking for a build
 *    artefact there contradicts the syllabus. (It can still be routed to
 *    ANOTHER cluster's open artefact once every concept is verified.)
 *
 * And one guard that deliberately does NOT exist: the own-cluster
 * attach_evidence branch is milestone-driven, not concept-driven. A
 * foreign-cluster artefact that happens to demonstrate this concept does not
 * close THIS cluster's artefact target, so it must not suppress the nudge.
 */

import type { ConceptLedgerEntry, ReadinessLedger } from "./model";

export type ConceptCta =
  | { state: "study" }
  | { state: "take_check" }
  | { state: "retake_check"; bestScore: number }
  | { state: "attach_evidence"; clusterId: string; isCurrentCluster: boolean }
  | { state: "move_on"; nextConceptId: string }
  | { state: "done" };

export interface ConceptCtaInput {
  /** This concept's ledger entry. */
  concept: ConceptLedgerEntry;
  /**
   * Bearing clusters whose artefact-target milestone is unbacked, in ledger
   * cluster order. May include the current concept's own cluster. Derive with
   * {@link unbackedBearingClusterIds} — never by hand.
   */
  unbackedBearingClusterIds: string[];
  /** A recommended resource exists and is not yet completed. */
  primaryResourceUnfinished: boolean;
  /** Next unverified concept to send them to, or null if none remains. */
  nextUnverifiedConceptId: string | null;
}

/** Select the single next step. Total over the input — always returns a state. */
export function selectConceptCta(input: ConceptCtaInput): ConceptCta {
  const { concept } = input;

  if (concept.verified) {
    // This cluster's artefact target is still open — that is the remaining
    // work HERE, and it outranks moving on.
    if (input.unbackedBearingClusterIds.includes(concept.clusterId)) {
      return {
        state: "attach_evidence",
        clusterId: concept.clusterId,
        isCurrentCluster: true,
      };
    }
    // Unverified concepts anywhere outrank artefact work elsewhere: concepts
    // are what artefacts demonstrate, so they come first.
    if (input.nextUnverifiedConceptId) {
      return { state: "move_on", nextConceptId: input.nextUnverifiedConceptId };
    }
    // Every concept is verified, but an artefact milestone elsewhere is still
    // moving the headline. Route there rather than claiming done. The own
    // cluster was handled above, so this is genuinely another cluster's.
    const elsewhere = input.unbackedBearingClusterIds[0];
    if (elsewhere != null) {
      return {
        state: "attach_evidence",
        clusterId: elsewhere,
        isCurrentCluster: false,
      };
    }
    return { state: "done" };
  }

  // Not verified. A completed-but-failing check is the most specific thing we
  // know, so it outranks the study nudge.
  if (concept.checkAttempted && concept.bestScore != null) {
    return { state: "retake_check", bestScore: concept.bestScore };
  }

  return input.primaryResourceUnfinished
    ? { state: "study" }
    : { state: "take_check" };
}

/**
 * Bearing clusters whose artefact-target milestone is not yet backed, in the
 * ledger's cluster order — exactly the artefact milestones still moving the
 * headline. `done` may only render when this is empty and no concept is
 * unverified; both facts come from the same ledger, so the CTA can never
 * disagree with the headline.
 */
export function unbackedBearingClusterIds(
  ledger: Pick<ReadinessLedger, "breakdown">,
): string[] {
  return ledger.breakdown.clusterWeightsApplied
    .filter((c) => c.artefactTargeted === 1 && c.artefactBacked === 0)
    .map((c) => c.clusterId);
}

/**
 * The next concept worth opening: the first unverified one in the current
 * cluster, else the first unverified in a later cluster, else wrapping to
 * earlier clusters. The current concept is always excluded — its own CTA
 * handles it — so this is null exactly when no OTHER concept is unverified.
 *
 * Order comes from the ledger: `conceptStates` is in input order, which is the
 * loader's cluster-orderIndex walk, i.e. syllabus display order.
 */
export function findNextUnverifiedConcept(
  ledger: Pick<ReadinessLedger, "conceptStates" | "breakdown">,
  fromConceptId: string,
): string | null {
  const states = ledger.conceptStates;
  const current = states.find((c) => c.conceptId === fromConceptId) ?? null;

  const unverified = (c: ConceptLedgerEntry) =>
    !c.verified && c.conceptId !== fromConceptId;

  // 1. Same cluster first — finish what you are already in.
  if (current) {
    const sameCluster = states.find(
      (c) => c.clusterId === current.clusterId && unverified(c),
    );
    if (sameCluster) return sameCluster.conceptId;
  }

  // 2. Then later clusters, then wrap. Cluster order is the ledger's.
  const clusterOrder = ledger.breakdown.clusterWeightsApplied.map(
    (c) => c.clusterId,
  );
  const startAt = current ? clusterOrder.indexOf(current.clusterId) + 1 : 0;
  const rotated = [
    ...clusterOrder.slice(startAt),
    ...clusterOrder.slice(0, Math.max(startAt, 0)),
  ];

  for (const clusterId of rotated) {
    if (current && clusterId === current.clusterId) continue; // already tried
    const hit = states.find((c) => c.clusterId === clusterId && unverified(c));
    if (hit) return hit.conceptId;
  }

  return null;
}
