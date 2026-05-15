ALTER TABLE "overpaid_cases" DROP COLUMN "op_ltr_received";--> statement-breakpoint
ALTER TABLE "overpaid_cases" ADD COLUMN "op_ltr_received" date;
