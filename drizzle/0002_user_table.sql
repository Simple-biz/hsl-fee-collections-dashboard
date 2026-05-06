CREATE TABLE "user_details" (
	"id" serial PRIMARY KEY NOT NULL,
	"case_id" integer NOT NULL,
	"full_name" varchar(255),
	"address_line_1" varchar(255),
	"address_line_2" varchar(255),
	"city" varchar(255),
	"state" varchar(100),
	"zip_code" varchar(50),
	"country" varchar(100),
	"cell_phone" varchar(100),
	"email" varchar(255),
	"ssn" varchar(50),
	"date_of_birth" date,
	"age_at_approval" integer,
	"place_of_birth" varchar(255),
	"mothers_first_name_and_maiden_name" varchar(255),
	"fathers_first_and_last_name" varchar(255),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "user_details" ADD CONSTRAINT "user_details_case_id_cases_client_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_user_details_case_id" ON "user_details" USING btree ("case_id");