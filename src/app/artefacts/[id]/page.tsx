import { notFound } from "next/navigation";
import { connection } from "next/server";
import Link from "next/link";
import type { Metadata } from "next";
import {
  Award,
  GitPullRequest,
  Hammer,
  ScrollText,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { db } from "@/db";
import { requireCurrentUserId } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { PageContainer } from "@/components/page-container";
import { Separator } from "@/components/ui/separator";
import { ArtefactCoreForm } from "./artefact-core-form";
import { CriteriaEditor } from "./criteria-editor";
import { ProgressLog } from "./progress-log";
import { DemonstratedConcepts } from "./demonstrated-concepts";
import { ArtefactFooter } from "./artefact-footer";

type PageProps = { params: Promise<{ id: string }> };

type ArtefactType = "project" | "writeup" | "certificate" | "contribution";

const TYPE_META: Record<ArtefactType, { label: string; icon: LucideIcon }> = {
  project: { label: "Project", icon: Hammer },
  writeup: { label: "Writeup", icon: ScrollText },
  certificate: { label: "Certificate", icon: Award },
  contribution: { label: "Contribution", icon: GitPullRequest },
};

async function loadArtefact(id: string, userId: string) {
  await connection();

  return db.query.artefacts.findFirst({
    where: (a, { eq }) => eq(a.id, id),
    with: {
      subSkill: {
        with: {
          cluster: {
            with: {
              syllabus: true,
              subSkills: {
                with: { concepts: { orderBy: (c, { asc }) => [asc(c.orderIndex)] } },
              },
            },
          },
        },
      },
    },
  }).then((artefact) =>
    artefact?.subSkill.cluster.syllabus.userId === userId ? artefact : null,
  );
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const userId = await requireCurrentUserId();
  const artefact = await loadArtefact(id, userId);
  if (!artefact) return { title: "Artefact not found — Provency" };
  return { title: `${artefact.title} — Provency` };
}

export default async function ArtefactPage({ params }: PageProps) {
  const { id } = await params;
  const userId = await requireCurrentUserId();
  const artefact = await loadArtefact(id, userId);
  if (!artefact) notFound();

  const subSkill = artefact.subSkill;
  const cluster = subSkill.cluster;
  const syllabus = cluster.syllabus;

  const conceptsInCluster = cluster.subSkills.flatMap((s) =>
    s.concepts.map((c) => ({
      id: c.id,
      name: c.name,
      subSkillName: s.name,
      status: c.status,
    })),
  );

  const meta = TYPE_META[artefact.type as ArtefactType];
  const Icon = meta.icon;
  const verified = artefact.verifiedAt !== null;
  const criteriaDone = artefact.acceptanceCriteria.filter((c) => c.done).length;
  const criteriaTotal = artefact.acceptanceCriteria.length;

  return (
    <PageContainer width="content" className="flex flex-col gap-8">
      <nav className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
        <Link
          href={`/syllabi/${syllabus.id}`}
          className="hover:text-foreground underline-offset-4 hover:underline"
        >
          {syllabus.targetRole}
        </Link>
        <span>/</span>
        <span className="hover:text-foreground">{cluster.name}</span>
        <span>/</span>
        <span>{subSkill.name}</span>
        <span>/</span>
        <span className="text-foreground">{artefact.title}</span>
      </nav>

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1.5 text-xs">
            <Icon className="size-3" />
            {meta.label}
          </Badge>
          {verified ? (
            <Badge
              variant="outline"
              className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-200"
            >
              <ShieldCheck className="size-3" />
              Verified
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="text-muted-foreground text-xs"
            >
              Not yet verified
            </Badge>
          )}
          {criteriaTotal > 0 ? (
            <span className="text-muted-foreground text-xs">
              {criteriaDone} / {criteriaTotal} criteria done
            </span>
          ) : null}
        </div>
        <h1 className="text-3xl font-semibold leading-tight tracking-tight">
          {artefact.title}
        </h1>
      </header>

      <ArtefactCoreForm
        artefactId={artefact.id}
        type={artefact.type as ArtefactType}
        title={artefact.title}
        description={artefact.description}
        url={artefact.url}
        evidenceUrl={artefact.evidenceUrl}
        reflection={artefact.reflection}
      />

      <Separator />

      <section className="flex flex-col gap-3">
        <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
          Acceptance criteria
        </h2>
        <CriteriaEditor
          artefactId={artefact.id}
          initialCriteria={artefact.acceptanceCriteria}
        />
      </section>

      <Separator />

      <section className="flex flex-col gap-3">
        <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
          Progress log
        </h2>
        <ProgressLog
          artefactId={artefact.id}
          entries={artefact.progressLog}
        />
      </section>

      <Separator />

      <section className="flex flex-col gap-3">
        <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
          Skills demonstrated
        </h2>
        <p className="text-muted-foreground text-xs">
          Pick the concepts in this cluster this artefact demonstrates
          understanding of.
        </p>
        <DemonstratedConcepts
          artefactId={artefact.id}
          conceptsInCluster={conceptsInCluster}
          selectedIds={artefact.demonstratedConceptIds}
        />
      </section>

      <Separator />

      <ArtefactFooter
        artefactId={artefact.id}
        verified={verified}
        title={artefact.title}
      />
    </PageContainer>
  );
}
