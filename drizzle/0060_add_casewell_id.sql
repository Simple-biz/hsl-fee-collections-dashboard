ALTER TABLE "user_details" ADD COLUMN "casewell_id" text;--> statement-breakpoint
ALTER TABLE "user_details" ADD CONSTRAINT "user_details_casewell_id_unique" UNIQUE("casewell_id");