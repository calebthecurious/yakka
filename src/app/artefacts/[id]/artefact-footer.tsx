"use client";

import { useOptimistic, useTransition } from "react";
import { ShieldCheck, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  deleteArtefactFromPage,
  toggleArtefactVerificationOnPage,
} from "./actions";

export function ArtefactFooter({
  artefactId,
  verified,
  title,
}: {
  artefactId: string;
  verified: boolean;
  title: string;
}) {
  const [optimisticVerified, setOptimisticVerified] = useOptimistic<
    boolean,
    boolean
  >(verified, (_prev, next) => next);
  const [isPending, startTransition] = useTransition();

  function handleToggleVerify() {
    const next = !optimisticVerified;
    startTransition(async () => {
      setOptimisticVerified(next);
      const result = await toggleArtefactVerificationOnPage({
        artefactId,
        verified: next,
      });
      if (!result.ok) console.error(result.message);
    });
  }

  function handleDelete() {
    if (
      !confirm(
        `Delete "${title}"? Criteria, progress log, and reflection are gone. This cannot be undone.`,
      )
    )
      return;
    startTransition(async () => {
      const result = await deleteArtefactFromPage({ artefactId });
      if (result && !result.ok) {
        console.error(result.message);
        alert(`Delete failed: ${result.message}`);
      }
    });
  }

  return (
    <footer className="border-border/60 flex items-center justify-between gap-3 border-t pt-6">
      <Button
        type="button"
        variant={optimisticVerified ? "outline" : "default"}
        onClick={handleToggleVerify}
        disabled={isPending}
        className={cn(
          "gap-2",
          optimisticVerified &&
            "border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15",
        )}
      >
        <ShieldCheck className="size-4" aria-hidden />
        {optimisticVerified ? "Verified — click to unverify" : "Mark verified"}
      </Button>

      <button
        type="button"
        onClick={handleDelete}
        disabled={isPending}
        className={cn(
          "text-muted-foreground hover:text-destructive hover:border-destructive/40 inline-flex items-center gap-2 rounded-md border border-dashed border-transparent px-3 py-1.5 text-xs transition-colors",
          isPending && "opacity-60",
        )}
      >
        <Trash2 className="size-3.5" aria-hidden />
        Delete artefact
      </button>
    </footer>
  );
}
