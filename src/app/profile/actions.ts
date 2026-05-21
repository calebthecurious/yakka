"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { requireCurrentUserId } from "@/lib/auth";
import { handleSchema } from "@/lib/profile";

export type ProfileSetupState =
  | { status: "idle" }
  | { status: "error"; message: string };

export async function setProfileHandle(
  _prevState: ProfileSetupState,
  formData: FormData,
): Promise<ProfileSetupState> {
  const userId = await requireCurrentUserId();
  const parsed = handleSchema.safeParse(formData.get("handle"));

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Invalid handle.",
    };
  }

  const handle = parsed.data;

  const [existing] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.handle, handle))
    .limit(1);

  if (existing && existing.id !== userId) {
    return { status: "error", message: "That handle is already taken." };
  }

  await db
    .insert(profiles)
    .values({
      id: userId,
      handle,
      displayName: handle,
    })
    .onConflictDoUpdate({
      target: profiles.id,
      set: { handle },
    });

  redirect("/syllabi");
}
