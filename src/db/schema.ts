import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

export const subSkillStatusEnum = pgEnum("sub_skill_status", [
  "not_started",
  "in_progress",
  "verified",
]);

export const skillClusterType = pgEnum("skill_cluster_type", [
  "technical",
  "domain",
  "soft",
  "meta",
]);

export const conceptStatus = pgEnum("concept_status", [
  "not_started",
  "learning",
  "understood",
  "verified",
]);

export const resourceType = pgEnum("resource_type", [
  "course",
  "book",
  "video",
  "article",
  "project",
  "paper",
]);

export const resourceStatus = pgEnum("resource_status", [
  "planned",
  "consuming",
  "completed",
  "abandoned",
]);

export const artefactType = pgEnum("artefact_type", [
  "project",
  "writeup",
  "certificate",
  "contribution",
]);

export type SyllabusAlternativeTargetBranch = {
  role: string;
  rationale: string;
  tradeoffs: string;
};

export type SyllabusMetadata = {
  structuralBlockers: string[];
  alternativeTargetBranches: SyllabusAlternativeTargetBranch[];
  currentSkills: string;
};

export const syllabi = pgTable(
  "syllabi",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    targetRole: text("target_role").notNull(),
    targetCompany: text("target_company"),
    jobDescriptionText: text("job_description_text").notNull(),
    metadata: jsonb("metadata")
      .$type<SyllabusMetadata>()
      .notNull()
      .default(
        sql`'{"structuralBlockers":[],"alternativeTargetBranches":[],"currentSkills":""}'::jsonb`,
      ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("syllabi_user_id_idx").on(t.userId)],
);

export type SuggestedArtefact = {
  type: "project" | "writeup" | "certificate" | "contribution";
  title: string;
  description: string;
  acceptanceCriteria: string[];
};

export type ArtefactCriterion = {
  text: string;
  done: boolean;
};

export type ArtefactProgressEntry = {
  at: string;
  note: string;
};

export const skillClusters = pgTable(
  "skill_clusters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    syllabusId: uuid("syllabus_id")
      .notNull()
      .references(() => syllabi.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull(),
    orderIndex: integer("order_index").notNull().default(0),
    weight: integer("weight").notNull().default(3),
    type: skillClusterType("type").notNull().default("technical"),
    suggestedArtefact: jsonb("suggested_artefact").$type<SuggestedArtefact | null>(),
  },
  (t) => [index("skill_clusters_syllabus_id_idx").on(t.syllabusId)],
);

export const subSkills = pgTable(
  "sub_skills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clusterId: uuid("cluster_id")
      .notNull()
      .references(() => skillClusters.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull(),
    estimatedHours: integer("estimated_hours").notNull().default(0),
    subSkillStatus: subSkillStatusEnum("sub_skill_status")
      .notNull()
      .default("not_started"),
  },
  (t) => [index("sub_skills_cluster_id_idx").on(t.clusterId)],
);

export const concepts = pgTable(
  "concepts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subSkillId: uuid("sub_skill_id")
      .notNull()
      .references(() => subSkills.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull(),
    orderIndex: integer("order_index").notNull().default(0),
    status: conceptStatus("status").notNull().default("not_started"),
    understoodAt: timestamp("understood_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("concepts_sub_skill_id_idx").on(t.subSkillId)],
);

export const resources = pgTable(
  "resources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conceptId: uuid("concept_id")
      .notNull()
      .references(() => concepts.id, { onDelete: "cascade" }),
    type: resourceType("type").notNull(),
    title: text("title").notNull(),
    url: text("url"),
    author: text("author"),
    status: resourceStatus("status").notNull().default("planned"),
    notes: text("notes"),
    priority: integer("priority").notNull().default(1),
    addedByUser: boolean("added_by_user").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("resources_concept_id_idx").on(t.conceptId)],
);

export const learningSessions = pgTable(
  "learning_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conceptId: uuid("concept_id")
      .notNull()
      .references(() => concepts.id, { onDelete: "cascade" }),
    durationMinutes: integer("duration_minutes").notNull(),
    notesMarkdown: text("notes_markdown").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("learning_sessions_concept_id_idx").on(t.conceptId),
    index("learning_sessions_created_at_idx").on(t.createdAt),
  ],
);

