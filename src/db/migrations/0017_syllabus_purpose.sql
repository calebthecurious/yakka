CREATE TYPE "public"."syllabus_purpose" AS ENUM('get_hired', 'current_role');--> statement-breakpoint
ALTER TABLE "syllabi" ADD COLUMN "purpose" "syllabus_purpose" DEFAULT 'get_hired' NOT NULL;--> statement-breakpoint
-- W-1 explicit backfill. The NOT NULL DEFAULT above already fills existing rows;
-- the intent is stated, not implied: every syllabus that exists when this runs
-- predates the column and was for getting hired. No row can be current_role yet.
UPDATE "syllabi" SET "purpose" = 'get_hired';
