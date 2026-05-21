"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { requireCurrentUserId } from "@/lib/auth";
import { displayNameSchema, handleSchema } from "@/lib/profile";

const UpdateProfileSchema = z.object({
  displayName: displayNameSchema,
  handle: handleSchema,
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
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  const { displayName, handle } = parsed.data;

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
      .set({ displayName, handle })
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
