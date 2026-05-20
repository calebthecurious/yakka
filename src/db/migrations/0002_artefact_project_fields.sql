ALTER TABLE "artefacts" ADD COLUMN "evidence_url" text;--> statement-breakpoint
ALTER TABLE "artefacts" ADD COLUMN "acceptance_criteria" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "artefacts" ADD COLUMN "progress_log" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "artefacts" ADD COLUMN "demonstrated_concept_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;