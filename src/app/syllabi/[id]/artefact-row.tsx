"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import {
  ChevronRight,
  Hammer,
  ScrollText,
  Award,
  GitPullRequest,
  ExternalLink,
  ShieldCheck,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { deleteArtefact, toggleArtefactVerification } from "./actions";

type ArtefactType = "project" | "writeup" | "certificate" | "contribution";

const TYPE_META: Record<ArtefactType, { label: string; icon: LucideIcon }> = {
  project: { label: "Project", icon: Hammer },
  writeup: { label: "Writeup", icon: ScrollText },
  certificate: { label: "Certificate", icon: Award },
  contribution: { label: "Contribution", icon: GitPullRequest },
};

type Props = {
  artefactId: string;
  syllabusId: string;
  type: ArtefactType;
  title: string;
  url: string | null;
  description: string;
  reflection: string;
  verified: boolean;
  subSkillName: string;
};

export function ArtefactRow({
  artefactId,
  syllabusId,
  type,
  title,
  url,
  description,
  reflection,
  verified,
  subSkillName,
}: Props) {
  const [optimisticVerified, setOptimisticVerified] = useOptimistic<
    boolean,
    boolean
  >(verified, (_prev, next) => next);
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const Icon = TYPE_META[type].icon;

  // Full text (description + reflection) lives behind expansion; the row stays
  // compact by default.
  const hasDetail = Boolean(description || reflection);

  function handleToggle() {
    const next = !optimisticVerified;
    startTransition(async () => {
      setOptimisticVerified(next);
      const result = await toggleArtefactVerification({
        artefactId,
        syllabusId,
        verified: next,
      });
      if (!result.ok) console.error(result.message);
    });
  }

  function handleDelete() {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    startTransition(async () => {
      const result = await deleteArtefact({ artefactId, syllabusId });
      if (!result.ok) console.error(result.message);
    });
  }

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn(
        "border-border/60 bg-card/40 rounded-md border",
        optimisticVerified && "border-emerald-500/30 bg-emerald-500/5",
        isPending && "opacity-70",
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        {hasDetail ? (
          <CollapsibleTrigger
            aria-label={open ? "Hide details" : "Show details"}
            className="text-muted-foreground hover:text-foreground -ml-1 shrink-0 rounded p-0.5 transition-colors"
          >
            <ChevronRight
              className={cn("size-3.5 transition-transform", open && "rotate-90")}
            />
          </CollapsibleTrigger>
        ) : (
          <span className="size-3.5 shrink-0" aria-hidden />
        )}
        <Icon className="text-muted-foreground size-3.5 shrink-0" />
        <Badge variant="outline" className="shrink-0 text-[10px] uppercase">
          {TYPE_META[type].label}
        </Badge>
        <Link
          href={`/artefacts/${artefactId}`}
          className="truncate text-sm font-medium underline-offset-4 hover:underline"
        >
          {title}
        </Link>
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open artefact URL in new tab"
            className="text-muted-foreground hover:text-foreground inline-flex shrink-0 items-center"
          >
            <ExternalLink className="size-3" />
          </a>
        ) : null}
        {optimisticVerified ? (
          <Badge
            variant="outline"
            className="shrink-0 border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-200"
          >
            <ShieldCheck className="mr-1 size-2.5" />
            Verified
          </Badge>
        ) : (
          <Badge
            variant="secondary"
            className="text-muted-foreground shrink-0 text-[10px]"
          >
            Self-logged
          </Badge>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={handleToggle}
            className={cn(
              "rounded-md border px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase transition-colors",
              optimisticVerified
                ? "border-border bg-muted/40 text-muted-foreground hover:text-foreground"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20",
            )}
          >
            {optimisticVerified ? "Unverify" : "Verify"}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="text-muted-foreground hover:text-destructive rounded-md p-1 transition-colors"
            aria-label="Delete artefact"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      {hasDetail ? (
        <CollapsibleContent>
          <div className="border-border/40 ml-[26px] flex flex-col gap-1.5 border-t px-3 py-2">
            <p className="text-muted-foreground text-xs">
              Demonstrates:{" "}
              <span className="text-foreground/80">{subSkillName}</span>
            </p>
            {description ? (
              <p className="text-foreground/85 text-xs leading-relaxed">
                {description}
              </p>
            ) : null}
            {reflection ? (
              <p className="text-muted-foreground border-l-foreground/20 border-l-2 pl-2 text-xs leading-relaxed italic">
                {reflection}
              </p>
            ) : null}
          </div>
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  );
}
