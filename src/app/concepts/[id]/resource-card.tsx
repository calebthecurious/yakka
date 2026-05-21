"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleDashed,
  FileText,
  Film,
  GraduationCap,
  Hammer,
  Loader2,
  RotateCw,
  ScrollText,
  Search,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  generateStudyBrief,
  markResourceConsuming,
  updateResourceStatus,
} from "./actions";
import { StudyBrief, type StudyBriefData } from "./study-brief";

type ResourceType =
  | "course"
  | "book"
  | "video"
  | "article"
  | "project"
  | "paper";
type ResourceStatus = "planned" | "consuming" | "completed" | "abandoned";

const TYPE_ICON: Record<ResourceType, LucideIcon> = {
  course: GraduationCap,
  book: BookOpen,
  video: Film,
  article: FileText,
  project: Hammer,
  paper: ScrollText,
};

const TYPE_LABEL: Record<ResourceType, string> = {
  course: "Course",
  book: "Book",
  video: "Video",
  article: "Article",
  project: "Project",
  paper: "Paper",
};

type ChoosableStatus = Exclude<ResourceStatus, "abandoned">;

const STATUS_OPTIONS: Array<{
  status: ChoosableStatus;
  label: string;
  icon: LucideIcon;
  activeClass: string;
}> = [
  {
    status: "planned",
    label: "Planned",
    icon: CircleDashed,
    activeClass:
      "bg-muted text-foreground border-foreground/30",
  },
  {
    status: "consuming",
    label: "In progress",
    icon: Loader2,
    activeClass:
      "bg-amber-500/15 text-amber-200 border-amber-500/40",
  },
  {
    status: "completed",
    label: "Done",
    icon: Check,
    activeClass:
      "bg-emerald-500/15 text-emerald-200 border-emerald-500/40",
  },
];

