"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { setArtefactDemonstratedConcepts } from "./actions";

type ConceptOption = {
  id: string;
  name: string;
  subSkillName: string;
  status: string;
};

export function DemonstratedConcepts({
  artefactId,
  conceptsInCluster,
  selectedIds,
}: {
  artefactId: string;
  conceptsInCluster: ConceptOption[];
  selectedIds: string[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(
    new Set(selectedIds),
  );
  const [isPending, startTransition] = useTransition();

  const grouped = useMemo(() => {
    const map = new Map<string, ConceptOption[]>();
    for (const c of conceptsInCluster) {
      const arr = map.get(c.subSkillName) ?? [];
      arr.push(c);
      map.set(c.subSkillName, arr);
    }
    return Array.from(map.entries());
  }, [conceptsInCluster]);

  function persist(next: Set<string>) {
    setSelected(next);
    startTransition(async () => {
      const result = await setArtefactDemonstratedConcepts({
        artefactId,
        conceptIds: Array.from(next),
      });
      if (result.ok) router.refresh();
      else console.error(result.message);
    });
  }

  function toggle(conceptId: string) {
    const next = new Set(selected);
    if (next.has(conceptId)) next.delete(conceptId);
    else next.add(conceptId);
    persist(next);
  }

  if (conceptsInCluster.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No concepts in this cluster yet.
      </p>
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", isPending && "opacity-80")}>
      {grouped.map(([subSkillName, concepts]) => (
        <div key={subSkillName} className="flex flex-col gap-1.5">
          <h3 className="text-muted-foreground text-[11px] uppercase tracking-wide">
            {subSkillName}
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {concepts.map((c) => {
              const active = selected.has(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggle(c.id)}
                  aria-pressed={active}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    active
                      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
                      : "border-border bg-card/40 text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                  )}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <p className="text-muted-foreground text-xs">
        {selected.size} concept{selected.size === 1 ? "" : "s"} selected.
      </p>
    </div>
  );
}
