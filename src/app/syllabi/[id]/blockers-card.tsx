"use client";

import { useState } from "react";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

type Branch = {
  role: string;
  rationale: string;
  tradeoffs: string;
};

type Props = {
  blockers: string[];
  branches: Branch[];
};

export function BlockersCard({ blockers, branches }: Props) {
  const [open, setOpen] = useState(false);

  if (blockers.length === 0) return null;

  return (
    <section className="border-amber-500/30 bg-amber-500/5 rounded-lg border px-5 py-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
        <div className="flex flex-1 flex-col gap-2">
          <h2 className="text-sm font-medium text-amber-100">
            Structural blockers
          </h2>
          <p className="text-muted-foreground text-xs">
            What self-study alone cannot resolve. Read before committing time.
          </p>
          <ul className="mt-1 flex flex-col gap-1.5">
            {blockers.map((b, i) => (
              <li
                key={i}
                className="text-foreground/90 text-sm leading-relaxed"
              >
                — {b}
              </li>
            ))}
          </ul>

          {branches.length > 0 ? (
            <Collapsible open={open} onOpenChange={setOpen} className="mt-3">
              <CollapsibleTrigger className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs transition-colors">
                <ChevronRight
                  className={cn(
                    "size-3 transition-transform",
                    open && "rotate-90",
                  )}
                />
                {open ? "Hide" : "Show"} {branches.length} alternative target
                {branches.length === 1 ? "" : "s"}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ul className="mt-3 flex flex-col gap-3">
                  {branches.map((branch, i) => (
                    <li
                      key={i}
                      className="border-border/60 bg-background/40 rounded-md border px-3 py-2.5"
                    >
                      <div className="text-sm font-medium">{branch.role}</div>
                      <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                        {branch.rationale}
                      </p>
                      <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">
                        <span className="text-foreground/80 font-medium">
                          Tradeoffs:{" "}
                        </span>
                        {branch.tradeoffs}
                      </p>
                    </li>
                  ))}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          ) : null}
        </div>
      </div>
    </section>
  );
}
