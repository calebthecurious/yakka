"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  GraduationCap,
  Loader2,
  RotateCw,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  COMPETENCY_CHECK_OUT_OF,
  PASS_BAR,
  formatEvidenceDate,
  formatEvidenceLabelDated,
} from "@/lib/readiness/model";
import {
  CHECK_FAIL_NEXT,
  CHECK_FAIL_NOTHING_WRITTEN,
  CHECK_PASS_WRITTEN,
} from "@/lib/readiness/surface-words";
import { Badge } from "@/components/ui/badge";
import type { CompetencyQuestion } from "@/db/schema";
import { completeCompetencyCheck, startCompetencyCheck } from "./actions";

const OPTION_LABELS = ["A", "B", "C", "D"];

type Phase = "idle" | "generating" | "quiz" | "saving" | "results";

/**
 * The check flow (H-1 item 3). A pass at PASS_BAR is rung-2 evidence the moment
 * the row is written; the results panel shows the taxonomy's dated label for
 * exactly that row and offers nothing weaker on top of it. A fail writes only
 * the check row and says so. No self-mark is written from here.
 */
export function CompetencyCheck({
  conceptId,
  lastScore,
  lastCompletedAt,
}: {
  conceptId: string;
  lastScore: number | null;
  lastCompletedAt: Date | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [phase, setPhase] = useState<Phase>("idle");
  const [questions, setQuestions] = useState<CompetencyQuestion[]>([]);
  const [checkId, setCheckId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [writtenAt, setWrittenAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const total = questions.length;
  const current = questions[currentIndex];
  const answered = selectedIndex !== null;
  const isLast = currentIndex === total - 1;

  function handleStart() {
    setError(null);
    setWrittenAt(null);
    setPhase("generating");
    void (async () => {
      try {
        const result = await startCompetencyCheck({ conceptId });
        if (result.ok && result.checkId && result.questions) {
          setQuestions(result.questions);
          setCheckId(result.checkId);
          setCurrentIndex(0);
          setSelectedIndex(null);
          setScore(0);
          setPhase("quiz");
        } else {
          setError(result.message ?? "Could not generate a check.");
          setPhase("idle");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not generate a check.");
        setPhase("idle");
      }
    })();
  }

  function handleSelect(i: number) {
    if (answered) return;
    setSelectedIndex(i);
    if (i === current.correctIndex) setScore((s) => s + 1);
  }

  function handleNext() {
    if (!isLast) {
      setCurrentIndex((i) => i + 1);
      setSelectedIndex(null);
      return;
    }
    // Finished — persist the result, then show it with the instant it was
    // written. The date shown is the row's own, not the browser clock.
    setPhase("saving");
    if (!checkId) {
      setPhase("results");
      return;
    }
    startTransition(async () => {
      const res = await completeCompetencyCheck({ checkId, conceptId, score });
      if (!res.ok) setError(res.message ?? "Could not save the result.");
      setWrittenAt(res.completedAt ?? null);
      setPhase("results");
      // The badge, CTA and counts on this page read the ledger; refresh them.
      router.refresh();
    });
  }

  // ---- IDLE ----
  if (phase === "idle") {
    return (
      <div className="flex flex-col gap-3">
        {lastScore !== null ? (
          <div className="border-border/60 bg-card/40 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm">
                Last score:{" "}
                <span
                  className={cn(
                    "font-semibold tabular-nums",
                    lastScore >= PASS_BAR ? "text-(--lp-accent)" : "text-amber-200",
                  )}
                >
                  {lastScore}/{COMPETENCY_CHECK_OUT_OF}
                </span>
              </span>
              {lastCompletedAt ? (
                <span className="text-muted-foreground text-xs">
                  {formatEvidenceDate(lastCompletedAt.toISOString())}
                </span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={handleStart}
              className="border-border hover:border-foreground/40 hover:bg-card inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
            >
              <RotateCw className="size-3.5" aria-hidden />
              Retake
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleStart}
            className="border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/50 inline-flex w-fit items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors"
          >
            <GraduationCap className="size-4" aria-hidden />
            Start competency check
          </button>
        )}
        {error ? <p className="text-destructive text-xs">{error}</p> : null}
      </div>
    );
  }

  // ---- GENERATING / SAVING ----
  if (phase === "generating" || phase === "saving") {
    return (
      <div className="border-border/60 bg-card/40 text-muted-foreground flex items-center gap-2 rounded-lg border px-4 py-4 text-sm">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {phase === "generating"
          ? `Writing ${COMPETENCY_CHECK_OUT_OF} questions on this concept…`
          : "Writing your result…"}
      </div>
    );
  }

  // ---- RESULTS ----
  if (phase === "results") {
    const passed = score >= PASS_BAR;
    return (
      <div className="border-border/60 bg-card/40 flex flex-col gap-4 rounded-lg border px-4 py-4">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "text-2xl font-semibold tabular-nums",
              passed ? "text-(--lp-accent)" : "text-amber-200",
            )}
          >
            {score}/{COMPETENCY_CHECK_OUT_OF}
          </span>
          {passed ? (
            <div className="flex flex-col gap-0.5">
              {/* The taxonomy's string for the row just written, dated. */}
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <BadgeCheck className="size-4 text-(--lp-accent)" aria-hidden />
                {formatEvidenceLabelDated({
                  kind: "competency_check",
                  score,
                  outOf: COMPETENCY_CHECK_OUT_OF,
                  occurredAt: writtenAt,
                })}
              </p>
              <p className="text-muted-foreground text-xs">
                {error ?? CHECK_PASS_WRITTEN}
              </p>
            </div>
          ) : (
            <p className="text-sm leading-relaxed">{CHECK_FAIL_NOTHING_WRITTEN}</p>
          )}
        </div>

        {passed ? null : (
          <div className="flex flex-col gap-2">
            <p className="text-muted-foreground text-sm leading-relaxed">{CHECK_FAIL_NEXT}</p>
            <button
              type="button"
              onClick={handleStart}
              className="border-border hover:border-foreground/40 hover:bg-card inline-flex w-fit items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
            >
              <RotateCw className="size-3.5" aria-hidden />
              Generate a new check
            </button>
          </div>
        )}
      </div>
    );
  }

  // ---- QUIZ ----
  return (
    <div className="border-border/60 bg-card/40 flex flex-col gap-4 rounded-lg border px-4 py-4">
      <div className="flex items-center justify-between">
        <Badge variant="outline" className="text-xs">
          Question {currentIndex + 1} of {total}
        </Badge>
        <span className="text-muted-foreground text-xs tabular-nums">
          Score {score}
        </span>
      </div>

      <p className="text-sm font-medium leading-relaxed">{current.question}</p>

      <div className="flex flex-col gap-2">
        {current.options.map((option, i) => {
          const isCorrect = i === current.correctIndex;
          const isChosen = i === selectedIndex;
          return (
            <button
              key={i}
              type="button"
              onClick={() => handleSelect(i)}
              disabled={answered}
              className={cn(
                "flex items-start gap-2.5 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                !answered &&
                  "border-border bg-background/40 hover:border-foreground/40 hover:bg-card",
                answered &&
                  isCorrect &&
                  "border-emerald-500/40 bg-emerald-500/10 text-emerald-100",
                answered &&
                  isChosen &&
                  !isCorrect &&
                  "border-red-500/40 bg-red-500/10 text-red-100",
                answered &&
                  !isCorrect &&
                  !isChosen &&
                  "border-border/50 text-muted-foreground",
              )}
            >
              <span className="text-muted-foreground mt-0.5 select-none text-xs font-semibold">
                {OPTION_LABELS[i]}
              </span>
              <span className="flex-1">{option}</span>
              {answered && isCorrect ? (
                <Check className="mt-0.5 size-4 shrink-0 text-emerald-300" aria-hidden />
              ) : null}
              {answered && isChosen && !isCorrect ? (
                <X className="mt-0.5 size-4 shrink-0 text-red-300" aria-hidden />
              ) : null}
            </button>
          );
        })}
      </div>

      {answered ? (
        <div className="flex flex-col gap-3">
          <div
            className={cn(
              "rounded-md border px-3 py-2 text-sm leading-relaxed",
              selectedIndex === current.correctIndex
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100/90"
                : "border-red-500/30 bg-red-500/10 text-red-100/90",
            )}
          >
            <span className="font-medium">
              {selectedIndex === current.correctIndex
                ? "Correct. "
                : "Not quite. "}
            </span>
            {current.explanation}
          </div>
          <button
            type="button"
            onClick={handleNext}
            className="border-primary/30 bg-primary/5 hover:bg-primary/10 inline-flex w-fit items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
          >
            {isLast ? "See results" : "Next question"}
            <ArrowRight className="size-3.5" aria-hidden />
          </button>
        </div>
      ) : null}
    </div>
  );
}
