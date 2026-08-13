"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ChevronRight,
  Wrench,
  Network,
  MessagesSquare,
  Compass,
  Target,
  BadgeCheck,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { groupClustersByDisplay } from "@/lib/cluster-grouping";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ConceptRow } from "./concept-row";
import { ArtefactForm } from "./artefact-form";
import { ArtefactRow } from "./artefact-row";

type Status = "not_started" | "learning" | "understood" | "verified";
type ClusterType = "technical" | "domain" | "soft" | "meta";
type ArtefactType = "project" | "writeup" | "certificate" | "contribution";

type ArtefactNode = {
  id: string;
  type: ArtefactType;
  title: string;
  url: string | null;
  description: string;
  reflection: string;
  verified: boolean;
  subSkillId: string;
  subSkillName: string;
};

type ConceptNode = {
  id: string;
  name: string;
  status: Status;
  resourceCount: number;
};

/**
 * Evidence-gated concept counts, computed server-side from the readiness ledger
 * and passed down. This component never derives progress from `ConceptNode.status`
 * — that field is self-declared and drives the per-concept checkbox only.
 */
type ProgressCounts = {
  /** Evidence-verified concepts. */
  done: number;
  /** All concepts at this level. */
  total: number;
  /** done/total as 0–100. */
  pct: number;
};

type SubSkillNode = {
  id: string;
  name: string;
  description: string;
  estimatedHours: number;
  readiness: ProgressCounts;
  concepts: ConceptNode[];
};

export type ClusterNode = {
  id: string;
  name: string;
  description: string;
  type: ClusterType;
  weight: number;
  isArtefactBearing: boolean;
  suggestedArtefact: {
    type: ArtefactType;
    title: string;
    description: string;
  } | null;
  /** Employer-value framing for the bearing cluster's artefact (null if none). */
  artefactTarget: { employerValue: string } | null;
  readiness: ProgressCounts;
  subSkills: SubSkillNode[];
  artefacts: ArtefactNode[];
};

const CLUSTER_STYLE: Record<
  ClusterType,
  { label: string; icon: LucideIcon; border: string; badge: string }
> = {
  technical: {
    label: "Technical",
    icon: Wrench,
    border: "border-l-foreground/30",
    badge: "bg-foreground/10 text-foreground border-foreground/20",
  },
  domain: {
    label: "Domain",
    icon: Network,
    border: "border-l-amber-500/50",
    badge: "bg-amber-500/10 text-amber-200 border-amber-500/30",
  },
  soft: {
    label: "Soft",
    icon: MessagesSquare,
    border: "border-l-sky-400/50",
    badge: "bg-sky-500/10 text-sky-200 border-sky-500/30",
  },
  meta: {
    label: "Meta",
    icon: Compass,
    border: "border-l-emerald-400/50",
    badge: "bg-emerald-500/10 text-emerald-200 border-emerald-500/30",
  },
};

const ARTEFACT_LABEL: Record<ArtefactType, string> = {
  project: "Project",
  writeup: "Writeup",
  certificate: "Certificate",
  contribution: "Contribution",
};

/** Small uppercase section label inside a cluster (parallel structure). */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-muted-foreground/70 text-[10px] font-medium tracking-wider uppercase">
      {children}
    </span>
  );
}

