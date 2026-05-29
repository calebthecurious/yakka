CREATE TYPE "public"."role_nature" AS ENUM('technical', 'non_technical', 'hybrid');--> statement-breakpoint
ALTER TABLE "syllabi" ADD COLUMN "role_nature" "role_nature" DEFAULT 'technical' NOT NULL;