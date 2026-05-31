"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { companyInsights } from "@/db/schema";
import {
  generateCompanyInsight as generateCompanyInsightAi,
} from "@/lib/ai/generate-company-insight";
import { requireCurrentUserId } from "@/lib/auth";
import { requireOwnedSyllabus } from "@/lib/ownership";

const InputSchema = z.object({ syllabusId: z.string().uuid() });

type GenerateCompanyInsightResult = { ok: true } | { ok: false; message: string };

/**
 * Generate (or regenerate) the company insight for a syllabus. Researches the
 * target company against PUBLIC sources via Live Search, structures the
 * findings, drops anything not backed by a retrieved source, and upserts the
 * single per-syllabus row.
 */
export async function generateCompanyInsight(
  syllabusId: string,
): Promise<GenerateCompanyInsightResult> {
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
          columns: { name: true },
          with: {
            subSkills: {
              columns: { name: true },
              with: {
                concepts: {
                  orderBy: (c, { asc }) => [asc(c.orderIndex)],
                  columns: { name: true },
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

    const companyName = syllabus.targetCompany?.trim();
    if (!companyName) {
      return {
        ok: false,
        message:
          "This syllabus has no target company. Add one to generate a company insight.",
      };
    }

    // A compact outline so alignmentNotes can point at real clusters/concepts.
    const syllabusOutline = syllabus.clusters
      .map((cluster) => {
        const concepts = cluster.subSkills
          .flatMap((sub) => sub.concepts.map((c) => c.name))
          .slice(0, 12);
        return `- ${cluster.name}${concepts.length ? `: ${concepts.join(", ")}` : ""}`;
      })
      .join("\n");

    const { insight, model } = await generateCompanyInsightAi({
      companyName,
      targetRole: syllabus.targetRole,
      jobDescription: syllabus.jobDescriptionText,
      syllabusOutline,
    });

    const payload = {
      verifiedFacts: insight.verifiedFacts,
      likelyInferences: insight.likelyInferences,
      techSignals: insight.techSignals,
      alignmentNotes: insight.alignmentNotes,
      generatedAt: new Date(),
      model,
    };

    await db
      .insert(companyInsights)
      .values({ syllabusId: parsed.data.syllabusId, ...payload })
      .onConflictDoUpdate({
        target: companyInsights.syllabusId,
        set: payload,
      });

    revalidatePath(`/syllabi/${parsed.data.syllabusId}/company`);
    revalidatePath(`/syllabi/${parsed.data.syllabusId}`);
    return { ok: true };
  } catch (err) {
    console.error("[generateCompanyInsight] failed", err);
    return {
      ok: false,
      message:
        err instanceof Error ? err.message : "Company insight generation failed.",
    };
  }
}
