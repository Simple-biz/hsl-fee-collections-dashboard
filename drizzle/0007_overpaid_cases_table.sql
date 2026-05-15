CREATE TABLE "overpaid_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" integer NOT NULL,
	"op_ltr_received" boolean DEFAULT false NOT NULL,
	"checks_cleared" boolean DEFAULT false NOT NULL,
	"update_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "overpaid_cases_case_id_unique" UNIQUE("case_id")
);
--> statement-breakpoint
ALTER TABLE "overpaid_cases" ADD CONSTRAINT "overpaid_cases_case_id_cases_client_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_overpaid_cases_case_id" ON "overpaid_cases" USING btree ("case_id");