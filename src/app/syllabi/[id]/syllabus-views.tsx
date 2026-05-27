"use client";

import { useMemo, useState } from "react";
import { Aperture, ListTree, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { SyllabusTree, type ClusterNode } from "./syllabus-tree";
import { GoalMandala, type MandalaCluster } from "./goal-mandala";

type View = "mandala" | "tree";

export function SyllabusViews({
  syllabusId,
  clusters,
  targetRole,
  targetCompany,
}: {
  syllabusId: string;
  clusters: ClusterNode[];
  targetRole: string;
  targetCompany: string | null;
}) {
  const [view, setView] = useState<View>("mandala");

  const mandalaClusters = useMemo<MandalaCluster[]>(
    () =>
      clusters.map((cluster) => ({
        id: cluster.id,
        name: cluster.name,
        type: cluster.type,
        weight: cluster.weight,
        concepts: cluster.subSkills.flatMap((skill) =>
          skill.concepts.map((concept) => ({
            id: concept.id,
            name: concept.name,
            status: concept.status,
          })),
        ),
      })),
    [clusters],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="inline-flex w-fit rounded-lg border border-border/60 bg-card p-0.5 text-sm">
        <ToggleButton
          active={view === "mandala"}
          onClick={() => setView("mandala")}
          icon={Aperture}
          label="Mandala"
        />
        <ToggleButton
          active={view === "tree"}
          onClick={() => setView("tree")}
          icon={ListTree}
          label="Tree"
        />
      </div>

      {/* Both stay mounted so the tree's collapse state survives a toggle. */}
      <div className={cn(view !== "mandala" && "hidden")}>
        <GoalMandala
          targetRole={targetRole}
          targetCompany={targetCompany}
          clusters={mandalaClusters}
        />
      </div>
      <div className={cn(view !== "tree" && "hidden")}>
        <SyllabusTree syllabusId={syllabusId} clusters={clusters} />
      </div>
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors",
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}
