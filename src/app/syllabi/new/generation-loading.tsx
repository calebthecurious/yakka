"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Full-screen loading experience shown while the `createSyllabus` Server Action
 * is in flight (it runs one skeleton Grok call + one streamed call per
 * sub-skill, ~1-3 min total).
 *
 * HONESTY NOTE: we cannot read true progress from a single synchronous Server
 * Action, so the stage lines are timer-driven and the bar is INDETERMINATE
 * (H-1 item 5): it shows that work is happening and encodes no fraction. Each
 * STAGE line is a real, ordered description of what the generator actually
 * does (see generate-syllabus.ts): skeleton (read role → identify
 * clusters/skills → classify roleNature into technical/professional →
 * blockers/branches), then per-sub-skill detail (concepts → tier sequencing →
 * resources), then assembly. We never loop back to an earlier line — that
 * would read as frozen — we hold the final line until the result arrives. The
 * real completion is the navigation to the syllabus page. We deliberately do
 * NOT invent granular real-time telemetry.
 */

const STAGES = [
  "Reading the role and its requirements…",
  "Identifying the skills this role actually assesses…",
  "Separating technical and professional competencies…",
  "Breaking skills into learnable concepts…",
  "Sequencing concepts from fundamentals to advanced…",
  "Curating real resources for each concept…",
  "Checking for gaps and structural blockers…",
  "Finishing your roadmap…",
];

const STAGE_INTERVAL_S = 22; // ~8 stages spread across the ~3-min expectation

export function GenerationLoading() {
  const [elapsed, setElapsed] = useState(0);
  // Set on mount inside the effect — calling Date.now() during render is impure
  // (react-hooks/purity). Start time = mount time, same as before.
  const startRef = useRef<number>(0);

  useEffect(() => {
    startRef.current = Date.now();
    const id = setInterval(() => {
      setElapsed((Date.now() - startRef.current) / 1000);
    }, 100);
    return () => clearInterval(id);
  }, []);

  const stageIndex = Math.min(
    STAGES.length - 1,
    Math.floor(elapsed / STAGE_INTERVAL_S),
  );

  return (
    <div
      className="bg-background/95 fixed inset-0 z-50 flex items-center justify-center px-4 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-label="Generating your syllabus"
    >
      <div className="flex w-full max-w-md flex-col items-center gap-8 text-center">
        <ClusterSkeleton />

        <div className="flex min-h-[3.5rem] flex-col gap-2">
          {/* key on stageIndex so each new line fades in smoothly */}
          <p
            key={stageIndex}
            className="text-foreground animate-in fade-in slide-in-from-bottom-1 text-base font-medium duration-700 motion-reduce:animate-none"
          >
            {STAGES[stageIndex]}
          </p>
          <p className="text-muted-foreground text-sm">
            This usually takes 1–3 minutes — we&apos;re building something
            detailed.
          </p>
        </div>

        <div className="w-full">
          {/* Indeterminate: a sweeping segment, no width that could be read as
              a fraction. Reduced motion shows a static band. */}
          <div
            className="bg-muted relative h-1.5 w-full overflow-hidden rounded-full"
            role="progressbar"
            aria-label="Generating"
            aria-valuetext="In progress, no fraction available"
          >
            <div className="bg-foreground/70 absolute inset-y-0 w-1/3 animate-[indeterminate_1.6s_ease-in-out_infinite] rounded-full motion-reduce:animate-none motion-reduce:left-1/3" />
          </div>
        </div>

        <p className="text-muted-foreground/70 text-xs">
          You can safely leave — generation continues in the background, and your
          syllabus will be here when you get back.
        </p>
      </div>
    </div>
  );
}

/**
 * Lightweight "clusters assembling" motif — faint cluster cards pulsing in
 * sequence. Echoes the syllabus tree without being noisy. Purely decorative.
 */
function ClusterSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-2" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="border-border/40 bg-foreground/5 h-9 w-16 animate-pulse rounded-md border motion-reduce:animate-none"
          style={{ animationDelay: `${i * 180}ms`, animationDuration: "1800ms" }}
        />
      ))}
    </div>
  );
}
