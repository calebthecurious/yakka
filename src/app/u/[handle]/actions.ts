"use server";

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { profileViewEvents, profiles, syllabi } from "@/db/schema";
import { getCurrentUserId } from "@/lib/auth";
import { ProfileViewInput, toProfileViewRow } from "@/lib/analytics/profile-view";

/**
 * Record one profile analytics event (P5.4a). Called by the client beacon on
 * /u/[handle]; fire-and-forget — it never throws to the page, because a
 * failed measurement must never break a recruiter's view of the record.
 *
 * What is stored is decided in src/lib/analytics/profile-view.ts (pure,
 * tested): referrer host only, utm tokens only, a random visitor key, and
 * whether the viewer is the owner. Nothing else about the viewer is read.
 */
export async function recordProfileView(raw: unknown): Promise<void> {
  const parsed = ProfileViewInput.safeParse(raw);
  if (!parsed.success) return;
  const input = parsed.data;

  try {
    const [profile] = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.handle, input.handle))
      .limit(1);
    if (!profile) return;

    // The same syllabus the page rendered: featured, else most recent.
    const [featured] = await db
      .select({ id: syllabi.id })
      .from(syllabi)
      .where(and(eq(syllabi.userId, profile.id), eq(syllabi.isFeaturedOnProfile, true)))
      .limit(1);
    let syllabusId: string | null = featured?.id ?? null;
    if (!syllabusId) {
      const [recent] = await db
        .select({ id: syllabi.id })
        .from(syllabi)
        .where(eq(syllabi.userId, profile.id))
        .orderBy(desc(syllabi.createdAt))
        .limit(1);
      syllabusId = recent?.id ?? null;
    }

    const viewerId = await getCurrentUserId().catch(() => null);
    const row = toProfileViewRow(input, {
      profileId: profile.id,
      syllabusId,
      isOwner: viewerId != null && viewerId === profile.id,
    });
    await db.insert(profileViewEvents).values(row);
  } catch (err) {
    // Measurement must never surface to the viewer. Log and move on.
    console.error("[profile-view] record failed", err instanceof Error ? err.message : err);
  }
}
