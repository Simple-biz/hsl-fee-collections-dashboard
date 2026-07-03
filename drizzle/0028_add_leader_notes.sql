CREATE TABLE "leader_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" integer NOT NULL,
	"message" text NOT NULL,
	"created_by" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leader_notes" ADD CONSTRAINT "leader_notes_case_id_cases_client_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_leader_notes_case_id" ON "leader_notes" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "idx_leader_notes_created_at" ON "leader_notes" USING btree ("created_at");