ALTER TABLE "fee_records" ADD COLUMN IF NOT EXISTS "win_sheet_link_text" varchar(200);
ALTER TABLE "fee_records" ADD COLUMN IF NOT EXISTS "days_after_approval" integer;
ALTER TABLE "fee_records" ADD COLUMN IF NOT EXISTS "approval_category" varchar(100);
ALTER TABLE "fee_records" ADD COLUMN IF NOT EXISTS "fees_status" varchar(100);
ALTER TABLE "fee_records" ADD COLUMN IF NOT EXISTS "week_assigned_to_agent" varchar(50);
ALTER TABLE "fee_records" ADD COLUMN IF NOT EXISTS "month_assigned_to_agent" varchar(50);