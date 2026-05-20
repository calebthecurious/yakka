"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import {
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
  const Icon = TYPE_META[type].icon;

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
    <div
      className={cn(
        "border-border/60 bg-card/40 flex flex-col gap-2 rounded-md border px-3 py-2.5",
        optimisticVerified && "border-emerald-500/30 bg-emerald-500/5",
        isPending && "opacity-70",
      )}
    >
      <div className="flex items-start gap-3">
        <Icon className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <Badge variant="outline" className="text-[10px] uppercase">
              {TYPE_META[type].label}
            </Badge>
            <Link
              href={`/artefacts/${artefactId}`}
              className="text-sm font-medium underline-offset-4 hover:underline"
            >
              {title}
            </Link>
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                aria-label="Open artefact URL in new tab"
                className="text-muted-foreground hover:text-foreground inline-flex items-center"
              >
                <ExternalLink className="size-3" />
              </a>
            ) : null}
            {optimisticVerified ? (
              <Badge
                variant="outline"
                className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-200"
              >
                <ShieldCheck className="mr-1 size-2.5" />
                Verified
              </Badge>
            ) : null}
          </div>
          <p className="text-muted-foreground text-xs">
            Demonstrates: <span className="text-foreground/80">{subSkillName}</span>
          </p>
          {description ? (
            <p className="text-foreground/85 text-xs leading-relaxed">
              {description}
            </p>
          ) : null}
          {reflection ? (
            <p className="text-muted-foreground border-l-foreground/20 mt-1 border-l-2 pl-2 text-xs leading-relaxed italic">
              {reflection}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={handleToggle}
          className={cn(
            "rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide transition-colors",
            optimisticVerified
              ? "border-border bg-muted/40 text-muted-foreground hover:text-foreground"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20",
          )}
        >
          {optimisticVerified ? "Unverify" : "Mark verified"}
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
  );
}
