CREATE TYPE "public"."claim_type_enum" AS ENUM('T2', 'T16', 'T2_T16');--> statement-breakpoint
CREATE TYPE "public"."decision_outcome_enum" AS ENUM('fully_favorable', 'partially_favorable', 'unfavorable', 'dismissed', 'remand', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."fee_method_enum" AS ENUM('fee_agreement', 'fee_petition');--> statement-breakpoint
CREATE TYPE "public"."level_won_enum" AS ENUM('INITIAL', 'RECON', 'HEARING', 'AC', 'FEDERAL_COURT');--> statement-breakpoint
CREATE TYPE "public"."notification_severity_enum" AS ENUM('info', 'warning', 'critical');--> statement-breakpoint
CREATE TYPE "public"."notification_type_enum" AS ENUM('case_aging', 'fee_payment', 'call_target_missed', 'case_assigned');--> statement-breakpoint
CREATE TYPE "public"."sync_status_enum" AS ENUM('not_synced', 'syncing', 'synced', 'error');--> statement-breakpoint
CREATE TYPE "public"."win_sheet_status_enum" AS ENUM('not_started', 'started', 'in_progress', 'pending_payment', 'partially_paid', 'paid_in_full', 'closed');--> statement-breakpoint
CREATE TABLE "activity_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" integer NOT NULL,
	"fee_record_id" uuid,
	"message" text NOT NULL,
	"created_by" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"label" varchar(200),
	"category" varchar(50) DEFAULT 'general' NOT NULL,
	"is_secret" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"external_id" varchar(100),
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"dob" date,
	"last4_ssn" varchar(4),
	"claim_type" text[] DEFAULT '{}' NOT NULL,
	"claim_type_label" "claim_type_enum",
	"level_won" "level_won_enum",
	"t2_decision" "decision_outcome_enum" DEFAULT 'unknown',
	"t16_decision" "decision_outcome_enum" DEFAULT 'unknown',
	"application_date" date,
	"alleged_onset_date" date,
	"approval_date" date,
	"closure_date" date,
	"hearing_held_date" date,
	"hearing_scheduled_date" date,
	"hearing_scheduled_datetime" timestamp with time zone,
	"hearing_timezone" varchar(50),
	"office_with_jurisdiction" varchar(200),
	"alj_first_name" varchar(100),
	"alj_last_name" varchar(100),
	"claimant_location" varchar(200),
	"representative_location" varchar(200),
	"medical_expert" varchar(200),
	"vocational_expert" varchar(200),
	"all_file_link" text,
	"exhibits_file_link" text,
	"all_file_updated_at" timestamp with time zone,
	"exhibits_file_updated_at" timestamp with time zone,
	"full_ssn" varchar(11),
	"email" varchar(200),
	"phone" varchar(30),
	"primary_diagnosis" varchar(200),
	"primary_diagnosis_code" varchar(10),
	"secondary_diagnosis" varchar(200),
	"secondary_diagnosis_code" varchar(10),
	"allegations" text,
	"blind_dli" date,
	"firm_name" varchar(200),
	"firm_ein" varchar(12),
	"hearing_office" varchar(200),
	"representatives" jsonb,
	"decision_history" jsonb,
	"report_type" varchar(100),
	"expedited_case" varchar(50),
	"status_of_case" varchar(100),
	"status_date" date,
	"request_date" date,
	"receipt_date" date,
	"first_date_assigned" date,
	"date_fqr_starts" date,
	"last_insured" date,
	"owner_user_id" varchar(100),
	"created_by_user_id" varchar(100),
	"source_created_at" timestamp with time zone,
	"source_updated_at" timestamp with time zone,
	"last_ere_session_date" timestamp with time zone,
	"last_status_report_date" timestamp with time zone,
	"documents_last_added_at" timestamp with time zone,
	"invalid_ssn" boolean DEFAULT false,
	"ssn_encrypted" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_pulled_at" timestamp with time zone,
	CONSTRAINT "cases_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "daily_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_name" varchar(100) NOT NULL,
	"metric_date" date DEFAULT now() NOT NULL,
	"ssa_calls" integer DEFAULT 0 NOT NULL,
	"client_calls_ib" integer DEFAULT 0 NOT NULL,
	"client_calls_ob" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fee_cap_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"effective_date" date NOT NULL,
	"cap_amount" numeric(12, 2) NOT NULL,
	"notes" varchar(200),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_cap_history_effective_date_unique" UNIQUE("effective_date")
);
--> statement-breakpoint
CREATE TABLE "fee_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" integer NOT NULL,
	"assigned_to" varchar(100),
	"win_sheet_status" "win_sheet_status_enum" DEFAULT 'not_started',
	"t16_retro" numeric(12, 2) DEFAULT '0',
	"t16_fee_due" numeric(12, 2) DEFAULT '0',
	"t16_fee_received" numeric(12, 2) DEFAULT '0',
	"t16_pending" numeric(12, 2) DEFAULT '0',
	"t16_fee_received_date" date,
	"t2_retro" numeric(12, 2) DEFAULT '0',
	"t2_fee_due" numeric(12, 2) DEFAULT '0',
	"t2_fee_received" numeric(12, 2) DEFAULT '0',
	"t2_pending" numeric(12, 2) DEFAULT '0',
	"t2_fee_received_date" date,
	"aux_retro" numeric(12, 2) DEFAULT '0',
	"aux_fee_due" numeric(12, 2) DEFAULT '0',
	"aux_fee_received" numeric(12, 2) DEFAULT '0',
	"aux_pending" numeric(12, 2) DEFAULT '0',
	"aux_fee_received_date" date,
	"total_retro_due" numeric(12, 2) DEFAULT '0',
	"total_fees_expected" numeric(12, 2) DEFAULT '0',
	"total_fees_paid" numeric(12, 2) DEFAULT '0',
	"pif_ready_to_close" boolean DEFAULT false,
	"approved_by" varchar(100),
	"approved_at" timestamp with time zone,
	"fee_method" "fee_method_enum" DEFAULT 'fee_agreement',
	"applicable_fee_cap" numeric(12, 2) DEFAULT '9200',
	"fee_cap_applied" boolean DEFAULT false,
	"fee_computed" boolean DEFAULT false,
	"fee_computed_at" timestamp with time zone,
	"sync_status" "sync_status_enum" DEFAULT 'not_synced',
	"synced_at" timestamp with time zone,
	"mycase_record_id" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_records_case_id_unique" UNIQUE("case_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "notification_type_enum" NOT NULL,
	"severity" "notification_severity_enum" DEFAULT 'info' NOT NULL,
	"title" varchar(300) NOT NULL,
	"message" text NOT NULL,
	"case_id" integer,
	"agent_name" varchar(100),
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pull_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"triggered_by" varchar(100) NOT NULL,
	"total_records_pulled" integer DEFAULT 0 NOT NULL,
	"new_cases" integer DEFAULT 0 NOT NULL,
	"updated_cases" integer DEFAULT 0 NOT NULL,
	"errors" integer DEFAULT 0 NOT NULL,
	"error_details" jsonb,
	"triggered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sync_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"triggered_by" varchar(100) NOT NULL,
	"total_cases" integer DEFAULT 0 NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"case_ids" integer[],
	"error_details" jsonb,
	"triggered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"role" varchar(100) DEFAULT 'collections_specialist',
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_members_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_case_id_cases_client_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_fee_record_id_fee_records_id_fk" FOREIGN KEY ("fee_record_id") REFERENCES "public"."fee_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_metrics" ADD CONSTRAINT "daily_metrics_agent_name_team_members_name_fk" FOREIGN KEY ("agent_name") REFERENCES "public"."team_members"("name") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_records" ADD CONSTRAINT "fee_records_case_id_cases_client_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_case_id_cases_client_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_activity_log_case_id" ON "activity_log" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "idx_activity_log_created_at" ON "activity_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_cases_client_id" ON "cases" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_cases_external_id" ON "cases" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "idx_cases_claim_type_label" ON "cases" USING btree ("claim_type_label");--> statement-breakpoint
CREATE INDEX "idx_cases_approval_date" ON "cases" USING btree ("approval_date");--> statement-breakpoint
CREATE INDEX "idx_cases_last_name" ON "cases" USING btree ("last_name");--> statement-breakpoint
CREATE INDEX "idx_daily_metrics_agent" ON "daily_metrics" USING btree ("agent_name");--> statement-breakpoint
CREATE INDEX "idx_daily_metrics_date" ON "daily_metrics" USING btree ("metric_date");--> statement-breakpoint
CREATE INDEX "idx_fee_records_case_id" ON "fee_records" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "idx_fee_records_assigned_to" ON "fee_records" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "idx_fee_records_win_sheet_status" ON "fee_records" USING btree ("win_sheet_status");--> statement-breakpoint
CREATE INDEX "idx_fee_records_sync_status" ON "fee_records" USING btree ("sync_status");--> statement-breakpoint
CREATE INDEX "idx_fee_records_pif" ON "fee_records" USING btree ("pif_ready_to_close");--> statement-breakpoint
CREATE INDEX "idx_notifications_type" ON "notifications" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_notifications_is_read" ON "notifications" USING btree ("is_read");--> statement-breakpoint
CREATE INDEX "idx_notifications_created_at" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_notifications_agent" ON "notifications" USING btree ("agent_name");--> statement-breakpoint
CREATE INDEX "idx_sync_logs_triggered_at" ON "sync_logs" USING btree ("triggered_at");