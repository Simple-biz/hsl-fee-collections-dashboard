CREATE TABLE "approved_by_options" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approved_by_options_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "fee_records" ADD COLUMN "is_closed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "fee_records" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_fee_records_is_closed" ON "fee_records" USING btree ("is_closed");