CREATE TYPE "public"."artefact_type" AS ENUM('project', 'writeup', 'certificate', 'contribution');--> statement-breakpoint
CREATE TYPE "public"."concept_status" AS ENUM('not_started', 'learning', 'understood', 'verified');--> statement-breakpoint
CREATE TYPE "public"."resource_status" AS ENUM('planned', 'consuming', 'completed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."resource_type" AS ENUM('course', 'book', 'video', 'article', 'project', 'paper');--> statement-breakpoint
CREATE TYPE "public"."skill_cluster_type" AS ENUM('technical', 'domain', 'soft', 'meta');--> statement-breakpoint
CREATE TYPE "public"."sub_skill_status" AS ENUM('not_started', 'in_progress', 'verified');--> statement-breakpoint
CREATE TABLE "artefacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sub_skill_id" uuid NOT NULL,
	"type" "artefact_type" NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"description" text DEFAULT '' NOT NULL,
	"verified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "concepts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sub_skill_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"status" "concept_status" DEFAULT 'not_started' NOT NULL,
	"understood_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"concept_id" uuid NOT NULL,
	"duration_minutes" integer NOT NULL,
	"notes_markdown" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"concept_id" uuid NOT NULL,
	"type" "resource_type" NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"author" text,
	"status" "resource_status" DEFAULT 'planned' NOT NULL,
	"notes" text,
	"priority" integer DEFAULT 1 NOT NULL,
	"added_by_user" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "retention_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"concept_id" uuid NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"fsrs_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"next_review_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "skill_clusters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"syllabus_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"weight" integer DEFAULT 3 NOT NULL,
	"type" "skill_cluster_type" DEFAULT 'technical' NOT NULL,
	"suggested_artefact" jsonb
);
--> statement-breakpoint
CREATE TABLE "sub_skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cluster_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"estimated_hours" integer DEFAULT 0 NOT NULL,
	"sub_skill_status" "sub_skill_status" DEFAULT 'not_started' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "syllabi" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"target_role" text NOT NULL,
	"target_company" text,
	"job_description_text" text NOT NULL,
	"metadata" jsonb DEFAULT '{"blockers":[],"alternativeTargets":[],"currentSkills":""}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "artefacts" ADD CONSTRAINT "artefacts_sub_skill_id_sub_skills_id_fk" FOREIGN KEY ("sub_skill_id") REFERENCES "public"."sub_skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_sub_skill_id_sub_skills_id_fk" FOREIGN KEY ("sub_skill_id") REFERENCES "public"."sub_skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_sessions" ADD CONSTRAINT "learning_sessions_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_cards" ADD CONSTRAINT "retention_cards_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_clusters" ADD CONSTRAINT "skill_clusters_syllabus_id_syllabi_id_fk" FOREIGN KEY ("syllabus_id") REFERENCES "public"."syllabi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_skills" ADD CONSTRAINT "sub_skills_cluster_id_skill_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."skill_clusters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artefacts_sub_skill_id_idx" ON "artefacts" USING btree ("sub_skill_id");--> statement-breakpoint
CREATE INDEX "concepts_sub_skill_id_idx" ON "concepts" USING btree ("sub_skill_id");--> statement-breakpoint
CREATE INDEX "learning_sessions_concept_id_idx" ON "learning_sessions" USING btree ("concept_id");--> statement-breakpoint
CREATE INDEX "learning_sessions_created_at_idx" ON "learning_sessions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "resources_concept_id_idx" ON "resources" USING btree ("concept_id");--> statement-breakpoint
CREATE INDEX "retention_cards_concept_id_idx" ON "retention_cards" USING btree ("concept_id");--> statement-breakpoint
CREATE INDEX "retention_cards_next_review_at_idx" ON "retention_cards" USING btree ("next_review_at");--> statement-breakpoint
CREATE INDEX "skill_clusters_syllabus_id_idx" ON "skill_clusters" USING btree ("syllabus_id");--> statement-breakpoint
CREATE INDEX "sub_skills_cluster_id_idx" ON "sub_skills" USING btree ("cluster_id");--> statement-breakpoint
CREATE INDEX "syllabi_user_id_idx" ON "syllabi" USING btree ("user_id");