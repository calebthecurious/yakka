import type { Metadata } from "next";
import Link from "next/link";
import { and, count, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { syllabi } from "@/db/schema";
import { requireCurrentUserId } from "@/lib/auth";
import { canCreateSyllabus, readEntitlementConfig } from "@/lib/entitlements";
import { PremiumWall } from "./premium-wall";
import { SyllabusForm } from "./syllabus-form";

export const metadata: Metadata = {
  title: "New syllabus — Provency",
};

// Syllabus generation runs inline in the `createSyllabus` server action: a
// skeleton Grok call plus one streamed call per sub-skill (up to ~36 total) and
// a multi-table insert. With no ceiling it runs under the platform default and
// gets killed mid-generation ("this route could not finish loading"), leaving
// no syllabus behind. Lift the ceiling so the action can finish.
export const maxDuration = 300;

/** Active = not permanently failed (src/lib/entitlements.ts countsAsActive). */
async function countActiveSyllabi(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(syllabi)
    .where(and(eq(syllabi.userId, userId), ne(syllabi.status, "failed")));
  return row?.n ?? 0;
}

export default async function NewSyllabusPage() {
  // W-5: the free-tier boundary, decided in src/lib/entitlements.ts. The
  // page shows the wall instead of the form; the action re-checks on submit.
  const userId = await requireCurrentUserId();
  const decision = canCreateSyllabus(
    await countActiveSyllabi(userId),
    readEntitlementConfig(process.env),
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-col gap-2">
        <Link
          href="/syllabi"
          className="text-muted-foreground hover:text-foreground text-xs"
        >
          ← All syllabi
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">New syllabus</h1>
        {decision.allowed ? (
          <p className="text-muted-foreground max-w-prose">
            Paste a job description and a sketch of your current skills. Provency
            will generate a clustered syllabus — sub-skills, resources, and one
            portfolio artefact per cluster — tuned for a self-taught learner
            targeting this exact role.
          </p>
        ) : null}
      </header>
      {decision.allowed ? <SyllabusForm /> : <PremiumWall decision={decision} />}
    </main>
  );
}
