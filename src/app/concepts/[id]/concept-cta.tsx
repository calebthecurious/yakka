import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  GraduationCap,
  Hammer,
  Rocket,
  RotateCw,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { COMPETENCY_CHECK_OUT_OF } from "@/lib/readiness/model";
import type { ConceptCta } from "@/lib/readiness/concept-cta";

/**
 * The one next step for a concept. Every state here is chosen by
 * `selectConceptCta` over ledger data — this component only renders, it never
 * decides. Keeps the existing "Start here" card treatment so the page's visual
 * language is unchanged; only the states and their copy are new.
 *
 * The `done` state is deliberately quiet: no arrow, no link, muted colours. When
 * a learner has verified everything there is nothing to nudge them toward, and
 * inventing a destination would be the dead-UI problem this replaces.
 */

type Presentation = {
  icon: LucideIcon;
  label: string;
  detail: string;
  cta: string;
  href: string;
};

export type ConceptCtaContext = {
  /** Title of the recommended resource, for the study state. */
  primaryResourceTitle: string | null;
  /** Name of the next unverified concept, for the move_on state. */
  nextConceptName: string | null;
  /** Name of the attach_evidence target cluster, for the cross-cluster case. */
  attachClusterName: string | null;
};

function present(cta: ConceptCta, ctx: ConceptCtaContext): Presentation | null {
  switch (cta.state) {
    case "study":
      return {
        icon: BookOpen,
        label: ctx.primaryResourceTitle
          ? `Study: ${ctx.primaryResourceTitle}`
          : "Work through the recommended resource",
        detail:
          "Get through the material first — the check is more useful once you have.",
        cta: "Go to resources",
        href: "#resources",
      };
    case "take_check":
      return {
        icon: GraduationCap,
        label: "Take the competency check",
        detail:
          "A short quiz on this concept — the honest test of whether it has landed.",
        cta: "Go to the check",
        href: "#check",
      };
    case "retake_check":
      return {
        icon: RotateCw,
        label: "Review the brief, then retake",
        detail: `Your best attempt was ${cta.bestScore}/${COMPETENCY_CHECK_OUT_OF}. Re-read the brief and go again.`,
        cta: "Go to the check",
        href: "#check",
      };
    case "attach_evidence":
      // Two flavours, one honest rule: the copy never claims a check was
      // passed (verification may be artefact-borne) and never says "this
      // cluster" when routing to another cluster's open target.
      return cta.isCurrentCluster
        ? {
            icon: Hammer,
            label: "Attach evidence",
            detail:
              "This concept is verified — build and log this cluster's artefact to turn it into evidence an employer can see.",
            cta: "Open the project",
            href: `/clusters/${cta.clusterId}/artefact`,
          }
        : {
            icon: Hammer,
            label: ctx.attachClusterName
              ? `Build the ${ctx.attachClusterName} artefact`
              : "Build the remaining artefact",
            detail:
              "Every concept is verified. This artefact is the evidence still open on your syllabus.",
            cta: "Open the project",
            href: `/clusters/${cta.clusterId}/artefact`,
          };
    case "move_on":
      return {
        icon: Rocket,
        label: ctx.nextConceptName
          ? `Next: ${ctx.nextConceptName}`
          : "Next unverified concept",
        detail: "This one is evidenced. Keep the momentum.",
        cta: "Open concept",
        href: `/concepts/${cta.nextConceptId}`,
      };
    case "done":
      return null;
  }
}

export function ConceptCtaCard({
  cta,
  context,
}: {
  cta: ConceptCta;
  context: ConceptCtaContext;
}) {
  const p = present(cta, context);

  if (!p) {
    return (
      <div className="border-border/60 bg-card/40 flex items-center gap-4 rounded-lg border px-4 py-3">
        <div className="text-muted-foreground bg-muted flex size-10 shrink-0 items-center justify-center rounded-full">
          <BadgeCheck className="size-5 text-emerald-300" />
        </div>
        <div className="flex flex-1 flex-col">
          <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
            Nothing outstanding
          </span>
          <span className="font-medium">Every milestone is evidenced</span>
          <span className="text-muted-foreground text-sm">
            Concepts and artefacts are all verified. Nothing here needs you
            right now.
          </span>
        </div>
      </div>
    );
  }

  const Icon = p.icon;
  const className =
    "group border-primary/40 bg-primary/5 hover:bg-primary/10 flex items-center gap-4 rounded-lg border px-4 py-3 transition-colors";
  const body = (
    <>
      <div className="bg-primary/15 text-primary flex size-10 shrink-0 items-center justify-center rounded-full">
        <Icon className="size-5" />
      </div>
      <div className="flex flex-1 flex-col">
        <span className="text-primary/80 text-[10px] font-medium tracking-wide uppercase">
          Start here
        </span>
        <span className="font-medium">{p.label}</span>
        <span className="text-muted-foreground text-sm">{p.detail}</span>
      </div>
      <span className="text-primary flex shrink-0 items-center gap-1 text-sm font-medium">
        {p.cta}
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </>
  );

  return p.href.startsWith("#") ? (
    <a href={p.href} className={className}>
      {body}
    </a>
  ) : (
    <Link href={p.href} className={cn(className)}>
      {body}
    </Link>
  );
}
