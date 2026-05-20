"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { concepts, learningSessions, resources } from "@/db/schema";

const USER_RESOURCE_PRIORITY = 99;

const ConceptStatus = z.enum([
  "not_started",
  "learning",
  "understood",
  "verified",
]);
const ResourceStatus = z.enum([
  "planned",
  "consuming",
  "completed",
  "abandoned",
]);
const ResourceType = z.enum([
  "course",
  "book",
  "video",
  "article",
  "project",
  "paper",
]);

const UpdateConceptStatusInput = z.object({
  conceptId: z.string().uuid(),
  status: ConceptStatus,
});

export async function updateConceptStatus(input: {
  conceptId: string;
  status: "not_started" | "learning" | "understood" | "verified";
}): Promise<{ ok: boolean; message?: string }> {
  const parsed = UpdateConceptStatusInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Invalid input." };
  }
  try {
    await db
      .update(concepts)
      .set({
        status: parsed.data.status,
        understoodAt:
          parsed.data.status === "understood" ||
          parsed.data.status === "verified"
            ? new Date()
            : null,
        updatedAt: new Date(),
      })
      .where(eq(concepts.id, parsed.data.conceptId));

    revalidatePath(`/concepts/${parsed.data.conceptId}`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Update failed.",
    };
  }
}

const AddResourceInput = z.object({
  conceptId: z.string().uuid(),
  title: z.string().trim().min(1, "Title is required."),
  url: z.string().trim().url("Valid URL is required."),
  type: ResourceType,
  notes: z
    .string()
    .trim()
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export async function addResource(input: {
  conceptId: string;
  title: string;
  url: string;
  type: "course" | "book" | "video" | "article" | "project" | "paper";
  notes?: string;
}): Promise<{ ok: boolean; message?: string }> {
  const parsed = AddResourceInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  try {
    await db.insert(resources).values({
      conceptId: parsed.data.conceptId,
      title: parsed.data.title,
      url: parsed.data.url,
      type: parsed.data.type,
      notes: parsed.data.notes ?? null,
      priority: USER_RESOURCE_PRIORITY,
      addedByUser: true,
      status: "planned",
    });

    revalidatePath(`/concepts/${parsed.data.conceptId}`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Add failed.",
    };
  }
}

const MarkConsumingInput = z.object({
  resourceId: z.string().uuid(),
  conceptId: z.string().uuid(),
});

export async function markResourceConsuming(input: {
  resourceId: string;
  conceptId: string;
}): Promise<{ ok: boolean; message?: string }> {
  const parsed = MarkConsumingInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid input." };
  try {
    await db
      .update(resources)
      .set({ status: "consuming" })
      .where(
        and(
          eq(resources.id, parsed.data.resourceId),
          eq(resources.status, "planned"),
        ),
      );
    revalidatePath(`/concepts/${parsed.data.conceptId}`);
    return { ok: true };
  } catch (err) {
    console.error("[markResourceConsuming] failed", err);
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Update failed.",
    };
  }
}

const UpdateResourceStatusInput = z.object({
  resourceId: z.string().uuid(),
  conceptId: z.string().uuid(),
  status: ResourceStatus,
});

export async function updateResourceStatus(input: {
  resourceId: string;
  conceptId: string;
  status: "planned" | "consuming" | "completed" | "abandoned";
}): Promise<{ ok: boolean; message?: string }> {
  const parsed = UpdateResourceStatusInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Invalid input." };
  }
  try {
    await db
      .update(resources)
      .set({
        status: parsed.data.status,
        completedAt: parsed.data.status === "completed" ? new Date() : null,
      })
      .where(eq(resources.id, parsed.data.resourceId));

    revalidatePath(`/concepts/${parsed.data.conceptId}`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Update failed.",
    };
  }
}

const SaveLearningSessionInput = z.object({
  conceptId: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
  notesMarkdown: z.string(),
  durationMinutes: z.number().int().min(0).max(720),
});

const SESSION_COALESCE_WINDOW_MINUTES = 30;

export async function saveLearningSession(input: {
  conceptId: string;
  sessionId?: string;
  notesMarkdown: string;
  durationMinutes: number;
}): Promise<{ ok: boolean; sessionId?: string; message?: string }> {
  const parsed = SaveLearningSessionInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  try {
    if (parsed.data.sessionId) {
      await db
        .update(learningSessions)
        .set({
          notesMarkdown: parsed.data.notesMarkdown,
          durationMinutes: parsed.data.durationMinutes,
        })
        .where(eq(learningSessions.id, parsed.data.sessionId));
      revalidatePath(`/concepts/${parsed.data.conceptId}`);
      return { ok: true, sessionId: parsed.data.sessionId };
    }

    const cutoff = new Date(
      Date.now() - SESSION_COALESCE_WINDOW_MINUTES * 60 * 1000,
    );
    const recent = await db
      .select({ id: learningSessions.id })
      .from(learningSessions)
      .where(
        and(
          eq(learningSessions.conceptId, parsed.data.conceptId),
          gte(learningSessions.createdAt, cutoff),
        ),
      )
      .orderBy(desc(learningSessions.createdAt))
      .limit(1);

    if (recent[0]) {
      await db
        .update(learningSessions)
        .set({
          notesMarkdown: parsed.data.notesMarkdown,
          durationMinutes: parsed.data.durationMinutes,
        })
        .where(eq(learningSessions.id, recent[0].id));
      revalidatePath(`/concepts/${parsed.data.conceptId}`);
      return { ok: true, sessionId: recent[0].id };
    }

    const [inserted] = await db
      .insert(learningSessions)
      .values({
        conceptId: parsed.data.conceptId,
        notesMarkdown: parsed.data.notesMarkdown,
        durationMinutes: parsed.data.durationMinutes,
      })
      .returning({ id: learningSessions.id });

    revalidatePath(`/concepts/${parsed.data.conceptId}`);
    return { ok: true, sessionId: inserted.id };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Save failed.",
    };
  }
}
