"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  Lightbulb,
  ListChecks,
  MapPin,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  StudyBriefCheckQuestion,
  StudyBriefLocation,
} from "@/db/schema";

export type StudyBriefData = {
  keyPoints: string[];
  application: string;
  locations: StudyBriefLocation[];
  checkQuestions: StudyBriefCheckQuestion[];
  aiConfidence: "high" | "low";
};

function SectionHeading({
  icon: Icon,
  children,
}: {
  icon: typeof Lightbulb;
  children: React.ReactNode;
}) {
  return (
    <h4 className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide">
      <Icon className="size-3.5" aria-hidden />
      {children}
    </h4>
  );
}

function CheckQuestion({ item }: { item: StudyBriefCheckQuestion }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <li className="border-border/50 bg-background/30 rounded-md border px-3 py-2.5">
      <p className="text-foreground/90 text-sm leading-relaxed">
        {item.question}
      </p>
      <button
        type="button"
        onClick={() => setRevealed((v) => !v)}
        aria-expanded={revealed}
        className="text-muted-foreground hover:text-foreground mt-1.5 inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline"
      >
        <ChevronDown
          className={cn(
            "size-3 transition-transform",
            revealed && "rotate-180",
          )}
          aria-hidden
        />
        {revealed ? "Hide answer" : "Show answer"}
      </button>
      {revealed ? (
        <p className="text-foreground/75 mt-2 border-l-2 border-border/60 pl-3 text-sm leading-relaxed">
          {item.answer}
        </p>
      ) : null}
    </li>
  );
}

export function StudyBrief({ brief }: { brief: StudyBriefData }) {
  const hasLocations = brief.locations.length > 0;

  return (
    <div className="border-border/60 bg-card/30 flex flex-col gap-5 rounded-lg border px-4 py-4">
      {brief.aiConfidence === "low" ? (
        <div className="border-amber-500/30 bg-amber-500/10 text-amber-200/90 flex items-start gap-2 rounded-md border px-3 py-2 text-xs leading-relaxed">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            Yakka isn&apos;t familiar with this specific resource — this brief is
            based on the concept. Verify against the source.
          </span>
        </div>
      ) : null}

      <section className="flex flex-col gap-2">
        <SectionHeading icon={Sparkles}>Key points</SectionHeading>
        <ul className="text-foreground/90 flex flex-col gap-1.5 text-sm leading-relaxed">
          {brief.keyPoints.map((point, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-muted-foreground select-none">•</span>
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeading icon={Lightbulb}>How to apply</SectionHeading>
        <p className="text-foreground/90 text-sm leading-relaxed">
          {brief.application}
        </p>
      </section>

      {hasLocations ? (
        <section className="flex flex-col gap-2">
          <SectionHeading icon={MapPin}>Where in the resource</SectionHeading>
          <ul className="flex flex-col gap-1.5 text-sm">
            {brief.locations.map((loc, i) => (
              <li key={i} className="flex flex-wrap gap-x-2 leading-relaxed">
                <span className="text-foreground font-medium">{loc.label}</span>
                <span className="text-muted-foreground">— {loc.detail}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <SectionHeading icon={ListChecks}>Check yourself</SectionHeading>
        <ul className="flex flex-col gap-2">
          {brief.checkQuestions.map((q, i) => (
            <CheckQuestion key={i} item={q} />
          ))}
        </ul>
      </section>
    </div>
  );
}
