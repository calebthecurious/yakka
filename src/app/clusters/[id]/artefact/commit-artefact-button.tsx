"use client";

import { useTransition } from "react";
import { Hammer } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { commitSuggestedArtefact } from "@/app/artefacts/[id]/actions";

export function CommitArtefactButton({
  clusterId,
  subSkillId,
}: {
  clusterId: string;
  subSkillId: string;
}) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await commitSuggestedArtefact({ clusterId, subSkillId });
      if (result && !result.ok) {
        console.error(result.message);
        alert(`Commit failed: ${result.message}`);
      }
    });
  }

  return (
    <Button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className={cn("self-start gap-2", isPending && "opacity-70")}
    >
      <Hammer className="size-4" aria-hidden />
      {isPending ? "Committing..." : "Commit to this project"}
    </Button>
  );
}
