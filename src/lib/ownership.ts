import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";

export async function getProfilePathForUser(userId: string): Promise<string> {
  const [profile] = await db
    .select({ handle: profiles.handle })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);

  return profile?.handle ? `/u/${profile.handle}` : "/profile/setup";
}

export async function requireOwnedSyllabus(
  syllabusId: string,
  userId: string,
): Promise<void> {
  const row = await db.query.syllabi.findFirst({
    where: (s, { and, eq }) => and(eq(s.id, syllabusId), eq(s.userId, userId)),
    columns: { id: true },
  });

  if (!row) throw new Error("Not found.");
}

export async function requireOwnedCluster(clusterId: string, userId: string) {
  const cluster = await db.query.skillClusters.findFirst({
    where: (c, { eq }) => eq(c.id, clusterId),
    with: {
      syllabus: true,
      subSkills: true,
    },
  });

  if (!cluster || cluster.syllabus.userId !== userId) {
    throw new Error("Not found.");
  }

  return cluster;
}

export async function requireOwnedSubSkill(
  subSkillId: string,
  userId: string,
): Promise<void> {
  const subSkill = await db.query.subSkills.findFirst({
    where: (s, { eq }) => eq(s.id, subSkillId),
    with: { cluster: { with: { syllabus: true } } },
  });

  if (!subSkill || subSkill.cluster.syllabus.userId !== userId) {
    throw new Error("Not found.");
  }
}

export async function requireOwnedConcept(conceptId: string, userId: string) {
  const concept = await db.query.concepts.findFirst({
    where: (c, { eq }) => eq(c.id, conceptId),
    with: {
      subSkill: {
        with: { cluster: { with: { syllabus: true } } },
      },
    },
  });

  if (!concept || concept.subSkill.cluster.syllabus.userId !== userId) {
    throw new Error("Not found.");
  }

  return concept;
}

export async function requireOwnedResource(resourceId: string, userId: string) {
  const resource = await db.query.resources.findFirst({
    where: (r, { eq }) => eq(r.id, resourceId),
    with: {
      concept: {
        with: {
          subSkill: {
            with: { cluster: { with: { syllabus: true } } },
          },
        },
      },
    },
  });

  if (!resource || resource.concept.subSkill.cluster.syllabus.userId !== userId) {
    throw new Error("Not found.");
  }

  return resource;
}

export async function requireOwnedLearningSession(
  sessionId: string,
  userId: string,
): Promise<void> {
  const session = await db.query.learningSessions.findFirst({
    where: (s, { eq }) => eq(s.id, sessionId),
    with: {
      concept: {
        with: {
          subSkill: {
            with: { cluster: { with: { syllabus: true } } },
          },
        },
      },
    },
  });

  if (!session || session.concept.subSkill.cluster.syllabus.userId !== userId) {
    throw new Error("Not found.");
  }
}

export async function requireOwnedArtefact(artefactId: string, userId: string) {
  const artefact = await db.query.artefacts.findFirst({
    where: (a, { eq }) => eq(a.id, artefactId),
    with: {
      subSkill: {
        with: { cluster: { with: { syllabus: true } } },
      },
    },
  });

  if (!artefact || artefact.subSkill.cluster.syllabus.userId !== userId) {
    throw new Error("Not found.");
  }

  return artefact;
}
