ALTER TYPE "public"."level_won_enum" ADD VALUE 'FEE_PETITION';--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "case_link" text;--> statement-breakpoint
ALTER TABLE "fee_records" ADD COLUMN "win_sheet_link" text;--> statement-breakpoint
ALTER TABLE "fee_records" ADD COLUMN "case_status" varchar(100);--> statement-breakpoint
ALTER TABLE "fee_records" ADD COLUMN "fees_confirmation" varchar(50);--> statement-breakpoint
ALTER TABLE "fee_records" ADD COLUMN "date_assigned_to_agent" date;