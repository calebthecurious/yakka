"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Full-screen loading experience shown while the `createSyllabus` Server Action
 * is in flight (it runs one skeleton Grok call + one streamed call per
 * sub-skill, ~1-3 min total).
 *
 * HONESTY NOTE: we cannot read true progress from a single synchronous Server
 * Action, so both the messages and the bar are timer-driven. They are still
 * honest:
 *   - Each STAGE line is a real, ordered description of what the generator
 *     actually does (see generate-syllabus.ts): skeleton (read role → identify
 *     clusters/skills → classify roleNature into technical/professional →
 *     blockers/branches), then per-sub-skill detail (concepts → tier sequencing
 *     → resources), then assembly. We never loop back to an earlier line — that
 *     would read as frozen — we hold the final line until the result arrives.
 *   - The bar eases on a decay curve that approaches but never reaches a 92%
 *     cap, so it is always moving and never sits at a "done" number while we
 *     wait. The real completion is the navigation to the syllabus page.
 * We deliberately do NOT invent granular real-time telemetry.
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
const PROGRESS_TAU = 55; // easing time-constant: fast early, slows toward the cap
const PROGRESS_CAP = 92; // never claim done until the real result navigates away

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

  // The Server Action is in flight; warn before a stray click / refresh throws
  // away ~3 minutes of generation work.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const progress = Math.min(
    PROGRESS_CAP,
    PROGRESS_CAP * (1 - Math.exp(-elapsed / PROGRESS_TAU)),
  );
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
          <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
            <div
              className="bg-foreground/70 h-full rounded-full transition-[width] duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <p className="text-muted-foreground/70 text-xs">
          Keep this tab open — closing it will cancel generation.
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
