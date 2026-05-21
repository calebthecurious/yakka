import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { requireCurrentUserId } from "@/lib/auth";
import { HandleForm } from "./handle-form";

export const metadata: Metadata = {
  title: "Choose a handle — Yakka",
};

export default async function ProfileSetupPage() {
  const userId = await requireCurrentUserId();
  const [profile] = await db
    .select({ handle: profiles.handle })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);

  if (profile?.handle) redirect("/syllabi");

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Pick your handle
        </h1>
        <p className="text-muted-foreground text-sm">
          This becomes your public profile URL.
        </p>
      </header>
      <HandleForm />
    </main>
  );
}
