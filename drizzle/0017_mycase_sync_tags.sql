CREATE TABLE "mycase_sync_tags" (
	"mycase_case_id" integer PRIMARY KEY NOT NULL,
	"tag" varchar(50) DEFAULT 'viewed' NOT NULL,
	"tagged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tagged_by" varchar(255)
);
