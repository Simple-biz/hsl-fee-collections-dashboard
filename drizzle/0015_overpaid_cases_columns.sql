ALTER TABLE "fee_records" ADD COLUMN IF NOT EXISTS "marked_overpaid" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "overpaid_cases" ADD COLUMN IF NOT EXISTS "op_ltr_date" date;--> statement-breakpoint
ALTER TABLE "overpaid_cases" ADD COLUMN IF NOT EXISTS "overpaid_amount" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "overpaid_cases" ADD COLUMN IF NOT EXISTS "checks_cleared_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "overpaid_cases" ADD COLUMN IF NOT EXISTS "region" varchar(100);