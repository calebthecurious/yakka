"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { artefacts, concepts, syllabi } from "@/db/schema";

const NEXT_STATUS = {
  not_started: "learning",
  learning: "understood",
  understood: "not_started",
  verified: "not_started",
} as const;

const InputSchema = z.object({
  conceptId: z.string().uuid(),
  syllabusId: z.string().uuid(),
  currentStatus: z.enum(["not_started", "learning", "understood", "verified"]),
});

export async function cycleConceptStatus(input: {
  conceptId: string;
  syllabusId: string;
  currentStatus: "not_started" | "learning" | "understood" | "verified";
}): Promise<
  | { ok: true; status: "not_started" | "learning" | "understood" | "verified" }
  | { ok: false; message: string }
> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Invalid input." };
  }

  const next = NEXT_STATUS[parsed.data.currentStatus];

  try {
    await db
      .update(concepts)
      .set({
        status: next,
        understoodAt: next === "understood" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(concepts.id, parsed.data.conceptId));

    revalidatePath(`/syllabi/${parsed.data.syllabusId}`);
    return { ok: true, status: next };
  } catch (err) {
    console.error("[cycleConceptStatus] failed", err);
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Update failed.",
    };
  }
}

const ArtefactType = z.enum([
  "project",
  "writeup",
  "certificate",
  "contribution",
]);

const AddArtefactInput = z.object({
  syllabusId: z.string().uuid(),
  subSkillId: z.string().uuid(),
  type: ArtefactType,
  title: z.string().trim().min(1, "Title is required."),
  url: z
    .string()
    .trim()
    .url("URL must be a valid http(s) link.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  description: z
    .string()
    .trim()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  reflection: z
    .string()
    .trim()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  verified: z.boolean().default(false),
});

export async function addArtefact(input: {
  syllabusId: string;
  subSkillId: string;
  type: "project" | "writeup" | "certificate" | "contribution";
  title: string;
  url?: string;
  description?: string;
  reflection?: string;
  verified?: boolean;
}): Promise<{ ok: boolean; message?: string }> {
  const parsed = AddArtefactInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }
  try {
    await db.insert(artefacts).values({
      subSkillId: parsed.data.subSkillId,
      type: parsed.data.type,
      title: parsed.data.title,
      url: parsed.data.url ?? null,
      description: parsed.data.description ?? "",
      reflection: parsed.data.reflection ?? "",
      verifiedAt: parsed.data.verified ? new Date() : null,
    });
    revalidatePath(`/syllabi/${parsed.data.syllabusId}`);
    revalidatePath(`/u/caleb`);
    return { ok: true };
  } catch (err) {
    console.error("[addArtefact] failed", err);
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Add failed.",
    };
  }
}

const ToggleArtefactVerificationInput = z.object({
  artefactId: z.string().uuid(),
  syllabusId: z.string().uuid(),
  verified: z.boolean(),
});

export async function toggleArtefactVerification(input: {
  artefactId: string;
  syllabusId: string;
  verified: boolean;
}): Promise<{ ok: boolean; message?: string }> {
  const parsed = ToggleArtefactVerificationInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid input." };
  try {
    await db
      .update(artefacts)
      .set({
        verifiedAt: parsed.data.verified ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(artefacts.id, parsed.data.artefactId));
    revalidatePath(`/syllabi/${parsed.data.syllabusId}`);
    revalidatePath(`/u/caleb`);
    return { ok: true };
  } catch (err) {
    console.error("[toggleArtefactVerification] failed", err);
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Update failed.",
    };
  }
}

const DeleteArtefactInput = z.object({
  artefactId: z.string().uuid(),
  syllabusId: z.string().uuid(),
});

export async function deleteArtefact(input: {
  artefactId: string;
  syllabusId: string;
}): Promise<{ ok: boolean; message?: string }> {
  const parsed = DeleteArtefactInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid input." };
  try {
    await db.delete(artefacts).where(eq(artefacts.id, parsed.data.artefactId));
    revalidatePath(`/syllabi/${parsed.data.syllabusId}`);
    revalidatePath(`/u/caleb`);
    return { ok: true };
  } catch (err) {
    console.error("[deleteArtefact] failed", err);
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Delete failed.",
    };
  }
}

const DeleteSyllabusInput = z.object({
  syllabusId: z.string().uuid(),
});

export async function deleteSyllabus(input: {
  syllabusId: string;
}): Promise<{ ok: false; message: string } | never> {
  const parsed = DeleteSyllabusInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid input." };

  try {
    await db.delete(syllabi).where(eq(syllabi.id, parsed.data.syllabusId));
  } catch (err) {
    console.error("[deleteSyllabus] failed", err);
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Delete failed.",
    };
  }

  revalidatePath("/syllabi");
  revalidatePath("/u/caleb");
  redirect("/syllabi");
}
