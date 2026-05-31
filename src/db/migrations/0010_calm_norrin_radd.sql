CREATE TABLE "company_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"syllabus_id" uuid NOT NULL,
	"verified_facts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"likely_inferences" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tech_signals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"alignment_notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"model" text NOT NULL,
	CONSTRAINT "company_insights_syllabus_id_unq" UNIQUE("syllabus_id")
);
--> statement-breakpoint
ALTER TABLE "company_insights" ADD CONSTRAINT "company_insights_syllabus_id_syllabi_id_fk" FOREIGN KEY ("syllabus_id") REFERENCES "public"."syllabi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_insights_syllabus_id_idx" ON "company_insights" USING btree ("syllabus_id");