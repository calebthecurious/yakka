CREATE TYPE "public"."concept_tier" AS ENUM('foundation', 'intermediate', 'advanced');--> statement-breakpoint
ALTER TABLE "concepts" ADD COLUMN "tier" "concept_tier" DEFAULT 'intermediate' NOT NULL;--> statement-breakpoint
ALTER TABLE "sub_skills" ADD COLUMN "order_index" integer DEFAULT 0 NOT NULL;