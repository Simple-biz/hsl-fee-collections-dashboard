CREATE TABLE "inbound_call_poc" (
	"id" serial PRIMARY KEY NOT NULL,
	"week_start" date NOT NULL,
	"day_of_week" integer NOT NULL,
	"poc_name" varchar(200) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_inbound_call_poc_week_day_name" UNIQUE("week_start","day_of_week","poc_name")
);
--> statement-breakpoint
CREATE TABLE "inbound_call_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"week_start" date NOT NULL,
	"call_date" date NOT NULL,
	"number" varchar(50),
	"transcript" text,
	"case_link" varchar(500),
	"specialist_assigned" varchar(200),
	"called_back_resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_inbound_call_poc_week" ON "inbound_call_poc" USING btree ("week_start");--> statement-breakpoint
CREATE INDEX "idx_inbound_call_records_week" ON "inbound_call_records" USING btree ("week_start");--> statement-breakpoint
CREATE INDEX "idx_inbound_call_records_date" ON "inbound_call_records" USING btree ("call_date");