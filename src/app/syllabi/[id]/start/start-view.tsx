"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import {
  CheckCircle2,
  CircleHelp,
  CircleDashed,
  ArrowRight,
  ExternalLink,
  Sparkles,
  AlertTriangle,
  PartyPopper,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { setFoundationItemStatus } from "../foundations-actions";

type UserStatus = "have_it" | "need_it" | "unset";
type ConceptStatus = "not_started" | "learning" | "understood" | "verified";

type Resource = { title: string; url: string | null; type: string };

type Baseline = {
  id: string;
  title: string;
  description: string;
  suggestedResources: Resource[];
  userStatus: UserStatus;
  resumeSignal: string | null;
};

type LaunchStep = {
  id: string;
  title: string;
  description: string;
  suggestedResources: Resource[];
  linkedConcept: { id: string; name: string; status: ConceptStatus } | null;
};

export function StartView({
  baselines,
  launchSteps,
}: {
  baselines: Baseline[];
  launchSteps: LaunchStep[];
}) {
  const [optimisticBaselines, applyStatus] = useOptimistic(
    baselines,
    (state, update: { id: string; status: UserStatus }) =>
      state.map((b) =>
        b.id === update.id ? { ...b, userStatus: update.status } : b,
      ),
  );
  const [, startTransition] = useTransition();

  function handleSet(id: string, status: UserStatus) {
    startTransition(async () => {
      applyStatus({ id, status });
      await setFoundationItemStatus(id, status);
    });
  }

  return (
    <div className="flex flex-col gap-10">
      {/* 1 — Before you begin */}
      <section className="flex flex-col gap-4">
        <SectionHeading
          step="01"
          title="Before you begin"
          subtitle="What this syllabus assumes you already know. Be honest — mark each one. Nothing you do here blocks the rest of your learning."
        />
        <ul className="flex flex-col gap-3">
          {optimisticBaselines.map((b) => (
            <BaselineItem key={b.id} baseline={b} onSet={handleSet} />
          ))}
        </ul>
      </section>

      {/* Readiness summary — reactive to self-assessment */}
      <ReadinessSummary baselines={optimisticBaselines} />

      {/* 2 — Your launching point */}
      <section className="flex flex-col gap-4">
        <SectionHeading
          step="02"
          title="Your launching point"
          subtitle="The genuine first steps, in order. Start with step 1 — it's small and concrete on purpose."
        />
        <ol className="flex flex-col gap-3">
          {launchSteps.map((s, i) => (
            <LaunchStepItem key={s.id} step={s} index={i} />
          ))}
        </ol>
      </section>
    </div>
  );
}

function SectionHeading({
  step,
  title,
  subtitle,
}: {
  step: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2.5">
        <span className="text-muted-foreground/60 text-xs font-semibold tabular-nums tracking-wider">
          {step}
        </span>
        <h2 className="text-lg font-medium tracking-tight">{title}</h2>
      </div>
      <p className="text-muted-foreground max-w-2xl text-sm">{subtitle}</p>
    </div>
  );
}

function BaselineItem({
  baseline,
  onSet,
}: {
  baseline: Baseline;
  onSet: (id: string, status: UserStatus) => void;
}) {
  const { id, title, description, suggestedResources, userStatus, resumeSignal } =
    baseline;
  const haveIt = userStatus === "have_it";
  const needIt = userStatus === "need_it";

  return (
    <li
      className={cn(
        "bg-card rounded-lg border px-4 py-3 transition-colors",
        haveIt && "border-emerald-500/30 bg-emerald-500/[0.03]",
        needIt && "border-amber-500/30 bg-amber-500/[0.03]",
        !haveIt && !needIt && "border-border/60",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            {haveIt ? (
              <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
            ) : needIt ? (
              <CircleHelp className="size-4 shrink-0 text-amber-400" />
            ) : (
              <CircleDashed className="text-muted-foreground/50 size-4 shrink-0" />
            )}
            <span
              className={cn(
                "font-medium",
                haveIt && "text-muted-foreground",
              )}
            >
              {title}
            </span>
          </div>
          <p className="text-muted-foreground pl-6 text-sm">{description}</p>
          {resumeSignal ? (
            <p className="text-muted-foreground/80 mt-0.5 flex items-start gap-1.5 pl-6 text-xs">
              <Sparkles className="mt-0.5 size-3 shrink-0 text-violet-300" />
              <span>
                <span className="text-violet-300/90">From your résumé:</span>{" "}
                {resumeSignal}
              </span>
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-1.5">
          <ToggleChip
            active={haveIt}
            activeClass="border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
            onClick={() => onSet(id, haveIt ? "unset" : "have_it")}
          >
            I have this
          </ToggleChip>
          <ToggleChip
            active={needIt}
            activeClass="border-amber-500/40 bg-amber-500/15 text-amber-300"
            onClick={() => onSet(id, needIt ? "unset" : "need_it")}
          >
            I need this
          </ToggleChip>
        </div>
      </div>

      {needIt && suggestedResources.length > 0 ? (
        <div className="border-border/40 mt-3 ml-6 flex flex-col gap-1.5 border-t pt-3">
          <p className="text-muted-foreground text-xs font-medium">
            Get to the starting line:
          </p>
          {suggestedResources.map((r, i) => (
            <ResourceLink key={i} resource={r} />
          ))}
        </div>
      ) : null}
    </li>
  );
}

function ToggleChip({
  active,
  activeClass,
  onClick,
  children,
}: {
  active: boolean;
  activeClass: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? activeClass
          : "border-border/60 text-muted-foreground hover:text-foreground hover:border-foreground/30",
      )}
    >
      {children}
    </button>
  );
}

function ReadinessSummary({ baselines }: { baselines: Baseline[] }) {
  const total = baselines.length;
  const have = baselines.filter((b) => b.userStatus === "have_it").length;
  const need = baselines.filter((b) => b.userStatus === "need_it").length;
  const needTitles = baselines
    .filter((b) => b.userStatus === "need_it")
    .map((b) => b.title);

  let tone: "ready" | "caution" | "neutral";
  let Icon = Sparkles;
  let heading: string;
  let body: string;

  if (total > 0 && have === total) {
    tone = "ready";
    Icon = PartyPopper;
    heading = "You're ready — start with step 1.";
    body =
      "You've got every baseline this syllabus assumes. Jump straight into your launching point below.";
  } else if (need >= 2) {
    tone = "caution";
    Icon = AlertTriangle;
    heading = `A few things to shore up first (${need}).`;
    body = `You've flagged ${needTitles.join(", ")}. It's worth spending a little time here before going deep — the resources under each will get you to the starting line. You can still begin step 1 whenever you like; nothing is locked.`;
  } else if (need === 1) {
    tone = "caution";
    Icon = AlertTriangle;
    heading = "One baseline to shore up.";
    body = `Glance at the resources under "${needTitles[0]}" to get to the starting line — then dive into step 1 below.`;
  } else {
    tone = "neutral";
    Icon = Sparkles;
    heading =
      have > 0 ? "Looking good so far." : "Take a moment to self-assess above.";
    body =
      have > 0
        ? "Finish marking the baselines above so you know exactly where you stand. Nothing's stopping you from starting step 1 now."
        : "Mark each baseline honestly — it's the fastest way to know whether to warm up first or dive straight into step 1.";
  }

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border px-4 py-3",
        tone === "ready" && "border-emerald-500/30 bg-emerald-500/[0.04]",
        tone === "caution" && "border-amber-500/30 bg-amber-500/[0.04]",
        tone === "neutral" && "border-border/60 bg-card",
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 size-5 shrink-0",
          tone === "ready" && "text-emerald-400",
          tone === "caution" && "text-amber-400",
          tone === "neutral" && "text-muted-foreground",
        )}
      />
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium">{heading}</p>
        <p className="text-muted-foreground text-sm">{body}</p>
      </div>
    </div>
  );
}

