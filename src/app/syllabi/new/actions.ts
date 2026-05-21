"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import {
  concepts,
  resources,
  skillClusters,
  subSkills,
  syllabi,
  type SuggestedArtefact,
} from "@/db/schema";
import { generateSyllabus } from "@/lib/ai/generate-syllabus";
import { requireCurrentUserId } from "@/lib/auth";

const FormSchema = z.object({
  targetRole: z.string().trim().min(1, "Target role is required."),
  targetCompany: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  jobDescription: z
    .string()
    .trim()
    .min(50, "Paste the full job description (at least 50 characters)."),
  currentSkills: z
    .string()
    .trim()
    .min(20, "Describe your current skills in a sentence or two."),
});

export type CreateSyllabusState =
  | { status: "idle" }
  | { status: "error"; message: string };

export async function createSyllabus(
  _prevState: CreateSyllabusState,
  formData: FormData,
): Promise<CreateSyllabusState> {
  const userId = await requireCurrentUserId();

  const parsed = FormSchema.safeParse({
    targetRole: formData.get("targetRole"),
    targetCompany: formData.get("targetCompany"),
    jobDescription: formData.get("jobDescription"),
    currentSkills: formData.get("currentSkills"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Invalid form input.",
    };
  }

  const input = parsed.data;

  let syllabusId: string;
  try {
    const generated = await generateSyllabus(input);

    syllabusId = await db.transaction(async (tx) => {
      const [syllabus] = await tx
        .insert(syllabi)
        .values({
          userId,
          targetRole: input.targetRole,
          targetCompany: input.targetCompany ?? null,
          jobDescriptionText: input.jobDescription,
          metadata: {
            structuralBlockers: generated.structuralBlockers,
            alternativeTargetBranches: generated.alternativeTargetBranches,
            currentSkills: input.currentSkills,
          },
        })
        .returning({ id: syllabi.id });

      for (const cluster of generated.clusters) {
        const [insertedCluster] = await tx
          .insert(skillClusters)
          .values({
            syllabusId: syllabus.id,
            name: cluster.name,
            description: cluster.description,
            type: cluster.type,
            orderIndex: cluster.orderIndex,
            weight: cluster.weight,
            suggestedArtefact: cluster.suggestedArtefact satisfies SuggestedArtefact,
          })
          .returning({ id: skillClusters.id });

        for (const skill of cluster.subSkills) {
          const [insertedSubSkill] = await tx
            .insert(subSkills)
            .values({
              clusterId: insertedCluster.id,
              name: skill.name,
              description: skill.description,
              estimatedHours: skill.estimatedHours,
            })
            .returning({ id: subSkills.id });

          for (const concept of skill.concepts) {
            const [insertedConcept] = await tx
              .insert(concepts)
              .values({
                subSkillId: insertedSubSkill.id,
                name: concept.name,
                description: concept.description,
                orderIndex: concept.orderIndex,
              })
              .returning({ id: concepts.id });

            if (concept.suggestedResources.length > 0) {
              await tx.insert(resources).values(
                concept.suggestedResources.map((r) => ({
                  conceptId: insertedConcept.id,
                  type: r.type,
                  title: r.title,
                  url: r.url ?? null,
                  author: r.author ?? null,
                  priority: r.priority,
                  status: "planned" as const,
                })),
              );
            }
          }
        }
      }

      return syllabus.id;
    });
  } catch (err) {
    console.error("[createSyllabus] generation failed", err);
    const message =
      err instanceof Error ? err.message : "Failed to generate syllabus.";
    return { status: "error", message };
  }

  redirect(`/syllabi/${syllabusId}`);
}
