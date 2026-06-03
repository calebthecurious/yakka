"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { skillClusters, type ProjectResource } from "@/db/schema";
import { generateProject } from "@/lib/ai/generate-project";
import { requireCurrentUserId } from "@/lib/auth";
import { getProfilePathForUser, requireOwnedCluster } from "@/lib/ownership";

const Input = z.object({ clusterId: z.string().uuid() });

/** Only http(s) URLs reach an href on the project page — drop anything else
 * (and the model's nulls/blanks) to null, mirroring src/lib/url.ts. */
function safeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

const stripTier = (s: string) =>
  s.replace(/\s*\((?:foundation|intermediate|advanced)\)\s*$/i, "");

export async function generateClusterProject(input: {
  clusterId: string;
}): Promise<{ ok: boolean; message?: string }> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid input." };

  try {
    const userId = await requireCurrentUserId();
    await requireOwnedCluster(parsed.data.clusterId, userId);

    // Re-fetch with concepts (ownership already verified above).
    const cluster = await db.query.skillClusters.findFirst({
      where: (c, { eq: eqf }) => eqf(c.id, parsed.data.clusterId),
      with: {
        syllabus: {
          columns: {
            id: true,
            targetRole: true,
            targetCompany: true,
            jobDescriptionText: true,
          },
        },
        subSkills: {
          with: {
            concepts: { columns: { id: true, name: true, description: true } },
          },
        },
      },
    });
    if (!cluster) return { ok: false, message: "Cluster not found." };

    const concepts = cluster.subSkills.flatMap((s) => s.concepts);
    if (concepts.length === 0) {
      return { ok: false, message: "Cluster has no concepts to build from yet." };
    }

    const generated = await generateProject({
      targetRole: cluster.syllabus.targetRole,
      targetCompany: cluster.syllabus.targetCompany ?? undefined,
      jobDescription: cluster.syllabus.jobDescriptionText,
      clusterName: cluster.name,
      clusterDescription: cluster.description,
      employerValue: cluster.artefactTarget?.employerValue,
      existingArtefact: cluster.suggestedArtefact
        ? {
            type: cluster.suggestedArtefact.type,
            title: cluster.suggestedArtefact.title,
            description: cluster.suggestedArtefact.description,
          }
        : null,
      concepts: concepts.map((c) => ({ name: c.name, description: c.description })),
    });

    // Resolve demonstrated concept NAMES → real IDs (tier-tag tolerant).
    const nameToId = new Map<string, string>(
      concepts.map((c) => [c.name.trim().toLowerCase(), c.id]),
    );
    const resolve = (name: string) => {
      const norm = name.trim().toLowerCase();
      return nameToId.get(norm) ?? nameToId.get(stripTier(norm).trim());
    };
    const demonstratesConceptIds = generated.demonstratesConcepts
      .map(resolve)
      .filter((id): id is string => Boolean(id));

    const projectResources: ProjectResource[] = generated.projectResources.map(
      (r) => ({ title: r.title, url: safeUrl(r.url), why: r.why }),
    );

    await db
      .update(skillClusters)
      .set({
        // Generating a project makes this cluster artefact-bearing by definition.
        isArtefactBearing: true,
        suggestedArtefact: {
          type: generated.type,
          title: generated.title,
          description: generated.description,
          acceptanceCriteria: generated.acceptanceCriteria,
        },
        artefactTarget: {
          title: generated.title,
          description: generated.description,
          employerValue: generated.employerValue,
          demonstratesConceptIds,
        },
        startingPoint: generated.startingPoint,
        suggestedApproach: generated.suggestedApproach,
        criteriaGuidance: generated.criteriaGuidance,
        projectResources,
      })
      .where(eq(skillClusters.id, parsed.data.clusterId));

    revalidatePath(`/clusters/${parsed.data.clusterId}/artefact`);
    revalidatePath(`/syllabi/${cluster.syllabus.id}`);
    revalidatePath(await getProfilePathForUser(userId));
    return { ok: true };
  } catch (err) {
    console.error("[generateClusterProject] failed", err);
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Generation failed.",
    };
  }
}
