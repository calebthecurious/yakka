"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  concepts,
  resources,
  skillClusters,
  subSkills,
  syllabi,
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
          roleNature: generated.roleNature,
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
            isArtefactBearing: cluster.isArtefactBearing,
            suggestedArtefact: cluster.suggestedArtefact,
            // demonstratesConceptIds resolved below, once concept IDs exist.
            artefactTarget: cluster.artefactTarget
              ? {
                  title: cluster.artefactTarget.title,
                  description: cluster.artefactTarget.description,
                  employerValue: cluster.artefactTarget.employerValue,
                  demonstratesConceptIds: [],
                }
              : null,
          })
          .returning({ id: skillClusters.id });

        // Concept name → DB id, for resolving the artefactTarget's demonstrated
        // concepts. Names are unique within a cluster; match case-insensitively.
        const conceptNameToId = new Map<string, string>();

        for (const skill of cluster.subSkills) {
          const [insertedSubSkill] = await tx
            .insert(subSkills)
            .values({
              clusterId: insertedCluster.id,
              name: skill.name,
              description: skill.description,
              orderIndex: skill.orderIndex,
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
                tier: concept.tier,
              })
              .returning({ id: concepts.id });

            conceptNameToId.set(
              concept.name.trim().toLowerCase(),
              insertedConcept.id,
            );

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

        // Resolve the artefactTarget's demonstrated concept NAMES to real IDs.
        // Names that don't match a concept in this cluster are dropped (the
        // model is told to copy verbatim, but we never persist a dangling id).
        // Backstop: if the model appended a tier tag like " (foundation)", strip
        // it and retry, so a stray annotation doesn't lose the whole link.
        if (cluster.artefactTarget) {
          const stripTier = (s: string) =>
            s.replace(/\s*\((?:foundation|intermediate|advanced)\)\s*$/i, "");
          const resolve = (name: string) => {
            const norm = name.trim().toLowerCase();
            return (
              conceptNameToId.get(norm) ??
              conceptNameToId.get(stripTier(norm).trim())
            );
          };
          const demonstratesConceptIds = cluster.artefactTarget.demonstratesConcepts
            .map((name) => resolve(name))
            .filter((id): id is string => Boolean(id));

          await tx
            .update(skillClusters)
            .set({
              artefactTarget: {
                title: cluster.artefactTarget.title,
                description: cluster.artefactTarget.description,
                employerValue: cluster.artefactTarget.employerValue,
                demonstratesConceptIds,
              },
            })
            .where(eq(skillClusters.id, insertedCluster.id));
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
