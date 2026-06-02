ALTER TABLE "profiles" ADD COLUMN "headline" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "github_url" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "linkedin_url" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "website_url" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "show_learning_trail" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "show_self_assessed" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "show_currently_developing" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "syllabi" ADD COLUMN "is_featured_on_profile" boolean DEFAULT false NOT NULL;