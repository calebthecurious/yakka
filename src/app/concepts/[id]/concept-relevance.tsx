"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Compass, Loader2, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConceptImportance, ConceptRelevance } from "@/db/schema";
import { generateConceptRelevance } from "./actions";

const IMPORTANCE_META: Record<
  ConceptImportance,
  { label: string; className: string }
> = {
  core: {
    label: "Core",
    className:
      "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  },
  supporting: {
    label: "Supporting",
    className: "border-sky-500/30 bg-sky-500/10 text-sky-200",
  },
  peripheral: {
    label: "Peripheral",
    className: "border-border bg-muted/40 text-muted-foreground",
  },
};

export function ConceptRelevanceSection({
  conceptId,
  targetRole,
  relevance,
}: {
  conceptId: string;
  targetRole: string;
  relevance: ConceptRelevance | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      const res = await generateConceptRelevance({ conceptId });
      if (!res.ok) {
        setError(res.message ?? "Generation failed.");
        return;
      }
      router.refresh();
    });
  }

  if (!relevance) {
    return (
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-medium">Why this matters</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            A grounded one-pager: the specific reason this concept belongs in
            your path to {targetRole}, with honest importance weighting.
          </p>
        </div>
        <div>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isPending}
            className="border-border/60 bg-card hover:border-foreground/40 hover:bg-card/80 inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Compass className="size-4" />
                Why does this matter?
              </>
            )}
          </button>
        </div>
        {error ? <p className="text-destructive text-xs">{error}</p> : null}
      </section>
    );
  }

  const importance = IMPORTANCE_META[relevance.importance as ConceptImportance];

  return (
    <section className="flex max-w-prose flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-lg font-medium">Why this matters for {targetRole}</h2>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isPending}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? (
            <>
              <Loader2 className="size-3 animate-spin" /> Regenerating…
            </>
          ) : (
            <>
              <Wand2 className="size-3" /> Regenerate
            </>
          )}
        </button>
      </div>

      {error ? <p className="text-destructive text-xs">{error}</p> : null}

      <div className="border-border/60 bg-card/30 flex flex-col gap-4 rounded-md border p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-foreground text-base font-medium leading-snug">
            {relevance.point}
          </p>
          <span
            className={cn(
              "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
              importance.className,
            )}
            title={`Honest importance weighting for ${targetRole}`}
          >
            {importance.label}
          </span>
        </div>

        <dl className="flex flex-col gap-3 text-sm">
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
              Explanation
            </dt>
            <dd className="text-foreground/90 leading-relaxed">
              {relevance.explanation}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
              Evidence
            </dt>
            <dd className="text-foreground/90 leading-relaxed">
              {relevance.evidence}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
              Effect
            </dt>
            <dd className="text-foreground/90 leading-relaxed">
              {relevance.effect}
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
