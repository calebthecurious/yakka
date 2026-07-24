import "server-only";
import { and, eq, lt, or } from "drizzle-orm";
import { db } from "@/db";
import {
  concepts,
  resources,
  skillClusters,
  subSkills,
  syllabi,
} from "@/db/schema";
import {
  generateClusterArtefact,
  generateSkeleton,
  generateSubSkillConcepts,
  type GenerateSyllabusInput,
} from "@/lib/ai/generate-syllabus";
import {
  MAX_UNIT_ATTEMPTS,
  STALE_RUNNING_MS,
  isGenerationSettled,
  isUnitClaimable,
  runWithRetry,
} from "./policy";

/**
 * Resumable syllabus generation worker (P1.4).
 *
 * Moves the ~36 sub-skill Grok calls off the request path. Every unit of work —
 * the skeleton, each sub-skill's concepts+resources, each bearing cluster's
 * artefact — is persisted the moment it completes and keyed by its own row's
 * status, so a re-run skips finished units and continues from where a dropped
 * run stopped. Safe to call concurrently for the same syllabus: units are
 * claimed with atomic `UPDATE … RETURNING`, so a claim that affects zero rows
 * simply means another runner (or a prior pass) already owns that unit.
 *
 * The `db` client connects over the pooler role and bypasses RLS (same path the
 * public profile already uses), so the worker needs no per-user auth context;
 * ownership is still enforced upstream in the actions that trigger it.
 */

const UNIT_BACKOFF_MS = 800;
// Bounded fan-out — the pooler is timeout-sensitive (see the middleware 504
// fix), so we never open all ~36 Grok streams / connections at once.
const SUBSKILL_CONCURRENCY = 5;
const ARTEFACT_CONCURRENCY = 3;
// MAX_UNIT_ATTEMPTS + STALE_RUNNING_MS live in ./policy (pure + unit-tested).
// Note: the skeleton has no `*_started_at` clock, so a died-mid-skeleton row
// stays 'running' until a manual retry — acceptable while there is no Cron
// backstop; revisit if we add `skeleton_started_at`.

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const index = next++;
        await fn(items[index]);
      }
    },
  );
  await Promise.all(workers);
}

/**
 * Drive a 'generating' syllabus toward terminal state, resuming from whatever is
 * incomplete. Idempotent and re-entrant. No-op if the syllabus is missing or
 * already terminal (ready/failed).
 */
export async function runSyllabusGeneration(syllabusId: string): Promise<void> {
  const row = await db.query.syllabi.findFirst({
    where: (s, { eq: eqOp }) => eqOp(s.id, syllabusId),
  });
  if (!row || row.status !== "generating") return;

  const input: GenerateSyllabusInput = {
    targetRole: row.targetRole,
    targetCompany: row.targetCompany ?? undefined,
    jobDescription: row.jobDescriptionText,
    currentSkills: row.metadata.currentSkills,
  };

  // Stage 1 — skeleton. A permanent skeleton failure fails the whole syllabus
  // (there is no structure to show); stop there.
  if (row.skeletonStatus !== "complete") {
    const ok = await runSkeleton(syllabusId, input);
    if (!ok) return;
  }

  // Stage 2 — per-sub-skill concepts. Stage 3 — per-bearing-cluster artefacts
  // (only once a cluster's sub-skills are all complete). Then settle status.
  await runSubSkillUnits(syllabusId, input);
  await runArtefactUnits(syllabusId, input);
  await settleStatus(syllabusId);
}

// ── Stage 1: skeleton ────────────────────────────────────────────────────────

async function runSkeleton(
  syllabusId: string,
  input: GenerateSyllabusInput,
): Promise<boolean> {
  // Claim: only from pending/failed. If zero rows, another runner owns it (or
  // it's already complete) — treat as success and move on.
  const claimed = await db
    .update(syllabi)
    .set({ skeletonStatus: "running", generationError: null })
    .where(
      and(
        eq(syllabi.id, syllabusId),
        or(
          eq(syllabi.skeletonStatus, "pending"),
          eq(syllabi.skeletonStatus, "failed"),
        ),
      ),
    )
    .returning({ id: syllabi.id });
  if (claimed.length === 0) return true;

  try {
    const skeleton = await generateSkeleton(input);
    await db.transaction(async (tx) => {
      // Idempotent: clear any prior structure (cascades sub-skills → concepts →
      // resources) before re-persisting this syllabus's skeleton.
      await tx
        .delete(skillClusters)
        .where(eq(skillClusters.syllabusId, syllabusId));

      for (const cluster of skeleton.clusters) {
        const [insertedCluster] = await tx
          .insert(skillClusters)
          .values({
            syllabusId,
            name: cluster.name,
            description: cluster.description,
            type: cluster.type,
            orderIndex: cluster.orderIndex,
            weight: cluster.weight,
            isArtefactBearing: cluster.isArtefactBearing,
            // Non-bearing clusters never produce an artefact — mark their artefact
            // unit complete so the worker never picks them up. Bearing clusters
            // stay 'pending' until stage 3.
            artefactStatus: cluster.isArtefactBearing ? "pending" : "complete",
          })
          .returning({ id: skillClusters.id });

        for (const skill of cluster.subSkills) {
          await tx.insert(subSkills).values({
            clusterId: insertedCluster.id,
            name: skill.name,
            description: skill.description,
            orderIndex: skill.orderIndex,
            estimatedHours: skill.estimatedHours,
            generationStatus: "pending",
          });
        }
      }

      await tx
        .update(syllabi)
        .set({
          roleNature: skeleton.roleNature,
          metadata: {
            structuralBlockers: skeleton.structuralBlockers,
            alternativeTargetBranches: skeleton.alternativeTargetBranches,
            currentSkills: input.currentSkills,
          },
          skeletonStatus: "complete",
          generationError: null,
          updatedAt: new Date(),
        })
        .where(eq(syllabi.id, syllabusId));
    });
    return true;
  } catch (err) {
    await db
      .update(syllabi)
      .set({
        status: "failed",
        skeletonStatus: "failed",
        generationError: errMessage(err),
        updatedAt: new Date(),
      })
      .where(eq(syllabi.id, syllabusId));
    return false;
  }
}

