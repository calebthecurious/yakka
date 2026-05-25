"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Placeholder for adding a syllabus blind spot as a new cluster/sub-skill/concept.
 *
 * TODO: wire this to a real server action once syllabus editing exists — it
 * should take the gap requirement (and ideally the suggested placement) and
 * insert a concept into the syllabus, then revalidate. Intentionally inert for now.
 */
export function AddToSyllabusButton() {
  const [clicked, setClicked] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        size="xs"
        variant="outline"
        onClick={() => setClicked(true)}
        aria-disabled={clicked}
      >
        <Plus className="size-3" />
        Add to syllabus
      </Button>
      {clicked ? (
        <span className="text-muted-foreground text-xs">
          Coming soon — syllabus editing isn&rsquo;t built yet.
        </span>
      ) : null}
    </div>
  );
}