export function SyllabusTree({
  syllabusId,
  clusters,
}: {
  syllabusId: string;
  clusters: ClusterNode[];
}) {
  // Derive the higher-level Technical / Professional grouping from each
  // cluster's existing `type` (see src/lib/cluster-grouping.ts). Ordering /
  // sequencing within each group is preserved.
  const groups = groupClustersByDisplay(clusters);

  return (
    <div className="flex flex-col gap-10">
      {groups.map((group) => (
        <section key={group.group} className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <h3 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
              {group.label}
            </h3>
            <span className="bg-border h-px flex-1" />
            <span className="text-muted-foreground/70 text-xs tabular-nums">
              {group.clusters.length}{" "}
              {group.clusters.length === 1 ? "cluster" : "clusters"}
            </span>
          </div>
          <div className="flex flex-col gap-5">
            {group.clusters.map((cluster) => (
              <ClusterSection
                key={cluster.id}
                syllabusId={syllabusId}
                cluster={cluster}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ClusterSection({
  syllabusId,
  cluster,
}: {
  syllabusId: string;
  cluster: ClusterNode;
}) {
  const [open, setOpen] = useState(true);
  const style = CLUSTER_STYLE[cluster.type];
  const Icon = style.icon;

  const progress = cluster.readiness;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn(
        "bg-card overflow-hidden rounded-lg border border-l-4",
        style.border,
      )}
    >
      <CollapsibleTrigger className="hover:bg-muted/30 flex w-full items-center gap-3 px-4 py-3 text-left transition-colors">
        <ChevronRight
          className={cn(
            "text-muted-foreground size-4 shrink-0 transition-transform",
            open && "rotate-90",
          )}
        />
        <Icon className="text-muted-foreground size-4 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold tracking-tight">
              {cluster.name}
            </span>
            <Badge variant="outline" className={cn("text-[10px]", style.badge)}>
              {style.label}
            </Badge>
            <Badge variant="secondary" className="text-[10px]">
              Weight {cluster.weight}/5
            </Badge>
          </div>
          <p className="text-muted-foreground line-clamp-1 text-xs">
            {cluster.description}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
          <span className="text-muted-foreground tabular-nums">
            {progress.done} / {progress.total}
          </span>
          <div className="bg-muted h-1 w-20 overflow-hidden rounded-full">
            <div
              className="bg-foreground/60 h-full transition-all"
              style={{ width: `${progress.pct}%` }}
            />
          </div>
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="border-border/40 flex flex-col gap-5 border-t px-4 py-4">
          {cluster.isArtefactBearing && cluster.suggestedArtefact ? (
            <ProjectCard
              clusterId={cluster.id}
              artefact={cluster.suggestedArtefact}
            />
          ) : (
            <div className="border-border/60 bg-muted/20 text-muted-foreground flex items-center gap-2 rounded-md border px-3 py-2 text-xs">
              <BadgeCheck className="size-3.5 shrink-0" />
              <span>Proven by competency checks — no build artefact here.</span>
            </div>
          )}

          <ArtefactsSection
            syllabusId={syllabusId}
            artefacts={cluster.artefacts}
            subSkillOptions={cluster.subSkills.map((s) => ({
              id: s.id,
              name: s.name,
            }))}
          />

          <div className="flex flex-col gap-2">
            <SectionLabel>Sub-skills · {cluster.subSkills.length}</SectionLabel>
            <div className="border-border/50 divide-border/30 flex flex-col divide-y overflow-hidden rounded-md border">
              {cluster.subSkills.map((skill) => (
                <SubSkillSection
                  key={skill.id}
                  syllabusId={syllabusId}
                  skill={skill}
                />
              ))}
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * Compact, collapsed-by-default project card. Just the title row when closed;
 * expand reveals a one-line summary + the link to the full detail page. The full
 * problem statement and "why this matters" live on the detail page, not here.
 */
function ProjectCard({
  clusterId,
  artefact,
}: {
  clusterId: string;
  artefact: { type: ArtefactType; title: string; description: string };
}) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="border-primary/30 bg-primary/5 overflow-hidden rounded-md border"
    >
      <CollapsibleTrigger className="hover:bg-primary/10 flex w-full items-center gap-2 px-3 py-2 text-left transition-colors">
        <Target className="text-primary/80 size-3.5 shrink-0" />
        <Badge className="shrink-0 text-[10px]">
          {ARTEFACT_LABEL[artefact.type]}
        </Badge>
        <span className="truncate text-sm font-medium">{artefact.title}</span>
        <ChevronRight
          className={cn(
            "text-muted-foreground ml-auto size-3.5 shrink-0 transition-transform",
            open && "rotate-90",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-1.5 px-3 pb-2.5">
          <p className="text-muted-foreground line-clamp-1 text-xs">
            {artefact.description}
          </p>
          <Link
            href={`/clusters/${clusterId}/artefact`}
            className="text-primary/90 hover:text-primary text-xs font-medium"
          >
            View details &amp; build →
          </Link>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ArtefactsSection({
  syllabusId,
  artefacts,
  subSkillOptions,
}: {
  syllabusId: string;
  artefacts: ArtefactNode[];
  subSkillOptions: { id: string; name: string }[];
}) {
  const verifiedCount = artefacts.filter((a) => a.verified).length;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SectionLabel>Your artefacts</SectionLabel>
          {artefacts.length > 0 ? (
            <Badge variant="secondary" className="text-[10px] tabular-nums">
              {verifiedCount}/{artefacts.length} verified
            </Badge>
          ) : null}
        </div>
        <ArtefactForm syllabusId={syllabusId} subSkillOptions={subSkillOptions} />
      </div>
      {artefacts.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {artefacts.map((a) => (
            <ArtefactRow
              key={a.id}
              artefactId={a.id}
              syllabusId={syllabusId}
              type={a.type}
              title={a.title}
              url={a.url}
              description={a.description}
              reflection={a.reflection}
              verified={a.verified}
              subSkillName={a.subSkillName}
            />
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground/80 text-xs">
          No artefacts yet. Log one when you&apos;ve built something that
          demonstrates this cluster.
        </p>
      )}
    </div>
  );
}

function SubSkillSection({
  syllabusId,
  skill,
}: {
  syllabusId: string;
  skill: SubSkillNode;
}) {
  const [open, setOpen] = useState(false);
  const progress = skill.readiness;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="hover:bg-muted/20 flex w-full items-center gap-2 px-3 py-2 text-left transition-colors">
        <ChevronRight
          className={cn(
            "text-muted-foreground size-3.5 shrink-0 transition-transform",
            open && "rotate-90",
          )}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm font-medium">{skill.name}</span>
          {!open && skill.description ? (
            <p className="text-muted-foreground line-clamp-1 text-xs">
              {skill.description}
            </p>
          ) : null}
        </div>
        <span className="text-muted-foreground/80 shrink-0 text-xs tabular-nums">
          ~{skill.estimatedHours}h
        </span>
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
          {progress.done}/{progress.total}
        </span>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="border-border/30 border-t px-3 py-2">
          {skill.description ? (
            <p className="text-muted-foreground mb-2 ml-[22px] text-xs leading-relaxed">
              {skill.description}
            </p>
          ) : null}
          <ul className="flex flex-col gap-0.5">
            {skill.concepts.map((concept) => (
              <ConceptRow
                key={concept.id}
                conceptId={concept.id}
                syllabusId={syllabusId}
                name={concept.name}
                status={concept.status}
                resourceCount={concept.resourceCount}
              />
            ))}
          </ul>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
