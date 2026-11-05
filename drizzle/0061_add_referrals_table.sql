CREATE TABLE "referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" integer NOT NULL,
	"referred_by" varchar(200) NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referrals_case_id_unique" UNIQUE("case_id")
);
--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_case_id_cases_client_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_referrals_case_id" ON "referrals" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "idx_referrals_created_at" ON "referrals" USING btree ("created_at");
