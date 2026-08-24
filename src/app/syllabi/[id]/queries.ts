import { connection } from "next/server";
import { db } from "@/db";
import {
  computeReadinessLedger,
  type ArtefactInput,
  type CompetencyCheckInput,
  type ConceptInput,
  type FoundationItemInput,
  type ReadinessInput,
  type ReadinessLedger,
} from "@/lib/readiness/model";

/**
 * The single syllabus-tree read, scoped to the owner by the `userId` predicate
 * (the established read-scoping path — same as loadProfile/loadData). Used both
 * to render the syllabus page and to compute the readiness ledger, so the tree
 * is loaded once. Extend the `with` here rather than adding a parallel loader.
 *
 * Beyond the tree the page renders, this also pulls the two extra branches the
 * readiness reducer needs: each concept's competency-check results, and the
 * syllabus's foundation items (their self-declared userStatus). The page simply
 * ignores those fields.
 */
export async function loadSyllabus(id: string, userId: string) {
  await connection();

  return db.query.syllabi.findFirst({
    where: (s, { and, eq }) => and(eq(s.id, id), eq(s.userId, userId)),
    with: {
      clusters: {
        orderBy: (c, { asc }) => [asc(c.orderIndex)],
        with: {
          subSkills: {
            // Load-bearing, not cosmetic: the ledger's `conceptStates` is
            // documented as syllabus display order, and the concept CTA's
            // move_on target is picked positionally from it.
            orderBy: (s, { asc }) => [asc(s.orderIndex)],
            with: {
              concepts: {
                orderBy: (c, { asc }) => [asc(c.orderIndex)],
                with: {
                  resources: true,
                  competencyChecks: {
                    columns: { score: true, completedAt: true },
                  },
                },
              },
              artefacts: {
                orderBy: (a, { desc }) => [desc(a.createdAt)],
              },
            },
          },
        },
      },
      foundationItems: {
        columns: { type: true, userStatus: true },
      },
    },
  });
}

export type LoadedSyllabus = NonNullable<Awaited<ReturnType<typeof loadSyllabus>>>;

/**
 * Pure projection from the loaded Drizzle tree into the readiness model's input.
 * No DB, no I/O — kept separate from the connection-bound loader so it can be
 * run and tested without a request scope.
 *
 * Projection notes:
 *  - Artefacts attach at the sub-skill level in the schema; each is resolved up
 *    to its parent cluster (artefact → subSkill → cluster).
 *  - Each concept carries its own competency-check results.
 *  - Foundation items map straight to FoundationItemInput.
 */
export function projectReadinessInput(syllabus: LoadedSyllabus): ReadinessInput {
  const clusters = syllabus.clusters.map((cluster) => ({
    id: cluster.id,
    weight: cluster.weight,
    isArtefactBearing: cluster.isArtefactBearing,
  }));

  const concepts: ConceptInput[] = [];
  const competencyChecks: CompetencyCheckInput[] = [];
  const artefacts: ArtefactInput[] = [];

  for (const cluster of syllabus.clusters) {
    for (const subSkill of cluster.subSkills) {
      for (const concept of subSkill.concepts) {
        concepts.push({
          id: concept.id,
          clusterId: cluster.id,
          // Sub-skill grain: without this the ledger's `subSkillsApplied` is
          // empty and `subSkillCoverage.complete` is false, so the tree's
          // per-sub-skill counts would render 0/0.
          subSkillId: subSkill.id,
          status: concept.status,
        });
        for (const check of concept.competencyChecks) {
          competencyChecks.push({
            conceptId: concept.id,
            score: check.score,
            completedAt: check.completedAt,
          });
        }
      }
      for (const artefact of subSkill.artefacts) {
        // Resolve artefact → subSkill → cluster.
        artefacts.push({
          id: artefact.id,
          clusterId: cluster.id,
          verifiedAt: artefact.verifiedAt,
          demonstratedConceptIds: artefact.demonstratedConceptIds,
        });
      }
    }
  }

  const foundationItems: FoundationItemInput[] = syllabus.foundationItems.map(
    (f) => ({ type: f.type, userStatus: f.userStatus }),
  );

  return { clusters, concepts, competencyChecks, artefacts, foundationItems };
}

/**
 * The ledger for a tree that has ALREADY been loaded. Pure — no DB, no second
 * query. Use this from any server component that has called {@link loadSyllabus}
 * already (the syllabus page does), so rendering readiness costs one deep query,
 * not two.
 */
export function readinessForLoadedSyllabus(
  syllabus: LoadedSyllabus,
): ReadinessLedger {
  return computeReadinessLedger(projectReadinessInput(syllabus));
}

/**
 * The honest role-readiness source of truth for a syllabus. Loads the owned tree
 * via {@link loadSyllabus} (reusing its userId scoping — never bypassing it),
 * projects it into the pure model's `ReadinessInput`, and runs
 * `computeReadinessLedger`. Returns null when the syllabus isn't found / owned.
 *
 * Standalone entry point for callers that do NOT already hold the tree. If you
 * do hold it, call {@link readinessForLoadedSyllabus} instead — this one pays
 * for a second `loadSyllabus`.
 */
export async function getReadinessForSyllabus(
  syllabusId: string,
  userId: string,
): Promise<ReadinessLedger | null> {
  const syllabus = await loadSyllabus(syllabusId, userId);
  if (!syllabus) return null;
  return readinessForLoadedSyllabus(syllabus);
}
