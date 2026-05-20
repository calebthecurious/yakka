import Link from "next/link";
import { connection } from "next/server";
import type { Metadata } from "next";
import { format } from "date-fns";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { syllabi } from "@/db/schema";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Syllabi — Yakka",
};

export const dynamic = "force-dynamic";

export default async function SyllabiIndexPage() {
  await connection();

  const rows = await db
    .select({
      id: syllabi.id,
      targetRole: syllabi.targetRole,
      targetCompany: syllabi.targetCompany,
      createdAt: syllabi.createdAt,
      metadata: syllabi.metadata,
    })
    .from(syllabi)
    .orderBy(desc(syllabi.createdAt));

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">Syllabi</h1>
          <p className="text-muted-foreground text-sm">
            {rows.length === 0
              ? "No syllabi yet. Generate your first one."
              : `${rows.length} saved ${rows.length === 1 ? "syllabus" : "syllabi"}.`}
          </p>
        </div>
        <Button asChild>
          <Link href="/syllabi/new">New syllabus</Link>
        </Button>
      </header>

      {rows.length === 0 ? null : (
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
      )}
    </main>
  );
}