// ── Stage 2: sub-skill concepts ──────────────────────────────────────────────

async function runSubSkillUnits(
  syllabusId: string,
  input: GenerateSyllabusInput,
): Promise<void> {
  const clusters = await db.query.skillClusters.findMany({
    where: (c, { eq: eqOp }) => eqOp(c.syllabusId, syllabusId),
    with: { subSkills: true },
  });
  const now = Date.now();
  const staleBefore = new Date(now - STALE_RUNNING_MS);

  type Unit = {
    ss: (typeof clusters)[number]["subSkills"][number];
    cluster: (typeof clusters)[number];
  };
  const units: Unit[] = [];
  for (const cluster of clusters) {
    for (const ss of cluster.subSkills) {
      if (
        isUnitClaimable(
          {
            status: ss.generationStatus,
            attempts: ss.generationAttempts,
            startedAt: ss.generationStartedAt,
          },
          { now },
        )
      ) {
        units.push({ ss, cluster });
      }
    }
  }

  await mapWithConcurrency(units, SUBSKILL_CONCURRENCY, async ({ ss, cluster }) => {
    const claimed = await db
      .update(subSkills)
      .set({ generationStatus: "running", generationStartedAt: new Date() })
      .where(
        and(
          eq(subSkills.id, ss.id),
          or(
            eq(subSkills.generationStatus, "pending"),
            and(
              eq(subSkills.generationStatus, "failed"),
              lt(subSkills.generationAttempts, MAX_UNIT_ATTEMPTS),
            ),
            and(
              eq(subSkills.generationStatus, "running"),
              lt(subSkills.generationStartedAt, staleBefore),
            ),
          ),
        ),
      )
      .returning({ id: subSkills.id, attempts: subSkills.generationAttempts });
    if (claimed.length === 0) return; // lost the claim race

    await runWithRetry({
      startAttempt: claimed[0].attempts + 1,
      maxAttempts: MAX_UNIT_ATTEMPTS,
      attempt: () =>
        generateSubSkillConcepts(
          input,
          {
            name: cluster.name,
            type: cluster.type,
            description: cluster.description,
          },
          { name: ss.name, description: ss.description },
        ),
      onSuccess: async (generated, attempt) => {
        await db.transaction(async (tx) => {
          // Idempotent: drop any partial concepts (cascades resources) first.
          await tx.delete(concepts).where(eq(concepts.subSkillId, ss.id));
          for (const concept of generated) {
            const [insertedConcept] = await tx
              .insert(concepts)
              .values({
                subSkillId: ss.id,
                name: concept.name,
                description: concept.description,
                orderIndex: concept.orderIndex,
                tier: concept.tier,
              })
              .returning({ id: concepts.id });
            if (concept.suggestedResources.length > 0) {
              await tx.insert(resources).values(
                concept.suggestedResources.map((r) => ({
                  conceptId: insertedConcept.id,
                  type: r.type,
                  title: r.title,
                  url: r.url ?? null,
                  author: r.author ?? null,
                  priority: r.priority,
                  status: "planned" as const,
                })),
              );
            }
          }
          await tx
            .update(subSkills)
            .set({
              generationStatus: "complete",
              generationAttempts: attempt,
              generationError: null,
            })
            .where(eq(subSkills.id, ss.id));
        });
      },
      onFailure: async (attempt, err, exhausted) => {
        await db
          .update(subSkills)
          .set({
            generationAttempts: attempt,
            generationError: errMessage(err),
            // Hold the claim ('running') between retries; mark 'failed' only
            // once attempts are exhausted.
            generationStatus: exhausted ? "failed" : "running",
          })
          .where(eq(subSkills.id, ss.id));
      },
      delay: (attempt) => sleep(UNIT_BACKOFF_MS * attempt),
    });
  });
}

// ── Stage 3: cluster artefacts ───────────────────────────────────────────────

