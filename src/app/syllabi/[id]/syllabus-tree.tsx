"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ChevronRight,
  Wrench,
  Network,
  MessagesSquare,
  Compass,
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

type SubSkillNode = {
  id: string;
  name: string;
  description: string;
  estimatedHours: number;
  concepts: ConceptNode[];
};

export type ClusterNode = {
  id: string;
  name: string;
  description: string;
  type: ClusterType;
  weight: number;
  suggestedArtefact: {
    type: ArtefactType;
    title: string;
    description: string;
  } | null;
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
    <div className="flex flex-col gap-8">
      {groups.map((group) => (
        <section key={group.group} className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <h3 className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
              {group.label}
            </h3>
            <span className="bg-border h-px flex-1" />
            <span className="text-muted-foreground/70 text-xs tabular-nums">
              {group.clusters.length}{" "}
              {group.clusters.length === 1 ? "cluster" : "clusters"}
            </span>
          </div>
          <div className="flex flex-col gap-4">
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

  const allConcepts = cluster.subSkills.flatMap((s) => s.concepts);
  const understood = allConcepts.filter(
    (c) => c.status === "understood" || c.status === "verified",
  ).length;
  const progressPct =
    allConcepts.length > 0 ? (understood / allConcepts.length) * 100 : 0;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn(
        "bg-card overflow-hidden rounded-lg border border-l-4",
        style.border,
      )}
    >
      <CollapsibleTrigger className="hover:bg-muted/30 flex w-full items-start gap-3 px-4 py-3 text-left transition-colors">
        <ChevronRight
          className={cn(
            "text-muted-foreground mt-1 size-4 shrink-0 transition-transform",
            open && "rotate-90",
          )}
        />
        <Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{cluster.name}</span>
            <Badge variant="outline" className={cn("text-[10px]", style.badge)}>
              {style.label}
            </Badge>
            <Badge variant="secondary" className="text-[10px]">
              Weight {cluster.weight}/5
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">{cluster.description}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
          <span className="text-muted-foreground">
            {understood} / {allConcepts.length} understood
          </span>
          <div className="bg-muted h-1 w-24 overflow-hidden rounded-full">
            <div
              className="bg-foreground/60 h-full transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="border-border/40 flex flex-col gap-4 border-t px-4 py-4">
          {cluster.suggestedArtefact ? (
            <Link
              href={`/clusters/${cluster.id}/artefact`}
              className="border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/50 block rounded-md border px-3 py-2 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Badge className="text-[10px]">
                  {ARTEFACT_LABEL[cluster.suggestedArtefact.type]}
                </Badge>
                <span className="text-sm font-medium">
                  {cluster.suggestedArtefact.title}
                </span>
                <Badge
                  variant="outline"
                  className="text-muted-foreground border-foreground/15 text-[10px]"
                >
                  Suggested
                </Badge>
              </div>
              <p className="text-muted-foreground mt-1.5 text-xs">
                {cluster.suggestedArtefact.description}
              </p>
              <p className="text-primary/80 mt-2 text-xs">
                View details & commit to this project →
              </p>
            </Link>
          ) : null}

          <ArtefactsSection
            syllabusId={syllabusId}
            artefacts={cluster.artefacts}
            subSkillOptions={cluster.subSkills.map((s) => ({
              id: s.id,
              name: s.name,
            }))}
          />

          <ul className="flex flex-col gap-2">
            {cluster.subSkills.map((skill) => (
              <SubSkillSection
                key={skill.id}
                syllabusId={syllabusId}
                skill={skill}
              />
            ))}
          </ul>
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
      <div className="flex items-center justify-between">
        <h4 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
          Your artefacts{" "}
          {artefacts.length > 0 ? (
            <span className="text-muted-foreground/70 normal-case">
              · {verifiedCount} verified / {artefacts.length} total
            </span>
          ) : null}
        </h4>
        <ArtefactForm
          syllabusId={syllabusId}
          subSkillOptions={subSkillOptions}
        />
      </div>
      {artefacts.length > 0 ? (
        <div className="flex flex-col gap-2">
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
        <p className="text-muted-foreground text-xs">
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
  const understood = skill.concepts.filter(
    (c) => c.status === "understood" || c.status === "verified",
  ).length;

  return (
    <li>
      <Collapsible
        open={open}
        onOpenChange={setOpen}
        className="border-border/60 bg-background/40 rounded-md border"
      >
        <CollapsibleTrigger className="hover:bg-muted/20 flex w-full items-start gap-2 px-3 py-2 text-left transition-colors">
          <ChevronRight
            className={cn(
              "text-muted-foreground mt-0.5 size-3.5 shrink-0 transition-transform",
              open && "rotate-90",
            )}
          />
          <div className="flex flex-1 flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{skill.name}</span>
              <span className="text-muted-foreground text-xs">
                ~{skill.estimatedHours}h
              </span>
            </div>
            <p className="text-muted-foreground text-xs">{skill.description}</p>
          </div>
          <span className="text-muted-foreground shrink-0 text-xs">
            {understood} / {skill.concepts.length}
          </span>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <ul className="border-border/40 flex flex-col gap-0.5 border-t px-2 py-2">
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
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}
