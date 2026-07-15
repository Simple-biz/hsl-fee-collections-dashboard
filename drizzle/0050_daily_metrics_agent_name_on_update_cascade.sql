ALTER TABLE "daily_metrics" DROP CONSTRAINT "daily_metrics_agent_name_fkey";
--> statement-breakpoint
ALTER TABLE "daily_metrics" ADD CONSTRAINT "daily_metrics_agent_name_team_members_name_fk" FOREIGN KEY ("agent_name") REFERENCES "public"."team_members"("name") ON DELETE no action ON UPDATE cascade;