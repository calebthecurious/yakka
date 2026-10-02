CREATE TYPE "public"."profile_view_event_type" AS ENUM('view', 'section', 'artefact_click', 'dwell');--> statement-breakpoint
CREATE TABLE "profile_view_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"syllabus_id" uuid,
	"event_type" "profile_view_event_type" DEFAULT 'view' NOT NULL,
	"section" text,
	"artefact_id" uuid,
	"dwell_ms" integer,
	"referrer_host" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"visitor_key" text,
	"is_owner" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profile_view_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "profile_view_events" ADD CONSTRAINT "profile_view_events_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_view_events" ADD CONSTRAINT "profile_view_events_syllabus_id_syllabi_id_fk" FOREIGN KEY ("syllabus_id") REFERENCES "public"."syllabi"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_view_events" ADD CONSTRAINT "profile_view_events_artefact_id_artefacts_id_fk" FOREIGN KEY ("artefact_id") REFERENCES "public"."artefacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "profile_view_events_profile_created_idx" ON "profile_view_events" USING btree ("profile_id","created_at");--> statement-breakpoint
CREATE INDEX "profile_view_events_profile_type_idx" ON "profile_view_events" USING btree ("profile_id","event_type");--> statement-breakpoint
CREATE INDEX "profile_view_events_utm_source_idx" ON "profile_view_events" USING btree ("utm_source");--> statement-breakpoint
CREATE POLICY "profile view events readable by owner" ON "profile_view_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select auth.uid()) = "profile_view_events"."profile_id");