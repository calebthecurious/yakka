"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  artefacts,
  type ArtefactCriterion,
  type ArtefactProgressEntry,
} from "@/db/schema";
import { requireCurrentUserId } from "@/lib/auth";
import {
  getProfilePathForUser,
  requireOwnedArtefact,
  requireOwnedCluster,
  requireOwnedConcept,
  requireOwnedSubSkill,
} from "@/lib/ownership";

const ArtefactType = z.enum([
  "project",
  "writeup",
  "certificate",
  "contribution",
]);

const CriterionSchema = z.object({
  text: z.string().trim().min(1),
  done: z.boolean(),
});

async function revalidateAfterArtefactChange(artefactId: string, userId: string) {
  const artefact = await requireOwnedArtefact(artefactId, userId);
  const syllabusId = artefact.subSkill.cluster.syllabus.id;
  revalidatePath(`/artefacts/${artefactId}`);
  revalidatePath(`/syllabi/${syllabusId}`);
  revalidatePath(await getProfilePathForUser(userId));
}

const CommitSuggestedInput = z.object({
  clusterId: z.string().uuid(),
  subSkillId: z.string().uuid(),
});

export async function commitSuggestedArtefact(input: {
  clusterId: string;
  subSkillId: string;
}): Promise<{ ok: false; message: string } | never> {
  const parsed = CommitSuggestedInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid input." };

  let newId: string;
  try {
    const userId = await requireCurrentUserId();
    const cluster = await requireOwnedCluster(parsed.data.clusterId, userId);
    await requireOwnedSubSkill(parsed.data.subSkillId, userId);

    if (!cluster.suggestedArtefact) {
      return { ok: false, message: "Cluster has no suggested artefact." };
    }

    const seedTexts = cluster.suggestedArtefact.acceptanceCriteria ?? [];
    const criteriaSeed: ArtefactCriterion[] = seedTexts.map((text) => ({
      text,
      done: false,
    }));

    const [inserted] = await db
      .insert(artefacts)
      .values({
        subSkillId: parsed.data.subSkillId,
        type: cluster.suggestedArtefact.type,
        title: cluster.suggestedArtefact.title,
        description: cluster.suggestedArtefact.description,
        acceptanceCriteria: criteriaSeed,
      })
      .returning({ id: artefacts.id });

    newId = inserted.id;
    revalidatePath(`/syllabi/${cluster.syllabusId}`);
    revalidatePath(await getProfilePathForUser(userId));
  } catch (err) {
    console.error("[commitSuggestedArtefact] failed", err);
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Commit failed.",
    };
  }

  redirect(`/artefacts/${newId}`);
}

const UpdateCoreInput = z.object({
  artefactId: z.string().uuid(),
  title: z.string().trim().min(1, "Title is required."),
  description: z.string().trim(),
  url: z
    .string()
    .trim()
    .url()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  evidenceUrl: z
    .string()
    .trim()
    .url()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  reflection: z.string().trim(),
  type: ArtefactType,
});

export async function updateArtefactCore(input: {
  artefactId: string;
  title: string;
  description: string;
  url?: string;
  evidenceUrl?: string;
  reflection: string;
  type: "project" | "writeup" | "certificate" | "contribution";
}): Promise<{ ok: boolean; message?: string }> {
  const parsed = UpdateCoreInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }
  try {
    const userId = await requireCurrentUserId();
    await requireOwnedArtefact(parsed.data.artefactId, userId);

    await db
      .update(artefacts)
      .set({
        title: parsed.data.title,
        description: parsed.data.description,
        url: parsed.data.url ?? null,
        evidenceUrl: parsed.data.evidenceUrl ?? null,
        reflection: parsed.data.reflection,
        type: parsed.data.type,
        updatedAt: new Date(),
      })
      .where(eq(artefacts.id, parsed.data.artefactId));
    await revalidateAfterArtefactChange(parsed.data.artefactId, userId);
    return { ok: true };
  } catch (err) {
    console.error("[updateArtefactCore] failed", err);
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Update failed.",
    };
  }
}

const UpdateCriteriaInput = z.object({
  artefactId: z.string().uuid(),
  criteria: z.array(CriterionSchema).max(20),
});

