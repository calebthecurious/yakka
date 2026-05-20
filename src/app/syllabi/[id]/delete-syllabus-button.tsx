"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { deleteSyllabus } from "./actions";

export function DeleteSyllabusButton({
  syllabusId,
  targetRole,
}: {
  syllabusId: string;
  targetRole: string;
}) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    const confirmed = confirm(
      `Delete the syllabus for "${targetRole}"? This will remove all clusters, sub-skills, concepts, resources, notes, and artefacts. This cannot be undone.`,
    );
    if (!confirmed) return;

    startTransition(async () => {
      const result = await deleteSyllabus({ syllabusId });
      if (result && !result.ok) {
        console.error(result.message);
        alert(`Delete failed: ${result.message}`);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className={cn(
        "text-muted-foreground hover:text-destructive hover:border-destructive/40 inline-flex items-center gap-2 rounded-md border border-dashed border-transparent px-3 py-1.5 text-xs transition-colors",
        isPending && "opacity-60",
      )}
    >
      <Trash2 className="size-3.5" aria-hidden />
      {isPending ? "Deleting..." : "Delete this syllabus"}
    </button>
  );
}
