CREATE TABLE "fee_petitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" integer NOT NULL,
	"noa" boolean DEFAULT false NOT NULL,
	"time_delineation" boolean DEFAULT false NOT NULL,
	"fee_petition_doc" boolean DEFAULT false NOT NULL,
	"ltr_to_clmt" boolean DEFAULT false NOT NULL,
	"ltr_to_clmt_with_signature" boolean DEFAULT false NOT NULL,
	"ltr_to_alj" boolean DEFAULT false NOT NULL,
	"fax_conf_fee_pet" boolean DEFAULT false NOT NULL,
	"update_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_petitions_case_id_unique" UNIQUE("case_id")
);
--> statement-breakpoint
ALTER TABLE "fee_petitions" ADD CONSTRAINT "fee_petitions_case_id_cases_client_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_fee_petitions_case_id" ON "fee_petitions" USING btree ("case_id");