function getResourceDomain(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

type Props = {
  resource: {
    id: string;
    type: ResourceType;
    title: string;
    url: string | null;
    author: string | null;
    status: ResourceStatus;
    notes: string | null;
    addedByUser: boolean;
  };
  conceptId: string;
  variant?: "prominent" | "default";
  existingBrief?: StudyBriefData | null;
};

function buildSearchUrl(resource: {
  type: ResourceType;
  title: string;
  author: string | null;
}): string {
  const query = encodeURIComponent(
    resource.author ? `${resource.title} ${resource.author}` : resource.title,
  );
  return resource.type === "paper"
    ? `https://scholar.google.com/scholar?q=${query}`
    : `https://www.google.com/search?q=${query}`;
}

export function ResourceCard({
  resource,
  conceptId,
  variant = "default",
  existingBrief = null,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [brief, setBrief] = useState<StudyBriefData | null>(existingBrief);
  const [briefExpanded, setBriefExpanded] = useState(false);
  const [generatingBrief, setGeneratingBrief] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);
  const Icon = TYPE_ICON[resource.type];
  const isProminent = variant === "prominent";

  function handleGenerateBrief() {
    setGeneratingBrief(true);
    setBriefError(null);
    void (async () => {
      try {
        const result = await generateStudyBrief({
          resourceId: resource.id,
          conceptId,
        });
        if (result.ok && result.brief) {
          setBrief({
            keyPoints: result.brief.keyPoints,
            application: result.brief.application,
            locations: result.brief.locations,
            checkQuestions: result.brief.checkQuestions,
            aiConfidence: result.brief.aiConfidence,
          });
          setBriefExpanded(true);
        } else {
          setBriefError(result.message ?? "Generation failed.");
        }
      } catch (err) {
        setBriefError(
          err instanceof Error ? err.message : "Generation failed.",
        );
      } finally {
        setGeneratingBrief(false);
      }
    })();
  }

  const hasDirectUrl = Boolean(resource.url);
  const effectiveUrl =
    resource.url ??
    buildSearchUrl({
      type: resource.type,
      title: resource.title,
      author: resource.author,
    });
  const IndicatorIcon = hasDirectUrl ? ArrowUpRight : Search;

  const source =
    resource.author ??
    getResourceDomain(resource.url) ??
    (resource.type === "paper" ? "Search Google Scholar" : "Search Google");

  function handleOpenResource() {
    if (resource.status !== "planned") return;
    void (async () => {
      try {
        const result = await markResourceConsuming({
          resourceId: resource.id,
          conceptId,
        });
        if (result.ok) router.refresh();
      } catch (err) {
        console.error("[ResourceCard] auto-mark failed", err);
      }
    })();
  }

  function handleSetStatus(next: ChoosableStatus) {
    if (resource.status === next) return;
    startTransition(async () => {
      const result = await updateResourceStatus({
        resourceId: resource.id,
        conceptId,
        status: next,
      });
      if (result.ok) router.refresh();
    });
  }

  const cardClasses = cn(
    "border-border/60 bg-card/40 block cursor-pointer rounded-lg border transition-colors hover:border-foreground/40 hover:bg-card/70 focus-visible:border-foreground/60 focus-visible:outline-none",
    isProminent ? "px-5 py-4" : "px-4 py-3",
    isProminent && "border-primary/30 bg-primary/5",
  );

  const inner = (
    <div className="flex items-start gap-3 pr-28">
      <Icon
        className={cn(
          "text-muted-foreground mt-0.5 shrink-0",
          isProminent ? "size-5" : "size-4",
        )}
        aria-hidden
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <Badge variant="outline" className="text-[10px] uppercase">
            {TYPE_LABEL[resource.type]}
          </Badge>
          <span
            className={cn(
              "font-semibold leading-tight",
              isProminent ? "text-base" : "text-sm",
            )}
          >
            {resource.title}
          </span>
          {resource.addedByUser ? (
            <Badge
              variant="outline"
              className="border-foreground/20 text-[10px]"
            >
              You
            </Badge>
          ) : null}
        </div>
        {source ? (
          <span className="text-muted-foreground text-xs">{source}</span>
        ) : null}
        {resource.notes ? (
          <p className="text-foreground/85 mt-1 text-xs leading-relaxed">
            {resource.notes}
          </p>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
    <div className={cn("relative", isPending && "opacity-70")}>
      <a
        href={effectiveUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleOpenResource}
        className={cardClasses}
        aria-label={
          hasDirectUrl
            ? `Open ${resource.title} in new tab`
            : `Search for ${resource.title} in new tab`
        }
      >
        {inner}
      </a>

      <IndicatorIcon
        className="text-muted-foreground absolute right-3 top-3 size-4"
        aria-hidden
      />
      {!hasDirectUrl ? (
        <span className="sr-only">No direct link — opens search.</span>
      ) : null}

      <div
        role="radiogroup"
        aria-label="Resource status"
        className="absolute right-3 top-9 z-10 flex items-center gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        {STATUS_OPTIONS.map((opt) => {
          const StatusIcon = opt.icon;
          const active = resource.status === opt.status;
          return (
            <button
              key={opt.status}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`Mark as ${opt.label}`}
              title={opt.label}
              onClick={(e) => {
                e.stopPropagation();
                handleSetStatus(opt.status);
              }}
              className={cn(
                "rounded-md border p-1 transition-colors",
                active
                  ? opt.activeClass
                  : "border-border bg-background/40 text-muted-foreground hover:border-foreground/30 hover:text-foreground",
              )}
            >
              <StatusIcon className="size-3" aria-hidden />
            </button>
          );
        })}
      </div>
    </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          {brief ? (
            <button
              type="button"
              onClick={() => setBriefExpanded((v) => !v)}
              aria-expanded={briefExpanded}
              className="text-foreground/80 hover:text-foreground inline-flex items-center gap-1.5 text-xs font-medium"
            >
              <Sparkles className="size-3.5" aria-hidden />
              {briefExpanded ? "Hide study brief" : "View study brief"}
              <ChevronDown
                className={cn(
                  "size-3 transition-transform",
                  briefExpanded && "rotate-180",
                )}
                aria-hidden
              />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleGenerateBrief}
              disabled={generatingBrief}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs font-medium disabled:opacity-60"
            >
              {generatingBrief ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="size-3.5" aria-hidden />
              )}
              {generatingBrief ? "Generating brief…" : "Generate study brief"}
            </button>
          )}
        </div>

        {briefError ? (
          <p className="text-destructive text-xs">{briefError}</p>
        ) : null}

        {brief && briefExpanded ? (
          <div className="flex flex-col gap-2">
            <StudyBrief brief={brief} />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleGenerateBrief}
                disabled={generatingBrief}
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs disabled:opacity-60"
              >
                {generatingBrief ? (
                  <Loader2 className="size-3 animate-spin" aria-hidden />
                ) : (
                  <RotateCw className="size-3" aria-hidden />
                )}
                {generatingBrief ? "Regenerating…" : "Regenerate"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
