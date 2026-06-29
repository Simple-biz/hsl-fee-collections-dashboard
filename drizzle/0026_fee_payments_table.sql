CREATE TYPE "public"."fee_type_enum" AS ENUM('t16', 't2', 'aux');--> statement-breakpoint
CREATE TABLE "fee_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" integer NOT NULL,
	"fee_type" "fee_type_enum" NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"received_date" date NOT NULL,
	"note" varchar(200),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_case_id_cases_client_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_fee_payments_case_id" ON "fee_payments" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "idx_fee_payments_fee_type" ON "fee_payments" USING btree ("fee_type");--> statement-breakpoint
CREATE INDEX "idx_fee_payments_received_date" ON "fee_payments" USING btree ("received_date");--> statement-breakpoint
-- Backfill legacy payment rows from existing fee_records totals.
-- COALESCE on received_date: use the stored date if present, else today.
INSERT INTO fee_payments (id, case_id, fee_type, amount, received_date, note, created_at)
SELECT gen_random_uuid(), case_id, 't16', t16_fee_received::numeric,
  COALESCE(t16_fee_received_date, CURRENT_DATE), 'Legacy (migrated)', now()
FROM fee_records
WHERE t16_fee_received::numeric > 0;
--> statement-breakpoint
INSERT INTO fee_payments (id, case_id, fee_type, amount, received_date, note, created_at)
SELECT gen_random_uuid(), case_id, 't2', t2_fee_received::numeric,
  COALESCE(t2_fee_received_date, CURRENT_DATE), 'Legacy (migrated)', now()
FROM fee_records
WHERE t2_fee_received::numeric > 0;
--> statement-breakpoint
INSERT INTO fee_payments (id, case_id, fee_type, amount, received_date, note, created_at)
SELECT gen_random_uuid(), case_id, 'aux', aux_fee_received::numeric,
  COALESCE(aux_fee_received_date, CURRENT_DATE), 'Legacy (migrated)', now()
FROM fee_records
WHERE aux_fee_received::numeric > 0;