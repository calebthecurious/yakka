"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import {
  formatMarkAsLabel,
  formatTierLabel,
  selfMarkFor,
  type ConstellationTier,
  type SelfMarkStatus,
} from "@/lib/readiness/surface-words";
import { cycleConceptStatus } from "./actions";

type Status = "not_started" | "learning" | "understood" | "verified";

/**
 * The learner's own mark cycles through the three states they may set. A
 * legacy `verified` self-mark (pre-H-1 rows) is treated as the strongest mark
 * still available — it never granted anything — and cycles back to not started.
 */
const NEXT_STATUS: Record<Status, SelfMarkStatus> = {
  not_started: "learning",
  learning: "understood",
  understood: "not_started",
  verified: "not_started",
};

type Props = {
  conceptId: string;
  syllabusId: string;
  name: string;
  /** The learner's own mark. Drives the checkbox only. */
  status: Status;
  /** The ledger's tier — the only source of the row's state word. */
  tier: ConstellationTier;
  resourceCount: number;
};

export function ConceptRow({
  conceptId,
  syllabusId,
  name,
  status,
  tier,
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

  const mark = selfMarkFor(optimisticStatus);
  const isChecked = mark === "understood";
  const isLearning = mark === "learning";
  const isVerified = tier === "check_passed" || tier === "artefact_verified";

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
        aria-label={formatMarkAsLabel(NEXT_STATUS[optimisticStatus])}
        className={cn(
          isLearning &&
            "data-[state=indeterminate]:bg-amber-500/20 data-[state=indeterminate]:border-amber-500/60 data-[state=indeterminate]:text-amber-500",
        )}
      />
      <Link
        href={`/concepts/${conceptId}`}
        className={cn(
          "flex-1 truncate underline-offset-4 hover:underline",
          isChecked && !isVerified && "text-muted-foreground",
        )}
      >
        {name}
      </Link>
      {/* The ledger's word for this concept. Verified is the accent; every
          other tier is quiet. Never composed here — formatTierLabel only. */}
      <span
        className={cn(
          "shrink-0 text-xs",
          isVerified ? "text-(--lp-accent)" : "text-muted-foreground/70",
        )}
      >
        {formatTierLabel(tier)}
      </span>
      {resourceCount > 0 ? (
        <span className="text-muted-foreground shrink-0 text-xs">
          {resourceCount} {resourceCount === 1 ? "resource" : "resources"}
        </span>
      ) : null}
    </li>
  );
}
