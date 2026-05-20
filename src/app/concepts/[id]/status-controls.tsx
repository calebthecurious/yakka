"use client";

import { useOptimistic, useTransition } from "react";
import { Check, CircleDashed, BookOpen, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { updateConceptStatus } from "./actions";

type Status = "not_started" | "learning" | "understood" | "verified";

const OPTIONS: Array<{
  status: Status;
  label: string;
  icon: typeof Check;
  accent: string;
}> = [
  {
    status: "not_started",
    label: "Not started",
    icon: CircleDashed,
    accent: "text-muted-foreground",
  },
  {
    status: "learning",
    label: "Learning",
    icon: BookOpen,
    accent: "text-amber-300",
  },
  {
    status: "understood",
    label: "Understood",
    icon: Check,
    accent: "text-emerald-300",
  },
  {
    status: "verified",
    label: "Verified",
    icon: ShieldCheck,
    accent: "text-sky-300",
  },
];

export function StatusControls({
  conceptId,
  status,
}: {
  conceptId: string;
  status: Status;
}) {
  const [optimistic, setOptimistic] = useOptimistic<Status, Status>(
    status,
    (_prev, next) => next,
  );
  const [isPending, startTransition] = useTransition();

  function setStatus(next: Status) {
    if (next === optimistic) return;
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
      aria-label="Concept status"
    >
      {OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const active = optimistic === opt.status;
        return (
          <Button
            key={opt.status}
            variant="ghost"
            size="sm"
            role="radio"
            aria-checked={active}
            aria-label={opt.label}
            title={opt.label}
            onClick={() => setStatus(opt.status)}
            className={cn(
              "h-8 gap-1.5 px-2 text-xs sm:px-2.5",
              active && "bg-muted text-foreground",
              active && opt.accent,
            )}
          >
            <Icon className="size-3.5 shrink-0" />
            <span className="hidden sm:inline">{opt.label}</span>
          </Button>
        );
      })}
    </div>
  );
}
