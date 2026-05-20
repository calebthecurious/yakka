ALTER TABLE "syllabi" ALTER COLUMN "metadata" SET DEFAULT '{"structuralBlockers":[],"alternativeTargetBranches":[],"currentSkills":""}'::jsonb;--> statement-breakpoint
ALTER TABLE "artefacts" ADD COLUMN "reflection" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "artefacts" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "artefacts" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;