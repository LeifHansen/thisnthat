CREATE TYPE "public"."user_role" AS ENUM('user', 'admin', 'super_admin');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" "user_role" DEFAULT 'user' NOT NULL;