export const retentionCards = pgTable(
  "retention_cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conceptId: uuid("concept_id")
      .notNull()
      .references(() => concepts.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    fsrsState: jsonb("fsrs_state")
      .notNull()
      .default(sql`'{}'::jsonb`),
    nextReviewAt: timestamp("next_review_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
  },
  (t) => [
    index("retention_cards_concept_id_idx").on(t.conceptId),
    index("retention_cards_next_review_at_idx").on(t.nextReviewAt),
  ],
);

export const artefacts = pgTable(
  "artefacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subSkillId: uuid("sub_skill_id")
      .notNull()
      .references(() => subSkills.id, { onDelete: "cascade" }),
    type: artefactType("type").notNull(),
    title: text("title").notNull(),
    url: text("url"),
    evidenceUrl: text("evidence_url"),
    description: text("description").notNull().default(""),
    reflection: text("reflection").notNull().default(""),
    acceptanceCriteria: jsonb("acceptance_criteria")
      .$type<ArtefactCriterion[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    progressLog: jsonb("progress_log")
      .$type<ArtefactProgressEntry[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    demonstratedConceptIds: jsonb("demonstrated_concept_ids")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("artefacts_sub_skill_id_idx").on(t.subSkillId)],
);

export const syllabiRelations = relations(syllabi, ({ many }) => ({
  clusters: many(skillClusters),
}));

export const skillClustersRelations = relations(skillClusters, ({ one, many }) => ({
  syllabus: one(syllabi, {
    fields: [skillClusters.syllabusId],
    references: [syllabi.id],
  }),
  subSkills: many(subSkills),
}));

export const subSkillsRelations = relations(subSkills, ({ one, many }) => ({
  cluster: one(skillClusters, {
    fields: [subSkills.clusterId],
    references: [skillClusters.id],
  }),
  concepts: many(concepts),
  artefacts: many(artefacts),
}));

export const conceptsRelations = relations(concepts, ({ one, many }) => ({
  subSkill: one(subSkills, {
    fields: [concepts.subSkillId],
    references: [subSkills.id],
  }),
  resources: many(resources),
  learningSessions: many(learningSessions),
  retentionCards: many(retentionCards),
}));

export const resourcesRelations = relations(resources, ({ one }) => ({
  concept: one(concepts, {
    fields: [resources.conceptId],
    references: [concepts.id],
  }),
}));

export const learningSessionsRelations = relations(learningSessions, ({ one }) => ({
  concept: one(concepts, {
    fields: [learningSessions.conceptId],
    references: [concepts.id],
  }),
}));

export const retentionCardsRelations = relations(retentionCards, ({ one }) => ({
  concept: one(concepts, {
    fields: [retentionCards.conceptId],
    references: [concepts.id],
  }),
}));

export const artefactsRelations = relations(artefacts, ({ one }) => ({
  subSkill: one(subSkills, {
    fields: [artefacts.subSkillId],
    references: [subSkills.id],
  }),
}));

export type Syllabus = typeof syllabi.$inferSelect;
export type NewSyllabus = typeof syllabi.$inferInsert;
export type SkillCluster = typeof skillClusters.$inferSelect;
export type NewSkillCluster = typeof skillClusters.$inferInsert;
export type SubSkill = typeof subSkills.$inferSelect;
export type NewSubSkill = typeof subSkills.$inferInsert;
export type Concept = typeof concepts.$inferSelect;
export type NewConcept = typeof concepts.$inferInsert;
export type Resource = typeof resources.$inferSelect;
export type NewResource = typeof resources.$inferInsert;
export type LearningSession = typeof learningSessions.$inferSelect;
export type NewLearningSession = typeof learningSessions.$inferInsert;
export type RetentionCard = typeof retentionCards.$inferSelect;
export type NewRetentionCard = typeof retentionCards.$inferInsert;
export type Artefact = typeof artefacts.$inferSelect;
export type NewArtefact = typeof artefacts.$inferInsert;
