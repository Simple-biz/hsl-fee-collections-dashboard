-- Auth users table. Authored on feature/auth and rebased on top of develop
-- after the fee-petitions + overpaid-cases work landed, replacing the original
-- pair (auth users-uuid + alter-to-serial) with a single end-state migration.
-- Made idempotent so databases that already have the table (from the
-- pre-rebase auth migrations) treat this as a no-op.
DO $$ BEGIN
  CREATE TYPE "public"."user_role_enum" AS ENUM('admin', 'member', 'system_admin');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255),
	"password_hash" text NOT NULL,
	"role" "user_role_enum" DEFAULT 'member' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_email" ON "users" USING btree ("email");
