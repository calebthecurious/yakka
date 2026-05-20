"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import type { ArtefactCriterion } from "@/db/schema";
import { updateArtefactCriteria } from "./actions";

export function CriteriaEditor({
  artefactId,
  initialCriteria,
}: {
  artefactId: string;
  initialCriteria: ArtefactCriterion[];
}) {
  const router = useRouter();
  const [criteria, setCriteria] = useState<ArtefactCriterion[]>(initialCriteria);
  const [newText, setNewText] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [isPending, startTransition] = useTransition();

  function persist(next: ArtefactCriterion[]) {
    setCriteria(next);
    startTransition(async () => {
      const result = await updateArtefactCriteria({
        artefactId,
        criteria: next,
      });
      if (result.ok) router.refresh();
      else console.error(result.message);
    });
  }

  function toggle(idx: number) {
    const next = criteria.map((c, i) =>
      i === idx ? { ...c, done: !c.done } : c,
    );
    persist(next);
  }

  function remove(idx: number) {
    const next = criteria.filter((_, i) => i !== idx);
    persist(next);
  }

  function addCriterion() {
    const text = newText.trim();
    if (text.length === 0) return;
    const next = [...criteria, { text, done: false }];
    setNewText("");
    persist(next);
  }

  function startEdit(idx: number) {
    setEditingIndex(idx);
    setEditText(criteria[idx].text);
  }

  function saveEdit() {
    if (editingIndex === null) return;
    const text = editText.trim();
    if (text.length === 0) {
      setEditingIndex(null);
      return;
    }
    const next = criteria.map((c, i) =>
      i === editingIndex ? { ...c, text } : c,
    );
    setEditingIndex(null);
    persist(next);
  }

  return (
    <div className={cn("flex flex-col gap-2", isPending && "opacity-80")}>
      {criteria.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No criteria yet. Add the first one below.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {criteria.map((c, i) => (
            <li
              key={i}
              className={cn(
                "border-border/60 bg-card/40 flex items-start gap-3 rounded-md border px-3 py-2.5",
                c.done && "border-emerald-500/20 bg-emerald-500/5",
              )}
            >
              <button
                type="button"
                onClick={() => toggle(i)}
                aria-label={c.done ? "Mark not done" : "Mark done"}
                aria-pressed={c.done}
                className={cn(
                  "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                  c.done
                    ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-300"
                    : "border-foreground/30 hover:border-foreground/60",
                )}
              >
                {c.done ? <Check className="size-3" aria-hidden /> : null}
              </button>

              {editingIndex === i ? (
                <input
                  autoFocus
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onBlur={saveEdit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      saveEdit();
                    } else if (e.key === "Escape") {
                      setEditingIndex(null);
                    }
                  }}
                  className="border-input bg-background flex-1 rounded-md border px-2 py-1 text-sm"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => startEdit(i)}
                  className={cn(
                    "flex-1 text-left text-sm leading-relaxed",
                    c.done && "text-muted-foreground line-through",
                  )}
                >
                  {c.text}
                </button>
              )}

              <button
                type="button"
                onClick={() => remove(i)}
                aria-label="Remove criterion"
                className="text-muted-foreground hover:text-destructive shrink-0 rounded-md p-1 transition-colors"
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="border-border/60 mt-2 flex items-center gap-2 rounded-md border border-dashed px-3 py-2">
        <Plus className="text-muted-foreground size-3.5" aria-hidden />
        <Input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCriterion();
            }
          }}
          placeholder="Add a new criterion..."
          className="h-7 flex-1 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
        />
        <button
          type="button"
          onClick={addCriterion}
          disabled={newText.trim().length === 0}
          className="text-muted-foreground hover:text-foreground disabled:opacity-40 rounded-md px-2 py-0.5 text-xs"
        >
          Add
        </button>
      </div>
    </div>
  );
}
