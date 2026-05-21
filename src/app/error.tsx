"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  const isDatabaseConfigError = error.message.includes("DATABASE_URL");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Yakka</h1>
        <p className="text-muted-foreground text-sm">
          The app is deployed, but this route could not finish loading.
        </p>
      </header>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-lg">
            {isDatabaseConfigError ? "Database setup needed" : "Runtime error"}
          </CardTitle>
          <CardDescription>
            {isDatabaseConfigError
              ? "DATABASE_URL is missing from the running deployment. Add it in Vercel Project Settings, then redeploy."
              : "Check the Vercel runtime logs for the underlying server error."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button type="button" onClick={reset}>
            Try again
          </Button>
          <Button asChild variant="outline">
            <Link href="/syllabi">Go to syllabi</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
