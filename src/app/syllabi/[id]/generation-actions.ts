"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { skillClusters, subSkills, syllabi } from "@/db/schema";
import { requireCurrentUserId } from "@/lib/auth";
import {
  requireOwnedCluster,
  requireOwnedSubSkill,
  requireOwnedSyllabus,
} from "@/lib/ownership";
import { runSyllabusGeneration } from "@/lib/generation/run";

/**
 * Retry a single failed generation unit. Resets it to 'pending' (attempts 0),
 * flips the syllabus back to 'generating' so the page's resume trigger + worker
 * pick it up, and kicks the worker immediately. Ownership is enforced here (the
 * `db` path bypasses RLS), and the reset is guarded on generationStatus='failed'
 * so a stray call can't disturb an in-flight or completed unit.
 */
export async function retrySubSkillUnit(
  syllabusId: string,
  subSkillId: string,
): Promise<void> {
  const userId = await requireCurrentUserId();
  await requireOwnedSyllabus(syllabusId, userId);
  await requireOwnedSubSkill(subSkillId, userId);

  await db
    .update(subSkills)
    .set({
      generationStatus: "pending",
      generationAttempts: 0,
      generationError: null,
      generationStartedAt: null,
    })
    .where(
      and(
        eq(subSkills.id, subSkillId),
        eq(subSkills.generationStatus, "failed"),
      ),
    );

  await db
    .update(syllabi)
    .set({ status: "generating", updatedAt: new Date() })
    .where(eq(syllabi.id, syllabusId));

  revalidatePath(`/syllabi/${syllabusId}`);
  after(() => runSyllabusGeneration(syllabusId));
}

export async function retryClusterArtefactUnit(
  syllabusId: string,
  clusterId: string,
): Promise<void> {
  const userId = await requireCurrentUserId();
  await requireOwnedSyllabus(syllabusId, userId);
  await requireOwnedCluster(clusterId, userId);

  await db
    .update(skillClusters)
    .set({
      artefactStatus: "pending",
      artefactAttempts: 0,
      artefactError: null,
      artefactStartedAt: null,
    })
    .where(
      and(
        eq(skillClusters.id, clusterId),
        eq(skillClusters.artefactStatus, "failed"),
      ),
    );

  await db
    .update(syllabi)
    .set({ status: "generating", updatedAt: new Date() })
    .where(eq(syllabi.id, syllabusId));

  revalidatePath(`/syllabi/${syllabusId}`);
  after(() => runSyllabusGeneration(syllabusId));
}
