ALTER TYPE "public"."user_role_enum" ADD VALUE 'system_admin';--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_pkey";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "id";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "id" serial PRIMARY KEY NOT NULL;
