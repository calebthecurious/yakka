/**
 * Higher-level display grouping for skill clusters.
 *
 * We do NOT add a new cluster field for this — the grouping is DERIVED from the
 * existing four-value `type` enum (technical | domain | soft | meta):
 *
 *   - "Technical" group   = clusters of type 'technical' or 'domain'
 *   - "Professional" group = clusters of type 'soft' or 'meta'
 *
 * Keep this mapping in ONE place so the tree, mandala, and any future view stay
 * consistent and the rule is trivial to change.
 *
 * KNOWN SHARP EDGE (surfaced deliberately, not solved here): a 'domain' cluster
 * is grouped under "Technical", but for some roles domain knowledge is clearly
 * NON-technical (e.g. regulatory/clinical-research knowledge for a clinical
 * coordinator). For those roles this type→group mapping will misgroup the domain
 * cluster under "Technical". If that looks wrong in testing, the fix is to
 * reconsider whether 'domain' should sometimes group under "Professional" —
 * change it HERE, not inline in components.
 */

export type ClusterTypeValue = "technical" | "domain" | "soft" | "meta";
export type ClusterGroup = "technical" | "professional";

export const CLUSTER_GROUP_LABEL: Record<ClusterGroup, string> = {
  technical: "Technical",
  professional: "Professional",
};

/** Map a single cluster type to its display group. */
export function clusterGroupForType(type: ClusterTypeValue): ClusterGroup {
  return type === "technical" || type === "domain"
    ? "technical"
    : "professional";
}

export type ClusterDisplayGroup<T> = {
  group: ClusterGroup;
  label: string;
  clusters: T[];
};

/**
 * Split an ORDERED list of typed clusters into the two display groups, keeping
 * the input ordering (sequence/orderIndex) within each group. Groups with no
 * clusters are omitted so callers can map straight to headed sections.
 *
 * The "Technical" group is returned first, then "Professional".
 */
export function groupClustersByDisplay<T extends { type: ClusterTypeValue }>(
  clusters: T[],
): ClusterDisplayGroup<T>[] {
  const buckets: Record<ClusterGroup, T[]> = {
    technical: [],
    professional: [],
  };
  for (const cluster of clusters) {
    buckets[clusterGroupForType(cluster.type)].push(cluster);
  }

  const order: ClusterGroup[] = ["technical", "professional"];
  return order
    .filter((group) => buckets[group].length > 0)
    .map((group) => ({
      group,
      label: CLUSTER_GROUP_LABEL[group],
      clusters: buckets[group],
    }));
}
