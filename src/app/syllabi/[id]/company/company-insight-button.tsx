"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateCompanyInsight } from "../company-insight-actions";

type Props = {
  syllabusId: string;
  companyName: string;
  /** "generate" for the empty state, "regenerate" for the header. */
  mode: "generate" | "regenerate";
};

export function CompanyInsightButton({ syllabusId, companyName, mode }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      const result = await generateCompanyInsight(syllabusId);
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
          <Search />
        ) : (
          <RefreshCw />
        )}
        {isPending
          ? "Researching…"
          : isGenerate
            ? `Research ${companyName}`
            : "Regenerate"}
      </Button>
      {error ? (
        <p className="text-destructive text-xs">{error}</p>
      ) : isPending ? (
        <p className="text-muted-foreground text-xs">
          Searching public sources — careers pages, engineering content, papers,
          and GitHub. This can take up to a minute.
        </p>
      ) : null}
    </div>
  );
}