const CONCEPT_STATUS_BADGE: Record<
  ConceptStatus,
  { label: string; className: string } | null
> = {
  not_started: null,
  learning: {
    label: "Learning",
    className: "bg-amber-500/10 text-amber-200 border-amber-500/30",
  },
  understood: {
    label: "Understood",
    className: "bg-emerald-500/10 text-emerald-200 border-emerald-500/30",
  },
  verified: {
    label: "Verified",
    className: "bg-emerald-500/15 text-emerald-200 border-emerald-500/40",
  },
};

function LaunchStepItem({ step, index }: { step: LaunchStep; index: number }) {
  const isFirst = index === 0;
  const { title, description, suggestedResources, linkedConcept } = step;

  const statusBadge = linkedConcept
    ? CONCEPT_STATUS_BADGE[linkedConcept.status]
    : null;

  const body = (
    <>
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full font-semibold tabular-nums",
            isFirst
              ? "bg-primary text-primary-foreground size-9 text-base"
              : "bg-muted text-muted-foreground size-7 text-sm",
          )}
        >
          {index + 1}
        </span>
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            {isFirst ? (
              <Badge className="bg-primary/15 text-primary border-primary/30 text-[10px] uppercase tracking-wide">
                Start here
              </Badge>
            ) : null}
            <span
              className={cn(
                "font-medium",
                isFirst && "text-base",
              )}
            >
              {title}
            </span>
            {statusBadge ? (
              <Badge
                variant="outline"
                className={cn("text-[10px]", statusBadge.className)}
              >
                {statusBadge.label}
              </Badge>
            ) : null}
          </div>
          <p className="text-muted-foreground text-sm">{description}</p>

          {suggestedResources.length > 0 ? (
            <div className="mt-1.5 flex flex-col gap-1.5">
              {suggestedResources.map((r, i) => (
                <ResourceLink key={i} resource={r} />
              ))}
            </div>
          ) : null}

          {linkedConcept ? (
            <span
              className={cn(
                "mt-1.5 inline-flex w-fit items-center gap-1 text-xs",
                isFirst ? "text-primary" : "text-primary/80",
              )}
            >
              Go to concept: {linkedConcept.name}
              <ArrowRight className="size-3" />
            </span>
          ) : null}
        </div>
      </div>
    </>
  );

  const className = cn(
    "block rounded-lg border px-4 py-3 transition-colors",
    isFirst
      ? "border-primary/40 bg-primary/[0.05]"
      : "border-border/60 bg-card",
    linkedConcept && "hover:border-primary/50 hover:bg-primary/[0.04]",
  );

  return (
    <li>
      {linkedConcept ? (
        <Link href={`/concepts/${linkedConcept.id}`} className={className}>
          {body}
        </Link>
      ) : (
        <div className={className}>{body}</div>
      )}
    </li>
  );
}

function ResourceLink({ resource }: { resource: Resource }) {
  const inner = (
    <>
      <BookOpen className="size-3 shrink-0" />
      <span className="truncate">{resource.title}</span>
      <span className="text-muted-foreground/60 shrink-0 uppercase">
        {resource.type}
      </span>
      {resource.url ? <ExternalLink className="size-3 shrink-0" /> : null}
    </>
  );
  if (resource.url) {
    return (
      <a
        href={resource.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs underline-offset-4 hover:underline"
      >
        {inner}
      </a>
    );
  }
  return (
    <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
      {inner}
    </span>
  );
}
