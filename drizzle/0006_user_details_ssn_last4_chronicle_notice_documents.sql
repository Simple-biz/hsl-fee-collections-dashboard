CREATE TABLE "chronicle_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"case_id" integer NOT NULL,
	"mycase_client_id" integer,
	"chronicle_client_id" integer,
	"chronicle_document_id" integer NOT NULL,
	"document_name" varchar(500),
	"document_type" varchar(255),
	"document_category" varchar(255),
	"raw_document" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "chronicle_documents_case_id_chronicle_document_id_unique" UNIQUE("case_id","chronicle_document_id")
);
--> statement-breakpoint
CREATE TABLE "mycase_notice_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"case_id" integer NOT NULL,
	"mycase_client_id" integer,
	"mycase_document_id" integer NOT NULL,
	"document_name" varchar(500),
	"matched_pattern" varchar(255),
	"raw_document" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "mycase_notice_documents_case_id_mycase_document_id_unique" UNIQUE("case_id","mycase_document_id")
);
--> statement-breakpoint
ALTER TABLE "user_details" ADD COLUMN "ssn_last4" varchar(4);--> statement-breakpoint
ALTER TABLE "chronicle_documents" ADD CONSTRAINT "chronicle_documents_case_id_cases_client_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mycase_notice_documents" ADD CONSTRAINT "mycase_notice_documents_case_id_cases_client_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_chronicle_documents_case_id" ON "chronicle_documents" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "idx_mycase_notice_documents_case_id" ON "mycase_notice_documents" USING btree ("case_id");