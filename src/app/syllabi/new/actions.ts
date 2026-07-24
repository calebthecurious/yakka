"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { syllabi } from "@/db/schema";
import { runSyllabusGeneration } from "@/lib/generation/run";
import { requireCurrentUserId } from "@/lib/auth";

const FormSchema = z.object({
  targetRole: z.string().trim().min(1, "Target role is required."),
  targetCompany: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  jobDescription: z
    .string()
    .trim()
    .min(50, "Paste the full job description (at least 50 characters)."),
  currentSkills: z
    .string()
    .trim()
    .min(20, "Describe your current skills in a sentence or two."),
});

export type CreateSyllabusState =
  | { status: "idle" }
  | { status: "error"; message: string };

/**
 * Create a syllabus via the resumable generation path: validate input, persist a
 * 'generating' skeleton row immediately, kick the background worker, then redirect
 * to the syllabus page — which polls, fills in progressively, and is itself the
 * durable resume entry point. No Grok call happens on this request, so a dropped
 * tab or a timeout resumes from where it stopped instead of losing all work.
 */
export async function createSyllabus(
  _prevState: CreateSyllabusState,
  formData: FormData,
): Promise<CreateSyllabusState> {
  const userId = await requireCurrentUserId();

  const parsed = FormSchema.safeParse({
    targetRole: formData.get("targetRole"),
    targetCompany: formData.get("targetCompany"),
    jobDescription: formData.get("jobDescription"),
    currentSkills: formData.get("currentSkills"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Invalid form input.",
    };
  }

  const input = parsed.data;

  // Persist the skeleton row in 'generating' state. roleNature + blockers/branches
  // are produced by the worker's skeleton stage; seed neutral defaults now
  // (roleNature falls to its DB default and is overwritten when the skeleton lands).
  let newSyllabusId: string;
  try {
    const [row] = await db
      .insert(syllabi)
      .values({
        userId,
        targetRole: input.targetRole,
        targetCompany: input.targetCompany ?? null,
        jobDescriptionText: input.jobDescription,
        metadata: {
          structuralBlockers: [],
          alternativeTargetBranches: [],
          currentSkills: input.currentSkills,
        },
        status: "generating",
        skeletonStatus: "pending",
      })
      .returning({ id: syllabi.id });
    newSyllabusId = row.id;
  } catch (err) {
    console.error("[createSyllabus] skeleton insert failed", err);
    const message =
      err instanceof Error
        ? err.message
        : "Failed to start syllabus generation.";
    return { status: "error", message };
  }

  // Best-effort immediate kick; the page-load resume trigger is the durable
  // backstop if this instance is torn down before the worker finishes.
  after(() => runSyllabusGeneration(newSyllabusId));
  redirect(`/syllabi/${newSyllabusId}`);
}
