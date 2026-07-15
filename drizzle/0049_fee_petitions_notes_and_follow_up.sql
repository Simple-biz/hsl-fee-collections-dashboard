ALTER TABLE "activity_log" ADD COLUMN "fee_petition_id" uuid;--> statement-breakpoint
ALTER TABLE "fee_petitions" ADD COLUMN "next_follow_up_date" date;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_fee_petition_id_fee_petitions_id_fk" FOREIGN KEY ("fee_petition_id") REFERENCES "public"."fee_petitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_activity_log_fee_petition_id" ON "activity_log" USING btree ("fee_petition_id");