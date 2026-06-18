ALTER TABLE "daily_metrics" ADD COLUMN "win_sheets_created" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "team_members" ADD COLUMN "team" varchar(20);