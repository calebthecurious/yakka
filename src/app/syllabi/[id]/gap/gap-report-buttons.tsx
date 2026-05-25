"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateGapReport } from "../gap-report-actions";

type Props = {
  syllabusId: string;
  /** "generate" for the empty state, "regenerate" for the header. */
  mode: "generate" | "regenerate";
};

export function GapReportButton({ syllabusId, mode }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      const result = await generateGapReport(syllabusId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  const isGenerate = mode === "generate";

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button
        type="button"
        onClick={run}
        disabled={isPending}
        variant={isGenerate ? "default" : "outline"}
        size={isGenerate ? "default" : "sm"}
      >
        {isPending ? (
          <Loader2 className="animate-spin" />
        ) : isGenerate ? (
          <Sparkles />
        ) : (
          <RefreshCw />
        )}
        {isPending
          ? "Analysing…"
          : isGenerate
            ? "Generate gap analysis"
            : "Regenerate"}
      </Button>
      {error ? (
        <p className="text-destructive text-xs">{error}</p>
      ) : isPending ? (
        <p className="text-muted-foreground text-xs">
          Reading your resume against the role — this can take up to a minute.
        </p>
      ) : null}
    </div>
  );
}
