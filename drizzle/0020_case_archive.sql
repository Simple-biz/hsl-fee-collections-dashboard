CREATE TYPE "public"."archived_source_enum" AS ENUM('active_sheet', 'fees_closed_sheet');--> statement-breakpoint
CREATE TABLE "case_archive" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"original_client_id" integer NOT NULL,
	"case_name" varchar(200),
	"case_link" text,
	"approval_date" date,
	"archived_source" "archived_source_enum" NOT NULL,
	"archived_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_by" varchar(100),
	"case_snapshot" jsonb NOT NULL,
	"fee_record_snapshot" jsonb
);
--> statement-breakpoint
CREATE INDEX "idx_case_archive_client_id" ON "case_archive" USING btree ("original_client_id");--> statement-breakpoint
CREATE INDEX "idx_case_archive_source" ON "case_archive" USING btree ("archived_source");--> statement-breakpoint
CREATE INDEX "idx_case_archive_archived_at" ON "case_archive" USING btree ("archived_at");