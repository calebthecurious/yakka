CREATE TYPE "public"."generation_status" AS ENUM('pending', 'running', 'complete', 'failed');--> statement-breakpoint
CREATE TYPE "public"."syllabus_status" AS ENUM('generating', 'ready', 'failed');--> statement-breakpoint
ALTER TABLE "skill_clusters" ADD COLUMN "artefact_status" "generation_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "skill_clusters" ADD COLUMN "artefact_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "skill_clusters" ADD COLUMN "artefact_error" text;--> statement-breakpoint
ALTER TABLE "skill_clusters" ADD COLUMN "artefact_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sub_skills" ADD COLUMN "generation_status" "generation_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "sub_skills" ADD COLUMN "generation_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sub_skills" ADD COLUMN "generation_error" text;--> statement-breakpoint
ALTER TABLE "sub_skills" ADD COLUMN "generation_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "syllabi" ADD COLUMN "status" "syllabus_status" DEFAULT 'generating' NOT NULL;--> statement-breakpoint
ALTER TABLE "syllabi" ADD COLUMN "skeleton_status" "generation_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "syllabi" ADD COLUMN "generation_error" text;--> statement-breakpoint
CREATE INDEX "syllabi_status_idx" ON "syllabi" USING btree ("status");--> statement-breakpoint
-- ── Backfill (data-only; does not affect the schema snapshot) ──────────────────
-- Every row present when this migration runs predates resumable generation and
-- was fully produced by the old all-or-nothing flow. Mark it done so the worker
-- / Cron never re-generates live data. Rows created after deploy use the schema
-- DEFAULTs ('generating' / 'pending') via the new code path instead.
UPDATE "syllabi" SET "status" = 'ready', "skeleton_status" = 'complete';--> statement-breakpoint
UPDATE "sub_skills" SET "generation_status" = 'complete';--> statement-breakpoint
-- Non-bearing clusters (never generate an artefact) and bearing clusters whose
-- artefact already exists are complete. Any bearing cluster still missing its
-- artefact correctly keeps the DEFAULT 'pending' and will be picked up.
UPDATE "skill_clusters" SET "artefact_status" = 'complete'
  WHERE "is_artefact_bearing" = false OR "suggested_artefact" IS NOT NULL;