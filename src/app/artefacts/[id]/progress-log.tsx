"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ArtefactProgressEntry } from "@/db/schema";
import { addArtefactProgressEntry } from "./actions";

export function ProgressLog({
  artefactId,
  entries,
}: {
  artefactId: string;
  entries: ArtefactProgressEntry[];
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function add() {
    const trimmed = note.trim();
    if (trimmed.length === 0) return;
    setError(null);
    startTransition(async () => {
      const result = await addArtefactProgressEntry({
        artefactId,
        note: trimmed,
      });
      if (!result.ok) {
        setError(result.message ?? "Add failed.");
        return;
      }
      setNote("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="border-border/60 bg-card/40 flex flex-col gap-2 rounded-md border px-3 py-3">
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="What did you do? What's blocked?"
          className="resize-none border-0 bg-transparent px-0 py-0 text-sm shadow-none focus-visible:ring-0"
        />
        <div className="flex items-center justify-between gap-2">
          {error ? (
            <p className="text-destructive text-xs">{error}</p>
          ) : (
            <span className="text-muted-foreground text-[10px]">
              Plain text. Timestamped on save.
            </span>
          )}
          <Button
            type="button"
            size="sm"
            onClick={add}
            disabled={isPending || note.trim().length === 0}
            className={cn("h-7 text-xs", isPending && "opacity-70")}
          >
            {isPending ? "Adding..." : "Add entry"}
          </Button>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="text-muted-foreground text-sm italic">
          No entries yet.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {entries.map((entry, i) => {
            const at = new Date(entry.at);
            return (
              <li
                key={i}
                className="border-border/60 bg-card/40 rounded-md border px-3 py-2"
              >
                <div
                  className="text-muted-foreground text-xs"
                  title={format(at, "d MMM yyyy, HH:mm")}
                >
                  {format(at, "d MMM yyyy, HH:mm")}{" "}
                  <span className="text-muted-foreground/70">
                    ·{" "}
                    {formatDistanceToNow(at, { addSuffix: true })}
                  </span>
                </div>
                <p className="text-foreground/90 mt-1 whitespace-pre-wrap text-sm leading-relaxed">
                  {entry.note}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
