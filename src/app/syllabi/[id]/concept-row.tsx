"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { cycleConceptStatus } from "./actions";

type Status = "not_started" | "learning" | "understood" | "verified";

const NEXT_STATUS: Record<Status, Status> = {
  not_started: "learning",
  learning: "understood",
  understood: "not_started",
  verified: "not_started",
};

type Props = {
  conceptId: string;
  syllabusId: string;
  name: string;
  status: Status;
  resourceCount: number;
};

export function ConceptRow({
  conceptId,
  syllabusId,
  name,
  status,
  resourceCount,
}: Props) {
  const [optimisticStatus, setOptimisticStatus] = useOptimistic<Status, Status>(
    status,
    (_prev, next) => next,
  );
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    const next = NEXT_STATUS[optimisticStatus];
    startTransition(async () => {
      setOptimisticStatus(next);
      const result = await cycleConceptStatus({
        conceptId,
        syllabusId,
        currentStatus: optimisticStatus,
      });
      if (!result.ok) {
        console.error(result.message);
      }
    });
  }

  const isChecked = optimisticStatus === "understood" || optimisticStatus === "verified";
  const isLearning = optimisticStatus === "learning";

  return (
    <li
      className={cn(
        "group flex items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors",
        "hover:bg-muted/40",
        isPending && "opacity-60",
      )}
    >
      <Checkbox
        checked={isChecked ? true : isLearning ? "indeterminate" : false}
        onCheckedChange={handleToggle}
        aria-label={`Mark concept as ${NEXT_STATUS[optimisticStatus].replace("_", " ")}`}
        className={cn(
          isLearning &&
            "data-[state=indeterminate]:bg-amber-500/20 data-[state=indeterminate]:border-amber-500/60 data-[state=indeterminate]:text-amber-500",
        )}
      />
      <Link
        href={`/concepts/${conceptId}`}
        className={cn(
          "flex-1 truncate underline-offset-4 hover:underline",
          isChecked && "text-muted-foreground line-through",
        )}
      >
        {name}
      </Link>
      {resourceCount > 0 ? (
        <span className="text-muted-foreground shrink-0 text-xs">
          {resourceCount} {resourceCount === 1 ? "resource" : "resources"}
        </span>
      ) : null}
    </li>
  );
}