export async function updateArtefactCriteria(input: {
  artefactId: string;
  criteria: ArtefactCriterion[];
}): Promise<{ ok: boolean; message?: string }> {
  const parsed = UpdateCriteriaInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid input." };
  try {
    const userId = await requireCurrentUserId();
    await requireOwnedArtefact(parsed.data.artefactId, userId);

    await db
      .update(artefacts)
      .set({
        acceptanceCriteria: parsed.data.criteria,
        updatedAt: new Date(),
      })
      .where(eq(artefacts.id, parsed.data.artefactId));
    await revalidateAfterArtefactChange(parsed.data.artefactId, userId);
    return { ok: true };
  } catch (err) {
    console.error("[updateArtefactCriteria] failed", err);
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Update failed.",
    };
  }
}

const AddProgressInput = z.object({
  artefactId: z.string().uuid(),
  note: z.string().trim().min(1, "Note cannot be empty.").max(2000),
});

export async function addArtefactProgressEntry(input: {
  artefactId: string;
  note: string;
}): Promise<{ ok: boolean; message?: string }> {
  const parsed = AddProgressInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }
  try {
    const userId = await requireCurrentUserId();
    const row = await requireOwnedArtefact(parsed.data.artefactId, userId);

    const entry: ArtefactProgressEntry = {
      at: new Date().toISOString(),
      note: parsed.data.note,
    };
    const nextLog = [entry, ...row.progressLog];
    await db
      .update(artefacts)
      .set({ progressLog: nextLog, updatedAt: new Date() })
      .where(eq(artefacts.id, parsed.data.artefactId));
    await revalidateAfterArtefactChange(parsed.data.artefactId, userId);
    return { ok: true };
  } catch (err) {
    console.error("[addArtefactProgressEntry] failed", err);
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Update failed.",
    };
  }
}

const SetConceptsInput = z.object({
  artefactId: z.string().uuid(),
  conceptIds: z.array(z.string().uuid()).max(200),
});

export async function setArtefactDemonstratedConcepts(input: {
  artefactId: string;
  conceptIds: string[];
}): Promise<{ ok: boolean; message?: string }> {
  const parsed = SetConceptsInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid input." };
  try {
    const userId = await requireCurrentUserId();
    const artefact = await requireOwnedArtefact(parsed.data.artefactId, userId);
    const ownedConcepts = await Promise.all(
      parsed.data.conceptIds.map((id) => requireOwnedConcept(id, userId)),
    );
    const syllabusId = artefact.subSkill.cluster.syllabus.id;
    if (
      ownedConcepts.some(
        (concept) => concept.subSkill.cluster.syllabus.id !== syllabusId,
      )
    ) {
      return { ok: false, message: "Invalid concept selection." };
    }

    await db
      .update(artefacts)
      .set({
        demonstratedConceptIds: parsed.data.conceptIds,
        updatedAt: new Date(),
      })
      .where(eq(artefacts.id, parsed.data.artefactId));
    await revalidateAfterArtefactChange(parsed.data.artefactId, userId);
    return { ok: true };
  } catch (err) {
    console.error("[setArtefactDemonstratedConcepts] failed", err);
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Update failed.",
    };
  }
}

const VerificationInput = z.object({
  artefactId: z.string().uuid(),
  verified: z.boolean(),
});

export async function toggleArtefactVerificationOnPage(input: {
  artefactId: string;
  verified: boolean;
}): Promise<{ ok: boolean; message?: string }> {
  const parsed = VerificationInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid input." };
  try {
    const userId = await requireCurrentUserId();
    await requireOwnedArtefact(parsed.data.artefactId, userId);

    await db
      .update(artefacts)
      .set({
        verifiedAt: parsed.data.verified ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(artefacts.id, parsed.data.artefactId));
    await revalidateAfterArtefactChange(parsed.data.artefactId, userId);
    return { ok: true };
  } catch (err) {
    console.error("[toggleArtefactVerificationOnPage] failed", err);
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Update failed.",
    };
  }
}

const DeleteInput = z.object({ artefactId: z.string().uuid() });

export async function deleteArtefactFromPage(input: {
  artefactId: string;
}): Promise<{ ok: false; message: string } | never> {
  const parsed = DeleteInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid input." };

  const userId = await requireCurrentUserId();
  const artefact = await requireOwnedArtefact(parsed.data.artefactId, userId);
  const syllabusId = artefact.subSkill.cluster.syllabus.id;
  try {
    await db
      .delete(artefacts)
      .where(eq(artefacts.id, parsed.data.artefactId));
  } catch (err) {
    console.error("[deleteArtefactFromPage] failed", err);
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Delete failed.",
    };
  }
  revalidatePath(`/syllabi/${syllabusId}`);
  revalidatePath(await getProfilePathForUser(userId));
  redirect(`/syllabi/${syllabusId}`);
}