async function runArtefactUnits(
  syllabusId: string,
  input: GenerateSyllabusInput,
): Promise<void> {
  const clusters = await db.query.skillClusters.findMany({
    where: (c, { eq: eqOp }) => eqOp(c.syllabusId, syllabusId),
    with: { subSkills: { with: { concepts: true } } },
  });
  const now = Date.now();
  const staleBefore = new Date(now - STALE_RUNNING_MS);

  const claimable = clusters.filter((c) => {
    if (!c.isArtefactBearing) return false;
    // Only after every sub-skill's concepts exist (the artefact demonstrates them).
    if (!c.subSkills.every((s) => s.generationStatus === "complete")) return false;
    return isUnitClaimable(
      {
        status: c.artefactStatus,
        attempts: c.artefactAttempts,
        startedAt: c.artefactStartedAt,
      },
      { now },
    );
  });

  await mapWithConcurrency(claimable, ARTEFACT_CONCURRENCY, async (cluster) => {
    const claimed = await db
      .update(skillClusters)
      .set({ artefactStatus: "running", artefactStartedAt: new Date() })
      .where(
        and(
          eq(skillClusters.id, cluster.id),
          or(
            eq(skillClusters.artefactStatus, "pending"),
            and(
              eq(skillClusters.artefactStatus, "failed"),
              lt(skillClusters.artefactAttempts, MAX_UNIT_ATTEMPTS),
            ),
            and(
              eq(skillClusters.artefactStatus, "running"),
              lt(skillClusters.artefactStartedAt, staleBefore),
            ),
          ),
        ),
      )
      .returning({ id: skillClusters.id, attempts: skillClusters.artefactAttempts });
    if (claimed.length === 0) return;

    const clusterConcepts = cluster.subSkills
      .flatMap((s) => s.concepts)
      .map((c) => ({ name: c.name, tier: c.tier }));
    const conceptNameToId = new Map<string, string>();
    for (const s of cluster.subSkills) {
      for (const c of s.concepts) {
        conceptNameToId.set(c.name.trim().toLowerCase(), c.id);
      }
    }
    const stripTier = (s: string) =>
      s.replace(/\s*\((?:foundation|intermediate|advanced)\)\s*$/i, "");

    await runWithRetry({
      startAttempt: claimed[0].attempts + 1,
      maxAttempts: MAX_UNIT_ATTEMPTS,
      attempt: () =>
        generateClusterArtefact(
          input,
          {
            name: cluster.name,
            type: cluster.type,
            description: cluster.description,
          },
          clusterConcepts,
        ),
      onSuccess: async (art, attempt) => {
        // Resolve demonstratesConcepts NAMES → concept IDs (mirrors the inline
        // path); drop any name that doesn't match a real concept in this cluster.
        const demonstratesConceptIds = art.demonstratesConcepts
          .map((name) => {
            const norm = name.trim().toLowerCase();
            return (
              conceptNameToId.get(norm) ??
              conceptNameToId.get(stripTier(norm).trim())
            );
          })
          .filter((id): id is string => Boolean(id));

        await db
          .update(skillClusters)
          .set({
            suggestedArtefact: {
              type: art.type,
              title: art.title,
              description: art.description,
              acceptanceCriteria: art.acceptanceCriteria,
            },
            artefactTarget: {
              title: art.title,
              description: art.description,
              employerValue: art.employerValue,
              demonstratesConceptIds,
            },
            artefactStatus: "complete",
            artefactAttempts: attempt,
            artefactError: null,
          })
          .where(eq(skillClusters.id, cluster.id));
      },
      onFailure: async (attempt, err, exhausted) => {
        await db
          .update(skillClusters)
          .set({
            artefactAttempts: attempt,
            artefactError: errMessage(err),
            artefactStatus: exhausted ? "failed" : "running",
          })
          .where(eq(skillClusters.id, cluster.id));
      },
      delay: (attempt) => sleep(UNIT_BACKOFF_MS * attempt),
    });
  });
}

// ── Terminal status ──────────────────────────────────────────────────────────

/**
 * Settle the syllabus to 'ready' once no unit is still pending/running. This
 * holds even when some units are permanently 'failed' — per the product
 * decision, unit failures never fail the whole syllabus; the UI derives a
 * "partial" label from the failed-unit counts. Skeleton failure is terminal
 * ('failed') and handled in {@link runSkeleton}.
 */
async function settleStatus(syllabusId: string): Promise<void> {
  const row = await db.query.syllabi.findFirst({
    where: (s, { eq: eqOp }) => eqOp(s.id, syllabusId),
    with: { clusters: { with: { subSkills: true } } },
  });
  if (!row || row.status !== "generating") return;
  if (row.skeletonStatus !== "complete") return;

  // Every generation unit (each sub-skill + each bearing cluster's artefact).
  const units = [
    ...row.clusters.flatMap((c) =>
      c.subSkills.map((s) => ({ status: s.generationStatus })),
    ),
    ...row.clusters
      .filter((c) => c.isArtefactBearing)
      .map((c) => ({ status: c.artefactStatus })),
  ];
  if (!isGenerationSettled(units)) return; // another runner may still be working

  await db
    .update(syllabi)
    .set({ status: "ready", updatedAt: new Date() })
    .where(eq(syllabi.id, syllabusId));
}
