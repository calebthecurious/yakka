"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { gapReports } from "@/db/schema";
import { DEFAULT_MODEL } from "@/lib/ai/client";
import {
  generateGapReport as generateGapReportAi,
  type GapReportClusterNode,
} from "@/lib/ai/generate-gap-report";
import { requireCurrentUserId } from "@/lib/auth";
import { requireOwnedSyllabus } from "@/lib/ownership";

const InputSchema = z.object({ syllabusId: z.string().uuid() });

type GenerateGapReportResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Generate (or regenerate) the gap report for a syllabus. Fetches the resume
 * text and full syllabus tree, runs the AI gap analysis, upserts the single
 * per-syllabus report, and revalidates the detail page.
 */
export async function generateGapReport(
  syllabusId: string,
): Promise<GenerateGapReportResult> {
  const parsed = InputSchema.safeParse({ syllabusId });
  if (!parsed.success) {
    return { ok: false, message: "Invalid syllabus id." };
  }

  try {
    const userId = await requireCurrentUserId();
    await requireOwnedSyllabus(parsed.data.syllabusId, userId);

    const syllabus = await db.query.syllabi.findFirst({
      where: (s, { and, eq }) =>
        and(eq(s.id, parsed.data.syllabusId), eq(s.userId, userId)),
      with: {
        clusters: {
          orderBy: (c, { asc }) => [asc(c.orderIndex)],
          with: {
            subSkills: {
              with: {
                concepts: {
                  orderBy: (c, { asc }) => [asc(c.orderIndex)],
                  columns: { id: true, name: true, status: true },
                },
              },
            },
          },
        },
      },
    });

    if (!syllabus) {
      return { ok: false, message: "Syllabus not found." };
    }

    const resumeText = syllabus.metadata.currentSkills ?? "";

    // Build the tree the AI sees, and the set of real concept ids so we can
    // reject any conceptId the model invents.
    const knownConceptIds = new Set<string>();
    const syllabusTree: GapReportClusterNode[] = syllabus.clusters.map(
      (cluster) => ({
        name: cluster.name,
        type: cluster.type,
        description: cluster.description,
        subSkills: cluster.subSkills.map((sub) => ({
          name: sub.name,
          status: sub.subSkillStatus,
          concepts: sub.concepts.map((concept) => {
            knownConceptIds.add(concept.id);
            return {
              id: concept.id,
              name: concept.name,
              status: concept.status,
            };
          }),
        })),
      }),
    );

    const report = await generateGapReportAi({
      resumeText,
      targetRole: syllabus.targetRole,
      targetCompany: syllabus.targetCompany,
      jobDescription: syllabus.jobDescriptionText,
      syllabusTree,
    });

    // Defend against hallucinated concept ids: anything not in the real tree
    // becomes null so the UI never links to a non-existent concept.
    const sanitizeId = (id: string | null): string | null =>
      id && knownConceptIds.has(id) ? id : null;

    const payload = {
      strengths: report.strengths,
      gapsInProgress: report.gapsInProgress.map((g) => ({
        ...g,
        conceptId: sanitizeId(g.conceptId),
      })),
      gapsNotStarted: report.gapsNotStarted.map((g) => ({
        ...g,
        conceptId: sanitizeId(g.conceptId),
      })),
      softSkillGaps: report.softSkillGaps.map((g) => ({
        ...g,
        conceptId: sanitizeId(g.conceptId),
      })),
      signalRecommendations: report.signalRecommendations,
      generatedAt: new Date(),
      model: DEFAULT_MODEL,
    };

    await db
      .insert(gapReports)
      .values({ syllabusId: parsed.data.syllabusId, ...payload })
      .onConflictDoUpdate({ target: gapReports.syllabusId, set: payload });

    revalidatePath(`/syllabi/${parsed.data.syllabusId}`);
    return { ok: true };
  } catch (err) {
    console.error("[generateGapReport] failed", err);
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Gap analysis failed.",
    };
  }
}
