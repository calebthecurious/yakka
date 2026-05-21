import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { requireCurrentUserId } from "@/lib/auth";

export default async function ProfileRedirectPage() {
  const userId = await requireCurrentUserId();
  const [profile] = await db
    .select({ handle: profiles.handle })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);

  redirect(profile?.handle ? `/u/${profile.handle}` : "/profile/setup");
}
