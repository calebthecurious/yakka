ALTER TABLE "skill_clusters" ADD COLUMN "starting_point" text;--> statement-breakpoint
ALTER TABLE "skill_clusters" ADD COLUMN "suggested_approach" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "skill_clusters" ADD COLUMN "criteria_guidance" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "skill_clusters" ADD COLUMN "project_resources" jsonb DEFAULT '[]'::jsonb NOT NULL;