CREATE TABLE "gap_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"syllabus_id" uuid NOT NULL,
	"strengths" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"gaps_in_progress" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"gaps_not_started" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"soft_skill_gaps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"signal_recommendations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"model" text NOT NULL,
	CONSTRAINT "gap_reports_syllabus_id_unq" UNIQUE("syllabus_id")
);
--> statement-breakpoint
ALTER TABLE "gap_reports" ADD CONSTRAINT "gap_reports_syllabus_id_syllabi_id_fk" FOREIGN KEY ("syllabus_id") REFERENCES "public"."syllabi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gap_reports_syllabus_id_idx" ON "gap_reports" USING btree ("syllabus_id");
