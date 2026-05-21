ALTER TABLE "fee_records" ADD COLUMN "days_after_approval" integer;--> statement-breakpoint
ALTER TABLE "fee_records" ADD COLUMN "approval_category" varchar(100);--> statement-breakpoint
ALTER TABLE "fee_records" ADD COLUMN "fees_status" varchar(100);--> statement-breakpoint
ALTER TABLE "fee_records" ADD COLUMN "week_assigned_to_agent" varchar(50);--> statement-breakpoint
ALTER TABLE "fee_records" ADD COLUMN "month_assigned_to_agent" varchar(50);