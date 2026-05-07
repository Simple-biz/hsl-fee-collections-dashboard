ALTER TABLE "user_details" ADD COLUMN "chronicle_id" integer;--> statement-breakpoint
ALTER TABLE "user_details" ADD CONSTRAINT "user_details_chronicle_id_unique" UNIQUE("chronicle_id");