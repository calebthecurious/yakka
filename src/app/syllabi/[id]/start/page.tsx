import { notFound } from "next/navigation";
import { connection } from "next/server";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Rocket } from "lucide-react";
import { db } from "@/db";
import { requireCurrentUserId } from "@/lib/auth";
import { PageContainer } from "@/components/page-container";
import { GenerateFoundationsButton } from "./generate-foundations-button";
import { StartView } from "./start-view";

type PageProps = { params: Promise<{ id: string }> };

async function loadData(id: string, userId: string) {
  await connection();

  return db.query.syllabi.findFirst({
    where: (s, { and, eq }) => and(eq(s.id, id), eq(s.userId, userId)),
    with: {
      foundationItems: {
        orderBy: (f, { asc }) => [asc(f.sequenceIndex)],
        with: {
          linkedConcept: {
            columns: { id: true, name: true, status: true },
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
  const syllabus = await loadData(id, userId);
  if (!syllabus) return { title: "Syllabus not found — Provency" };
  return { title: `Start here · ${syllabus.targetRole} — Provency` };
}

export default async function StartHerePage({ params }: PageProps) {
  const { id } = await params;
  const userId = await requireCurrentUserId();
  const syllabus = await loadData(id, userId);
  if (!syllabus) notFound();

  const items = syllabus.foundationItems;
  const baselines = items
    .filter((i) => i.type === "assumed_baseline")
    .map((i) => ({
      id: i.id,
      title: i.title,
      description: i.description,
      suggestedResources: i.suggestedResources,
      userStatus: i.userStatus,
      resumeSignal: i.resumeSignal,
    }));
  const launchSteps = items
    .filter((i) => i.type === "launch_step")
    .map((i) => ({
      id: i.id,
      title: i.title,
      description: i.description,
      suggestedResources: i.suggestedResources,
      linkedConcept: i.linkedConcept
        ? {
            id: i.linkedConcept.id,
            name: i.linkedConcept.name,
            status: i.linkedConcept.status,
          }
        : null,
    }));

  const hasFoundations = items.length > 0;

  return (
    <PageContainer width="content" className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <Link
          href={`/syllabi/${id}`}
          className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1.5 text-xs"
        >
          <ArrowLeft className="size-3.5" />
          Back to syllabus
        </Link>
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-full">
            <Rocket className="size-5" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-3xl font-semibold tracking-tight">Start here</h1>
            <p className="text-muted-foreground text-sm">
              {syllabus.targetRole}
              {syllabus.targetCompany ? ` · ${syllabus.targetCompany}` : ""}
            </p>
          </div>
        </div>
        <p className="text-muted-foreground max-w-2xl text-sm">
          Your on-ramp into this syllabus — what it assumes you already know, and
          the exact first steps to take. This is guidance, not a gate: nothing
          here locks the rest of your learning.
        </p>
      </header>

      {hasFoundations ? (
        <StartView baselines={baselines} launchSteps={launchSteps} />
      ) : (
        <EmptyState syllabusId={id} />
      )}

      {hasFoundations ? (
        <footer className="border-border/60 flex items-center justify-between gap-4 border-t pt-6">
          <p className="text-muted-foreground text-xs">
            Foundations out of date? Regenerate to refresh baselines and launch
            steps. Your self-assessments for unchanged baselines are kept.
          </p>
          <GenerateFoundationsButton
            syllabusId={id}
            hasFoundations={hasFoundations}
          />
        </footer>
      ) : null}
    </PageContainer>
  );
}

function EmptyState({ syllabusId }: { syllabusId: string }) {
  return (
    <div className="border-border/60 bg-card flex flex-col items-center gap-4 rounded-lg border border-dashed px-6 py-12 text-center">
      <div className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-full">
        <Rocket className="size-6" />
      </div>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-medium">Build your launching point</h2>
        <p className="text-muted-foreground mx-auto max-w-md text-sm">
          Generate an honest on-ramp for this syllabus: the baselines it assumes
          you already have, and a clear, ordered set of first steps — with the
          very first one spelled out concretely.
        </p>
      </div>
      <GenerateFoundationsButton syllabusId={syllabusId} hasFoundations={false} />
    </div>
  );
}
