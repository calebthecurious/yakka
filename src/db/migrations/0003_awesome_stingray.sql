CREATE TYPE "public"."ai_confidence" AS ENUM('high', 'low');--> statement-breakpoint
CREATE TABLE "study_briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" uuid NOT NULL,
	"concept_id" uuid NOT NULL,
	"key_points" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"application" text DEFAULT '' NOT NULL,
	"locations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"check_questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ai_confidence" "ai_confidence" DEFAULT 'high' NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"model" text NOT NULL,
	CONSTRAINT "study_briefs_resource_concept_unq" UNIQUE("resource_id","concept_id")
);
--> statement-breakpoint
ALTER TABLE "study_briefs" ADD CONSTRAINT "study_briefs_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_briefs" ADD CONSTRAINT "study_briefs_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "study_briefs_resource_id_idx" ON "study_briefs" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "study_briefs_concept_id_idx" ON "study_briefs" USING btree ("concept_id");