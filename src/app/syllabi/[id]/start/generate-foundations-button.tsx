"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Rocket, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateFoundations } from "../foundations-actions";

type Props = {
  syllabusId: string;
  hasFoundations: boolean;
};

export function GenerateFoundationsButton({ syllabusId, hasFoundations }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await generateFoundations(syllabusId);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        onClick={handleClick}
        disabled={isPending}
        variant={hasFoundations ? "outline" : "default"}
        size={hasFoundations ? "sm" : "default"}
      >
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {hasFoundations ? "Regenerating…" : "Building your on-ramp…"}
          </>
        ) : (
          <>
            {hasFoundations ? (
              <RefreshCw className="size-4" />
            ) : (
              <Rocket className="size-4" />
            )}
            {hasFoundations ? "Regenerate" : "Generate launching point"}
          </>
        )}
      </Button>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </div>
  );
}
