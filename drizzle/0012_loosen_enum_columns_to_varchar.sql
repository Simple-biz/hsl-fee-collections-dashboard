-- Postgres requires an explicit USING expression to cast existing enum
-- values to text. Drop the default first, then re-set it after the
-- type change.
ALTER TABLE "fee_records" ALTER COLUMN "win_sheet_status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "fee_records" ALTER COLUMN "win_sheet_status" SET DATA TYPE varchar(50) USING "win_sheet_status"::text;--> statement-breakpoint
ALTER TABLE "fee_records" ALTER COLUMN "win_sheet_status" SET DEFAULT 'not_started';--> statement-breakpoint
ALTER TABLE "cases" ALTER COLUMN "claim_type_label" SET DATA TYPE varchar(50) USING "claim_type_label"::text;--> statement-breakpoint
ALTER TABLE "cases" ALTER COLUMN "level_won" SET DATA TYPE varchar(50) USING "level_won"::text;
