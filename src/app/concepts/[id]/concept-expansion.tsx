"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Loader2,
  Sparkles,
  Wand2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ConceptExpansion } from "@/db/schema";
import { generateConceptExpansion } from "./actions";
import { MermaidDiagram } from "./mermaid-diagram";

type SiblingMeta = { id: string; name: string };

export function ConceptExpansionSection({
  conceptId,
  expansion,
  siblings,
}: {
  conceptId: string;
  expansion: ConceptExpansion | null;
  siblings: SiblingMeta[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      const res = await generateConceptExpansion({ conceptId });
      if (!res.ok) {
        setError(res.message ?? "Generation failed.");
        return;
      }
      router.refresh();
    });
  }

  if (!expansion) {
    return (
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-medium">Deeper understanding</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Generate a structured deep-dive: definition, principles, key terms,
            how this connects to neighbouring concepts, and common
            misunderstandings.
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
                <Sparkles className="size-4" />
                Go deeper on this concept
              </>
            )}
          </button>
        </div>
        {error ? <p className="text-destructive text-xs">{error}</p> : null}
      </section>
    );
  }

  const siblingsById = new Map(siblings.map((s) => [s.id, s.name]));
  const prereqs = expansion.prerequisiteConceptIds
    .map((id) => ({ id, name: siblingsById.get(id) }))
    .filter((s): s is { id: string; name: string } => !!s.name);
  const buildsOn = expansion.buildsOnConceptIds
    .map((id) => ({ id, name: siblingsById.get(id) }))
    .filter((s): s is { id: string; name: string } => !!s.name);
  const showConnections = prereqs.length > 0 || buildsOn.length > 0;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-lg font-medium">Deeper understanding</h2>
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

      <section className="flex flex-col gap-2">
        <h3 className="text-base font-semibold">What it is</h3>
        <p className="text-foreground/90 max-w-prose text-sm leading-relaxed">
          {expansion.definition}
        </p>
      </section>

      {expansion.principles.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h3 className="text-base font-semibold">Key principles</h3>
          <ul className="grid gap-3 sm:grid-cols-2">
            {expansion.principles.map((p, i) => (
              <li
                key={i}
                className="border-border/60 bg-card/40 flex flex-col gap-1.5 rounded-md border p-4"
              >
                <h4 className="text-foreground text-sm font-semibold">
                  {p.name}
                </h4>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {p.explanation}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {expansion.keyTerms.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h3 className="text-base font-semibold">Key terms</h3>
          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {expansion.keyTerms.map((t, i) => (
              <div key={i} className="flex flex-col gap-0.5">
                <dt className="text-foreground text-sm font-medium">
                  {t.term}
                </dt>
                <dd className="text-muted-foreground text-sm leading-relaxed">
                  {t.definition}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {showConnections ? (
        <section className="flex flex-col gap-3">
          <h3 className="text-base font-semibold">How it connects</h3>
          <div className="flex flex-col gap-3">
            {prereqs.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Understand first
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {prereqs.map((s) => (
                    <Link key={s.id} href={`/concepts/${s.id}`}>
                      <Badge
                        variant="outline"
                        className="hover:border-foreground/40 hover:bg-card/80 cursor-pointer gap-1 text-xs font-normal"
                      >
                        <ArrowRight className="size-3 -rotate-180" />
                        {s.name}
                      </Badge>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
            {buildsOn.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Enables
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {buildsOn.map((s) => (
                    <Link key={s.id} href={`/concepts/${s.id}`}>
                      <Badge
                        variant="outline"
                        className="hover:border-foreground/40 hover:bg-card/80 cursor-pointer gap-1 text-xs font-normal"
                      >
                        {s.name}
                        <ArrowRight className="size-3" />
                      </Badge>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {expansion.relationshipMapMermaid &&
      expansion.relationshipMapMermaid.trim().length > 0 ? (
        <MermaidDiagram chart={expansion.relationshipMapMermaid} />
      ) : null}

      {expansion.commonMisunderstandings.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h3 className="text-base font-semibold">Common misunderstandings</h3>
          <ul className="flex flex-col gap-3">
            {expansion.commonMisunderstandings.map((m, i) => (
              <li
                key={i}
                className="border-amber-500/20 bg-amber-500/5 flex flex-col gap-2 rounded-md border p-4"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
                  <div className="flex flex-col gap-1.5">
                    <p className="text-foreground text-sm">
                      <span className="text-amber-300 font-medium">
                        Misconception:
                      </span>{" "}
                      {m.misconception}
                    </p>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      <span className="text-emerald-300 font-medium">
                        Actually:
                      </span>{" "}
                      {m.correction}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
