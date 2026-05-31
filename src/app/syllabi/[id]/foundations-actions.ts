"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { foundationItems, type NewFoundationItem } from "@/db/schema";
import { generateFoundations as generateFoundationsAi } from "@/lib/ai/generate-foundations";
import type { FoundationClusterNode } from "@/lib/ai/generate-foundations";
import { requireCurrentUserId } from "@/lib/auth";
import { requireOwnedSyllabus } from "@/lib/ownership";

const SyllabusInput = z.object({ syllabusId: z.string().uuid() });

type ActionResult = { ok: true } | { ok: false; message: string };

function normalizeTitle(t: string): string {
  return t.trim().toLowerCase();
}

/**
 * Generate (or regenerate) the foundations / launching point for a syllabus.
 * Replaces existing items, but carries over the user's self-assessment
 * (userStatus) for any assumed_baseline whose title is unchanged, so
 * regenerating doesn't silently wipe what they've already told us.
 */
export async function generateFoundations(
  syllabusId: string,
): Promise<ActionResult> {
  const parsed = SyllabusInput.safeParse({ syllabusId });
  if (!parsed.success) return { ok: false, message: "Invalid syllabus id." };

  try {
    const userId = await requireCurrentUserId();
    await requireOwnedSyllabus(parsed.data.syllabusId, userId);

    const syllabus = await db.query.syllabi.findFirst({
      where: (s, { and, eq: eqx }) =>
        and(eqx(s.id, parsed.data.syllabusId), eqx(s.userId, userId)),
      with: {
        clusters: {
          orderBy: (c, { asc }) => [asc(c.orderIndex)],
          with: {
            subSkills: {
              orderBy: (s, { asc }) => [asc(s.orderIndex)],
              with: {
                concepts: {
                  orderBy: (c, { asc }) => [asc(c.orderIndex)],
                  columns: { id: true, name: true, tier: true },
                },
              },
            },
          },
        },
      },
    });

    if (!syllabus) return { ok: false, message: "Syllabus not found." };

    // Real concept ids so we can reject any linkedConceptId the model invents.
    const knownConceptIds = new Set<string>();
    const syllabusTree: FoundationClusterNode[] = syllabus.clusters.map(
      (cluster) => ({
        name: cluster.name,
        type: cluster.type,
        subSkills: cluster.subSkills.map((sub) => ({
          name: sub.name,
          concepts: sub.concepts.map((concept) => {
            knownConceptIds.add(concept.id);
            return { id: concept.id, name: concept.name, tier: concept.tier };
          }),
        })),
      }),
    );

    const resumeText = (syllabus.metadata.currentSkills ?? "").trim();

    const { foundations, model } = await generateFoundationsAi({
      targetRole: syllabus.targetRole,
      targetCompany: syllabus.targetCompany,
      jobDescription: syllabus.jobDescriptionText,
      roleNature: syllabus.roleNature,
      userResumeText: resumeText || undefined,
      syllabusTree,
    });

    // Preserve prior self-assessment across regeneration, keyed by title.
    const prior = await db.query.foundationItems.findMany({
      where: (f, { and, eq: eqx }) =>
        and(
          eqx(f.syllabusId, parsed.data.syllabusId),
          eqx(f.type, "assumed_baseline"),
        ),
      columns: { title: true, userStatus: true },
    });
    const priorStatus = new Map(
      prior.map((p) => [normalizeTitle(p.title), p.userStatus]),
    );

    const baselineRows: NewFoundationItem[] = foundations.assumedBaselines.map(
      (b, i) => ({
        syllabusId: parsed.data.syllabusId,
        type: "assumed_baseline" as const,
        title: b.title,
        description: b.description,
        sequenceIndex: i,
        suggestedResources: b.suggestedResources,
        linkedConceptId: null,
        userStatus: priorStatus.get(normalizeTitle(b.title)) ?? "unset",
        resumeSignal: b.resumeSignal,
        model,
      }),
    );

    const launchRows: NewFoundationItem[] = foundations.launchSteps.map(
      (s, i) => ({
        syllabusId: parsed.data.syllabusId,
        type: "launch_step" as const,
        title: s.title,
        description: s.description,
        sequenceIndex: i,
        suggestedResources: s.suggestedResources,
        // Defend against hallucinated ids: anything not in the real tree → null.
        linkedConceptId:
          s.linkedConceptId && knownConceptIds.has(s.linkedConceptId)
            ? s.linkedConceptId
            : null,
        userStatus: "unset" as const,
        resumeSignal: null,
        model,
      }),
    );

    await db.transaction(async (tx) => {
      await tx
        .delete(foundationItems)
        .where(eq(foundationItems.syllabusId, parsed.data.syllabusId));
      await tx.insert(foundationItems).values([...baselineRows, ...launchRows]);
    });

    revalidatePath(`/syllabi/${parsed.data.syllabusId}/start`);
    revalidatePath(`/syllabi/${parsed.data.syllabusId}`);
    return { ok: true };
  } catch (err) {
    console.error("[generateFoundations] failed", err);
    return {
      ok: false,
      message:
        err instanceof Error ? err.message : "Foundations generation failed.",
    };
  }
}

const SetStatusInput = z.object({
  itemId: z.string().uuid(),
  status: z.enum(["have_it", "need_it", "unset"]),
});

/**
 * Record the user's self-assessment for one assumed_baseline item. This is the
 * only thing that ever writes userStatus — generation always leaves it 'unset'
 * (or carried over). Guidance only; never gates anything.
 */
export async function setFoundationItemStatus(
  itemId: string,
  status: "have_it" | "need_it" | "unset",
): Promise<ActionResult> {
  const parsed = SetStatusInput.safeParse({ itemId, status });
  if (!parsed.success) return { ok: false, message: "Invalid input." };

  try {
    const userId = await requireCurrentUserId();

    const item = await db.query.foundationItems.findFirst({
      where: (f, { eq: eqx }) => eqx(f.id, parsed.data.itemId),
      with: { syllabus: { columns: { id: true, userId: true } } },
    });

    if (!item || item.syllabus.userId !== userId) {
      return { ok: false, message: "Not found." };
    }
    if (item.type !== "assumed_baseline") {
      return {
        ok: false,
        message: "Only assumed-baseline items can be self-assessed.",
      };
    }

    await db
      .update(foundationItems)
      .set({ userStatus: parsed.data.status })
      .where(eq(foundationItems.id, parsed.data.itemId));

    revalidatePath(`/syllabi/${item.syllabus.id}/start`);
    return { ok: true };
  } catch (err) {
    console.error("[setFoundationItemStatus] failed", err);
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Update failed.",
    };
  }
}
