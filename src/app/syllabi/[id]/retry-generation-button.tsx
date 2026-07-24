"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { retrySyllabusGeneration } from "./generation-actions";

/** Re-runs a failed syllabus from the skeleton (reuses the stored inputs). */
export function RetryGenerationButton({ syllabusId }: { syllabusId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      disabled={pending}
      className="gap-1.5"
      onClick={() =>
        start(async () => {
          await retrySyllabusGeneration(syllabusId);
          router.refresh();
        })
      }
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <RotateCw className="size-4" aria-hidden />
      )}
      Retry generation
    </Button>
  );
}
