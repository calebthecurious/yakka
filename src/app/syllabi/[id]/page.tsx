import { notFound } from "next/navigation";
import { connection } from "next/server";
import Link from "next/link";
import type { Metadata } from "next";
import { format } from "date-fns";
import { Telescope } from "lucide-react";
import { db } from "@/db";
import { requireCurrentUserId } from "@/lib/auth";
import { buttonVariants } from "@/components/ui/button";
import { BlockersCard } from "./blockers-card";
import { SyllabusTree } from "./syllabus-tree";
import { DeleteSyllabusButton } from "./delete-syllabus-button";

type PageProps = { params: Promise<{ id: string }> };

async function loadSyllabus(id: string, userId: string) {
  await connection();

  return db.query.syllabi.findFirst({
    where: (s, { and, eq }) => and(eq(s.id, id), eq(s.userId, userId)),
    with: {
      clusters: {
        orderBy: (c, { asc }) => [asc(c.orderIndex)],
        with: {
          subSkills: {
            with: {
              concepts: {
                orderBy: (c, { asc }) => [asc(c.orderIndex)],
                with: {
                  resources: true,
                },
              },
              artefacts: {
                orderBy: (a, { desc }) => [desc(a.createdAt)],
              },
            },
          },
        },
      },
    },
  });
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const userId = await requireCurrentUserId();
  const syllabus = await loadSyllabus(id, userId);
  if (!syllabus) return { title: "Syllabus not found — Provency" };
  return { title: `${syllabus.targetRole} — Provency` };
}

export default async function SyllabusPage({ params }: PageProps) {
  const { id } = await params;
  const userId = await requireCurrentUserId();
  const syllabus = await loadSyllabus(id, userId);
  if (!syllabus) notFound();

  const { metadata, clusters } = syllabus;

  const allConcepts = clusters.flatMap((c) =>
    c.subSkills.flatMap((s) => s.concepts),
  );
  const understoodCount = allConcepts.filter(
    (c) => c.status === "understood" || c.status === "verified",
  ).length;
  const totalHours = clusters.reduce(
    (sum, c) =>
      sum + c.subSkills.reduce((s, sk) => s + sk.estimatedHours, 0),
    0,
  );

  const treeData = clusters.map((cluster) => ({
    id: cluster.id,
    name: cluster.name,
    description: cluster.description,
    type: cluster.type,
    weight: cluster.weight,
    suggestedArtefact: cluster.suggestedArtefact,
    subSkills: cluster.subSkills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      estimatedHours: skill.estimatedHours,
      concepts: skill.concepts.map((concept) => ({
        id: concept.id,
        name: concept.name,
        status: concept.status,
        resourceCount: concept.resources.length,
      })),
    })),
    artefacts: cluster.subSkills.flatMap((skill) =>
      skill.artefacts.map((a) => ({
        id: a.id,
        type: a.type,
        title: a.title,
        url: a.url,
        description: a.description,
        reflection: a.reflection,
        verified: a.verifiedAt !== null,
        subSkillId: skill.id,
        subSkillName: skill.name,
      })),
    ),
  }));

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-col gap-3">
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <Link href="/syllabi" className="hover:text-foreground">
            ← All syllabi
          </Link>
          <span>·</span>
          <Link href="/syllabi/new" className="hover:text-foreground">
            New syllabus
          </Link>
          <span>·</span>
          <span>
            Generated {format(syllabus.createdAt, "d MMM yyyy, HH:mm")}
          </span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {syllabus.targetRole}
          {syllabus.targetCompany ? (
            <span className="text-muted-foreground font-normal">
              {" "}
              · {syllabus.targetCompany}
            </span>
          ) : null}
        </h1>
        <p className="text-muted-foreground text-sm">
          {clusters.length} clusters ·{" "}
          {clusters.reduce((s, c) => s + c.subSkills.length, 0)} sub-skills ·{" "}
          {allConcepts.length} concepts ({understoodCount} understood) · ~
          {totalHours}h estimated
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/syllabi/${syllabus.id}/gap`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Telescope className="size-4" />
            View gap analysis
          </Link>
        </div>
      </header>

      <BlockersCard
        blockers={metadata.structuralBlockers}
        branches={metadata.alternativeTargetBranches}
      />

      <SyllabusTree syllabusId={syllabus.id} clusters={treeData} />

      <footer className="border-border/60 mt-8 flex items-center justify-end border-t pt-6">
        <DeleteSyllabusButton
          syllabusId={syllabus.id}
          targetRole={syllabus.targetRole}
        />
      </footer>
    </main>
  );
}
