CREATE TYPE "public"."concept_importance" AS ENUM('core', 'supporting', 'peripheral');--> statement-breakpoint
CREATE TABLE "concept_relevances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"concept_id" uuid NOT NULL,
	"point" text NOT NULL,
	"explanation" text NOT NULL,
	"evidence" text NOT NULL,
	"effect" text NOT NULL,
	"importance" "concept_importance" NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"model" text NOT NULL,
	CONSTRAINT "concept_relevances_concept_id_unq" UNIQUE("concept_id")
);
--> statement-breakpoint
ALTER TABLE "concept_relevances" ADD CONSTRAINT "concept_relevances_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "concept_relevances_concept_id_idx" ON "concept_relevances" USING btree ("concept_id");