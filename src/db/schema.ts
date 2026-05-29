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
  unique,
  pgSchema,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

export const authSchema = pgSchema("auth");

export const authUsers = authSchema.table("users", {
  id: uuid("id").primaryKey(),
});

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

/**
 * Whether the TARGET ROLE is primarily about building/engineering ('technical'),
 * about people/strategy/communication/operations ('non_technical'), or a
 * substantial mix of both ('hybrid'). Classified by the generator from the JD;
 * it shapes the cluster mix and drives the role badge on the syllabus header.
 */
export const roleNatureEnum = pgEnum("role_nature", [
  "technical",
  "non_technical",
  "hybrid",
]);

export const conceptStatus = pgEnum("concept_status", [
  "not_started",
  "learning",
  "understood",
  "verified",
]);

export const conceptTier = pgEnum("concept_tier", [
  "foundation",
  "intermediate",
  "advanced",
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

export const aiConfidenceEnum = pgEnum("ai_confidence", ["high", "low"]);

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

export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id")
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    handle: text("handle").unique(),
    displayName: text("display_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("profiles_handle_idx").on(t.handle)],
);

export const syllabi = pgTable(
  "syllabi",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => authUsers.id, {
      onDelete: "cascade",
    }),
    targetRole: text("target_role").notNull(),
    targetCompany: text("target_company"),
    roleNature: roleNatureEnum("role_nature").notNull().default("technical"),
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
    orderIndex: integer("order_index").notNull().default(0),
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
    tier: conceptTier("tier").notNull().default("intermediate"),
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

export type StudyBriefLocation = { label: string; detail: string };
export type StudyBriefCheckQuestion = { question: string; answer: string };

export const studyBriefs = pgTable(
  "study_briefs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resources.id, { onDelete: "cascade" }),
    conceptId: uuid("concept_id")
      .notNull()
      .references(() => concepts.id, { onDelete: "cascade" }),
    keyPoints: jsonb("key_points")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    application: text("application").notNull().default(""),
    locations: jsonb("locations")
      .$type<StudyBriefLocation[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    checkQuestions: jsonb("check_questions")
      .$type<StudyBriefCheckQuestion[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    aiConfidence: aiConfidenceEnum("ai_confidence").notNull().default("high"),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    model: text("model").notNull(),
  },
  (t) => [
    index("study_briefs_resource_id_idx").on(t.resourceId),
    index("study_briefs_concept_id_idx").on(t.conceptId),
    unique("study_briefs_resource_concept_unq").on(t.resourceId, t.conceptId),
  ],
);

export type CompetencyQuestion = {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

export const competencyChecks = pgTable(
  "competency_checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conceptId: uuid("concept_id")
      .notNull()
      .references(() => concepts.id, { onDelete: "cascade" }),
    questions: jsonb("questions")
      .$type<CompetencyQuestion[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    score: integer("score"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("competency_checks_concept_id_idx").on(t.conceptId)],
);

export type ExpansionPrinciple = { name: string; explanation: string };
export type ExpansionKeyTerm = { term: string; definition: string };
export type ExpansionMisunderstanding = {
  misconception: string;
  correction: string;
};

export const conceptExpansions = pgTable(
  "concept_expansions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conceptId: uuid("concept_id")
      .notNull()
      .references(() => concepts.id, { onDelete: "cascade" }),
    definition: text("definition").notNull(),
    principles: jsonb("principles")
      .$type<ExpansionPrinciple[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    keyTerms: jsonb("key_terms")
      .$type<ExpansionKeyTerm[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    prerequisiteConceptIds: jsonb("prerequisite_concept_ids")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    buildsOnConceptIds: jsonb("builds_on_concept_ids")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    commonMisunderstandings: jsonb("common_misunderstandings")
      .$type<ExpansionMisunderstanding[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    relationshipMapMermaid: text("relationship_map_mermaid"),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    model: text("model").notNull(),
  },
  (t) => [
    index("concept_expansions_concept_id_idx").on(t.conceptId),
    unique("concept_expansions_concept_id_unq").on(t.conceptId),
  ],
);

export const conceptImportance = pgEnum("concept_importance", [
  "core",
  "supporting",
  "peripheral",
]);

export const conceptRelevances = pgTable(
  "concept_relevances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conceptId: uuid("concept_id")
      .notNull()
      .references(() => concepts.id, { onDelete: "cascade" }),
    point: text("point").notNull(),
    explanation: text("explanation").notNull(),
    evidence: text("evidence").notNull(),
    effect: text("effect").notNull(),
    importance: conceptImportance("importance").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    model: text("model").notNull(),
  },
  (t) => [
    index("concept_relevances_concept_id_idx").on(t.conceptId),
    unique("concept_relevances_concept_id_unq").on(t.conceptId),
  ],
);

export type GapStrength = { requirement: string; evidence: string };

export type GapInProgress = {
  requirement: string;
  conceptId: string | null;
  note: string;
};

export type GapNotStarted = {
  requirement: string;
  conceptId: string | null;
  isSyllabusBlindSpot: boolean;
  note: string;
};

export type SoftSkillGap = {
  skill: string;
  why: string;
  conceptId: string | null;
};

export type SignalRecommendation = {
  action: string;
  rationale: string;
  effort: "low" | "medium" | "high";
};

export const gapReports = pgTable(
  "gap_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    syllabusId: uuid("syllabus_id")
      .notNull()
      .references(() => syllabi.id, { onDelete: "cascade" }),
    strengths: jsonb("strengths")
      .$type<GapStrength[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    gapsInProgress: jsonb("gaps_in_progress")
      .$type<GapInProgress[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    gapsNotStarted: jsonb("gaps_not_started")
      .$type<GapNotStarted[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    softSkillGaps: jsonb("soft_skill_gaps")
      .$type<SoftSkillGap[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    signalRecommendations: jsonb("signal_recommendations")
      .$type<SignalRecommendation[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    model: text("model").notNull(),
  },
  (t) => [
    index("gap_reports_syllabus_id_idx").on(t.syllabusId),
    unique("gap_reports_syllabus_id_unq").on(t.syllabusId),
  ],
);

export const syllabiRelations = relations(syllabi, ({ one, many }) => ({
  clusters: many(skillClusters),
  gapReport: one(gapReports),
}));

export const profilesRelations = relations(profiles, ({ many }) => ({
  syllabi: many(syllabi),
}));

export const usersRelations = relations(authUsers, ({ one, many }) => ({
  profile: one(profiles),
  syllabi: many(syllabi),
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
  studyBriefs: many(studyBriefs),
  competencyChecks: many(competencyChecks),
  conceptExpansion: one(conceptExpansions),
  conceptRelevance: one(conceptRelevances),
}));

export const resourcesRelations = relations(resources, ({ one, many }) => ({
  concept: one(concepts, {
    fields: [resources.conceptId],
    references: [concepts.id],
  }),
  studyBriefs: many(studyBriefs),
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

export const studyBriefsRelations = relations(studyBriefs, ({ one }) => ({
  resource: one(resources, {
    fields: [studyBriefs.resourceId],
    references: [resources.id],
  }),
  concept: one(concepts, {
    fields: [studyBriefs.conceptId],
    references: [concepts.id],
  }),
}));

export const competencyChecksRelations = relations(
  competencyChecks,
  ({ one }) => ({
    concept: one(concepts, {
      fields: [competencyChecks.conceptId],
      references: [concepts.id],
    }),
  }),
);

export const conceptExpansionsRelations = relations(
  conceptExpansions,
  ({ one }) => ({
    concept: one(concepts, {
      fields: [conceptExpansions.conceptId],
      references: [concepts.id],
    }),
  }),
);

export const conceptRelevancesRelations = relations(
  conceptRelevances,
  ({ one }) => ({
    concept: one(concepts, {
      fields: [conceptRelevances.conceptId],
      references: [concepts.id],
    }),
  }),
);

export const gapReportsRelations = relations(gapReports, ({ one }) => ({
  syllabus: one(syllabi, {
    fields: [gapReports.syllabusId],
    references: [syllabi.id],
  }),
}));

export type Syllabus = typeof syllabi.$inferSelect;
export type NewSyllabus = typeof syllabi.$inferInsert;
export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
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
export type StudyBrief = typeof studyBriefs.$inferSelect;
export type NewStudyBrief = typeof studyBriefs.$inferInsert;
export type CompetencyCheck = typeof competencyChecks.$inferSelect;
export type NewCompetencyCheck = typeof competencyChecks.$inferInsert;
export type GapReport = typeof gapReports.$inferSelect;
export type NewGapReport = typeof gapReports.$inferInsert;
export type ConceptExpansion = typeof conceptExpansions.$inferSelect;
export type NewConceptExpansion = typeof conceptExpansions.$inferInsert;
export type ConceptRelevance = typeof conceptRelevances.$inferSelect;
export type NewConceptRelevance = typeof conceptRelevances.$inferInsert;
export type ConceptImportance = "core" | "supporting" | "peripheral";
export type RoleNature = "technical" | "non_technical" | "hybrid";
