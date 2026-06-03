ALTER TABLE "skill_clusters" ADD COLUMN "is_artefact_bearing" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "skill_clusters" ADD COLUMN "artefact_target" jsonb;--> statement-breakpoint
-- Backfill: legacy clusters generated before this feature each already carry a
-- suggested_artefact, so treat them as artefact-bearing to preserve their
-- existing "commit to this project" button. artefact_target stays null for them
-- (the UI falls back to suggested_artefact when artefact_target is absent).
UPDATE "skill_clusters" SET "is_artefact_bearing" = true WHERE "suggested_artefact" IS NOT NULL;