"use client";

import { useOptimistic, useTransition } from "react";
import { Check, CircleDashed, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  SELF_MARK_STATUSES,
  formatSelfMarkLabel,
  selfMarkFor,
  type SelfMarkStatus,
} from "@/lib/readiness/surface-words";
import { updateConceptStatus } from "./actions";

type Status = "not_started" | "learning" | "understood" | "verified";

/**
 * The learner's own mark on a concept. Three options, in the taxonomy's words
 * for rungs 0–1; the verified rung is not offered (H-1 item 2) because raw
 * status grants nothing — a concept reaches it only through the ledger. A
 * legacy `verified` mark shows as the strongest mark still available.
 */
const ICON: Record<SelfMarkStatus, typeof Check> = {
  not_started: CircleDashed,
  learning: BookOpen,
  understood: Check,
};

const ACCENT: Record<SelfMarkStatus, string> = {
  not_started: "text-muted-foreground",
  learning: "text-amber-300",
  understood: "text-foreground",
};

export function StatusControls({
  conceptId,
  status,
}: {
  conceptId: string;
  status: Status;
}) {
  const [optimistic, setOptimistic] = useOptimistic<Status, SelfMarkStatus>(
    status,
    (_prev, next) => next,
  );
  const [isPending, startTransition] = useTransition();

  const current = selfMarkFor(optimistic);

  function setStatus(next: SelfMarkStatus) {
    if (next === current) return;
    startTransition(async () => {
      setOptimistic(next);
      const result = await updateConceptStatus({ conceptId, status: next });
      if (!result.ok) console.error(result.message);
    });
  }

  return (
    <div
      className={cn(
        "border-border/60 bg-card/40 inline-flex items-center gap-1 rounded-lg border p-1",
        isPending && "opacity-70",
      )}
      role="radiogroup"
      aria-label="Your own mark on this concept"
    >
      {SELF_MARK_STATUSES.map((opt) => {
        const Icon = ICON[opt];
        const label = formatSelfMarkLabel(opt);
        const active = current === opt;
        return (
          <Button
            key={opt}
            variant="ghost"
            size="sm"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setStatus(opt)}
            className={cn(
              "h-8 gap-1.5 px-2 text-xs sm:px-2.5",
              active && "bg-muted text-foreground",
              active && ACCENT[opt],
            )}
          >
            <Icon className="size-3.5 shrink-0" />
            <span className="hidden sm:inline">{label}</span>
          </Button>
        );
      })}
    </div>
  );
}
