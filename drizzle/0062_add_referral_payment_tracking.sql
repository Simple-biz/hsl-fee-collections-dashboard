ALTER TABLE "referrals" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "referrals" ADD COLUMN "payment_amount" numeric(10, 2);
