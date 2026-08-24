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
 *   attach_evidence passed, in an artefact-BEARING cluster with no backed artefact
 *   move_on         verified, nothing further here — go to the next unverified
 *   done            verified and nothing unverified remains anywhere
 *
 * Note the two states that deliberately do NOT exist:
 *  - a concept verified by artefact but with no passed check is `move_on`, not a
 *    nag to sit the check. Verified is verified; the ledger already said so.
 *  - a passed check in a NON-bearing cluster is `move_on`, not `attach_evidence`.
 *    Soft, regulatory and pure-knowledge clusters are `isArtefactBearing: false`
 *    by design — asking for a build artefact there contradicts the syllabus.
 */

import type { ConceptLedgerEntry, ReadinessLedger } from "./model";

export type ConceptCta =
  | { state: "study" }
  | { state: "take_check" }
  | { state: "retake_check"; bestScore: number }
  | { state: "attach_evidence"; clusterId: string }
  | { state: "move_on"; nextConceptId: string }
  | { state: "done" };

export interface ConceptCtaInput {
  /** This concept's ledger entry. */
  concept: ConceptLedgerEntry;
  /** `skill_clusters.isArtefactBearing` for its cluster. */
  clusterIsArtefactBearing: boolean;
  /** Whether that cluster already has at least one backed artefact. */
  clusterHasBackedArtefact: boolean;
  /** A recommended resource exists and is not yet completed. */
  primaryResourceUnfinished: boolean;
  /** Next unverified concept to send them to, or null if none remains. */
  nextUnverifiedConceptId: string | null;
}

/** Select the single next step. Total over the input — always returns a state. */
export function selectConceptCta(input: ConceptCtaInput): ConceptCta {
  const { concept } = input;

  if (concept.verified) {
    // Verified via check alone, in a cluster that is supposed to produce an
    // artefact, and none is backed yet → the artefact is the remaining work.
    if (
      input.clusterIsArtefactBearing &&
      !input.clusterHasBackedArtefact &&
      !concept.artefactBacked
    ) {
      return { state: "attach_evidence", clusterId: concept.clusterId };
    }
    return input.nextUnverifiedConceptId
      ? { state: "move_on", nextConceptId: input.nextUnverifiedConceptId }
      : { state: "done" };
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
 * The next concept worth opening: the first unverified one in the current
 * cluster, else the first unverified in a later cluster, else wrapping to
 * earlier clusters. Null only when every concept in the syllabus is verified.
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
