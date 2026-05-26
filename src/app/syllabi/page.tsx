import Link from "next/link";
import { connection } from "next/server";
import type { Metadata } from "next";
import { format } from "date-fns";
import { desc, eq } from "drizzle-orm";
import { Compass } from "lucide-react";
import { db } from "@/db";
import { syllabi } from "@/db/schema";
import { requireCurrentUserId } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Syllabi — Provency",
};

export const dynamic = "force-dynamic";

function getDatabaseErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("DATABASE_URL")) {
    return "DATABASE_URL is not available to the running deployment. Add it in Vercel Project Settings, then redeploy.";
  }

  if (
    message.includes("does not exist") ||
    message.includes("relation") ||
    message.includes("schema")
  ) {
    return "The database is reachable, but the expected tables are missing. Run the Drizzle migration against the production database.";
  }

  return "Provency could not read from the production database. Check the Vercel runtime logs for the underlying Postgres error.";
}

function DatabaseUnavailable({ message }: { message: string }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Provency</h1>
        <p className="text-muted-foreground text-sm">
          The app deployed, but the database is not ready for runtime requests.
        </p>
      </header>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-lg">Database setup needed</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground flex flex-col gap-3 text-sm">
          <p>
            In Vercel, set the production environment variables and redeploy:
          </p>
          <pre className="bg-muted text-foreground overflow-x-auto rounded-md p-3 text-xs">
{`DATABASE_URL
GROK_API_KEY
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY`}
          </pre>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/syllabi/new">Open generator</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

export default async function SyllabiIndexPage() {
  await connection();
  const userId = await requireCurrentUserId();

  let rows: Awaited<ReturnType<typeof loadSyllabi>>;
  try {
    rows = await loadSyllabi(userId);
  } catch (error) {
    console.error("[SyllabiIndexPage] failed to load syllabi", error);
    return <DatabaseUnavailable message={getDatabaseErrorMessage(error)} />;
  }

  if (rows.length === 0) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center sm:py-24">
        <div className="bg-muted/40 border-border/60 flex size-14 items-center justify-center rounded-2xl border">
          <Compass className="text-muted-foreground size-7" />
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Welcome to Provency
          </h1>
          <p className="text-muted-foreground mx-auto max-w-md text-sm sm:text-base">
            Paste a job description and Provency builds you a personalised learning
            path — skill clusters, concepts, and resources scoped to the exact
            role you&apos;re chasing.
          </p>
        </div>
        <Button asChild size="lg">
          <Link href="/syllabi/new">Generate your first syllabus</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">Syllabi</h1>
          <p className="text-muted-foreground text-sm">
            {`${rows.length} saved ${rows.length === 1 ? "syllabus" : "syllabi"}.`}
          </p>
        </div>
        <Button asChild>
          <Link href="/syllabi/new">New syllabus</Link>
        </Button>
      </header>

      <ul className="flex flex-col gap-3">
          {rows.map((s) => {
            const blockerCount = s.metadata?.structuralBlockers?.length ?? 0;
            return (
              <li key={s.id}>
                <Link href={`/syllabi/${s.id}`} className="block">
                  <Card className="hover:border-foreground/40 transition-colors">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex flex-col gap-1">
                          <CardTitle className="text-lg">
                            {s.targetRole}
                            {s.targetCompany ? (
                              <span className="text-muted-foreground font-normal">
                                {" "}
                                · {s.targetCompany}
                              </span>
                            ) : null}
                          </CardTitle>
                          <CardDescription>
                            {format(s.createdAt, "d MMM yyyy, HH:mm")}
                          </CardDescription>
                        </div>
                        {blockerCount > 0 ? (
                          <span className="text-destructive shrink-0 text-xs">
                            {blockerCount} blocker
                            {blockerCount === 1 ? "" : "s"}
                          </span>
                        ) : null}
                      </div>
                    </CardHeader>
                    <CardContent className="text-muted-foreground text-sm">
                      Open syllabus →
                    </CardContent>
                  </Card>
                </Link>
              </li>
            );
          })}
      </ul>
    </main>
  );
}

function loadSyllabi(userId: string) {
  return db
    .select({
      id: syllabi.id,
      targetRole: syllabi.targetRole,
      targetCompany: syllabi.targetCompany,
      createdAt: syllabi.createdAt,
      metadata: syllabi.metadata,
    })
    .from(syllabi)
    .where(eq(syllabi.userId, userId))
    .orderBy(desc(syllabi.createdAt));
}
