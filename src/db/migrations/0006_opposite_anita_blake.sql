CREATE TABLE "concept_expansions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"concept_id" uuid NOT NULL,
	"definition" text NOT NULL,
	"principles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"key_terms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"prerequisite_concept_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"builds_on_concept_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"common_misunderstandings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"relationship_map_mermaid" text,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"model" text NOT NULL,
	CONSTRAINT "concept_expansions_concept_id_unq" UNIQUE("concept_id")
);
--> statement-breakpoint
ALTER TABLE "concept_expansions" ADD CONSTRAINT "concept_expansions_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "concept_expansions_concept_id_idx" ON "concept_expansions" USING btree ("concept_id");