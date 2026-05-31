CREATE TYPE "public"."foundation_item_type" AS ENUM('assumed_baseline', 'launch_step');--> statement-breakpoint
CREATE TYPE "public"."foundation_user_status" AS ENUM('have_it', 'need_it', 'unset');--> statement-breakpoint
CREATE TABLE "foundation_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"syllabus_id" uuid NOT NULL,
	"type" "foundation_item_type" NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"sequence_index" integer DEFAULT 0 NOT NULL,
	"suggested_resources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"linked_concept_id" uuid,
	"user_status" "foundation_user_status" DEFAULT 'unset' NOT NULL,
	"resume_signal" text,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"model" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "foundation_items" ADD CONSTRAINT "foundation_items_syllabus_id_syllabi_id_fk" FOREIGN KEY ("syllabus_id") REFERENCES "public"."syllabi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_items" ADD CONSTRAINT "foundation_items_linked_concept_id_concepts_id_fk" FOREIGN KEY ("linked_concept_id") REFERENCES "public"."concepts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "foundation_items_syllabus_id_idx" ON "foundation_items" USING btree ("syllabus_id");--> statement-breakpoint
CREATE INDEX "foundation_items_syllabus_type_idx" ON "foundation_items" USING btree ("syllabus_id","type");