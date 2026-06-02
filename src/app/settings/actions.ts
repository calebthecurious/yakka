"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { profiles, syllabi } from "@/db/schema";
import { requireCurrentUserId } from "@/lib/auth";
import { displayNameSchema, handleSchema } from "@/lib/profile";
import { optionalHttpUrl } from "@/lib/url";
import { getProfilePathForUser, requireOwnedSyllabus } from "@/lib/ownership";

const UpdateProfileSchema = z.object({
  displayName: displayNameSchema,
  handle: handleSchema,
  headline: z
    .string()
    .trim()
    .max(140, "Headline must be 140 characters or fewer.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  githubUrl: optionalHttpUrl("Enter a valid GitHub URL (https://…)."),
  linkedinUrl: optionalHttpUrl("Enter a valid LinkedIn URL (https://…)."),
  websiteUrl: optionalHttpUrl("Enter a valid website URL (https://…)."),
  showLearningTrail: z.boolean(),
  showSelfAssessed: z.boolean(),
  showCurrentlyDeveloping: z.boolean(),
});

export type SettingsState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; message: string };

export async function updateProfile(
  _prevState: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const userId = await requireCurrentUserId();

  const parsed = UpdateProfileSchema.safeParse({
    displayName: formData.get("displayName"),
    handle: formData.get("handle"),
    headline: formData.get("headline"),
    githubUrl: formData.get("githubUrl"),
    linkedinUrl: formData.get("linkedinUrl"),
    websiteUrl: formData.get("websiteUrl"),
    // Unchecked checkboxes are absent from FormData; presence means "on".
    showLearningTrail: formData.get("showLearningTrail") === "on",
    showSelfAssessed: formData.get("showSelfAssessed") === "on",
    showCurrentlyDeveloping: formData.get("showCurrentlyDeveloping") === "on",
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  const {
    displayName,
    handle,
    headline,
    githubUrl,
    linkedinUrl,
    websiteUrl,
    showLearningTrail,
    showSelfAssessed,
    showCurrentlyDeveloping,
  } = parsed.data;

  const [existing] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.handle, handle))
    .limit(1);

  if (existing && existing.id !== userId) {
    return { status: "error", message: "That handle is already taken." };
  }

  try {
    await db
      .update(profiles)
      .set({
        displayName,
        handle,
        headline: headline ?? null,
        githubUrl: githubUrl ?? null,
        linkedinUrl: linkedinUrl ?? null,
        websiteUrl: websiteUrl ?? null,
        showLearningTrail,
        showSelfAssessed,
        showCurrentlyDeveloping,
      })
      .where(eq(profiles.id, userId));
  } catch {
    // Unique constraint can still fire under a race on the handle column.
    return { status: "error", message: "That handle is already taken." };
  }

  // Refresh the nav (root layout) and the public profile across the app.
  revalidatePath("/", "layout");
  revalidatePath(`/u/${handle}`);
  return { status: "success" };
}

const SetFeaturedInput = z.object({
  // null clears the featured selection (nothing shown publicly).
  syllabusId: z.string().uuid().nullable(),
});

/**
 * Choose which single syllabus is featured on the public profile.
 *
 * Enforces "at most one featured per user" transactionally: clear all of the
 * user's syllabi first, then set the chosen one. The owner check is twofold —
 * requireOwnedSyllabus throws on a foreign id, and the set-true update is itself
 * scoped to userId — so a caller can never feature someone else's syllabus.
 */
export async function setFeaturedSyllabus(input: {
  syllabusId: string | null;
}): Promise<{ ok: boolean; message?: string }> {
  const parsed = SetFeaturedInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid input." };

  try {
    const userId = await requireCurrentUserId();
    if (parsed.data.syllabusId) {
      await requireOwnedSyllabus(parsed.data.syllabusId, userId);
    }

    await db.transaction(async (tx) => {
      await tx
        .update(syllabi)
        .set({ isFeaturedOnProfile: false })
        .where(eq(syllabi.userId, userId));
      if (parsed.data.syllabusId) {
        await tx
          .update(syllabi)
          .set({ isFeaturedOnProfile: true })
          .where(
            and(
              eq(syllabi.id, parsed.data.syllabusId),
              eq(syllabi.userId, userId),
            ),
          );
      }
    });

    revalidatePath("/settings");
    revalidatePath(await getProfilePathForUser(userId));
    return { ok: true };
  } catch (err) {
    console.error("[setFeaturedSyllabus] failed", err);
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Update failed.",
    };
  }
}
