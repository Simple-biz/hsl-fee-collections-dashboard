import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { prepare: false, ssl: "require" });
  const db = drizzle(client);

  // 1. Active T16 team members
  const members = await db.execute(sql`
    SELECT name FROM team_members WHERE team = 'T16' AND is_active = TRUE ORDER BY name
  `) as unknown as { name: string }[];
  console.log("T16 members:", members.map(m => m.name));

  // 2. For each member: what fee_payments with received_date in last 7 days do they have?
  const ledger = await db.execute(sql`
    SELECT
      fr.assigned_to,
      COUNT(fp.id)::int   AS payment_count,
      SUM(fp.amount)      AS total_amount,
      MIN(fp.received_date) AS earliest,
      MAX(fp.received_date) AS latest
    FROM fee_payments fp
    JOIN fee_records fr ON fr.case_id = fp.case_id
    WHERE fp.received_date >= CURRENT_DATE - INTERVAL '7 days'
    GROUP BY fr.assigned_to
    ORDER BY total_amount DESC NULLS LAST
    LIMIT 20
  `) as unknown as Record<string, unknown>[];
  console.log("\nAll agents with fee_payments in last 7 days:");
  console.log(JSON.stringify(ledger, null, 2));

  // 3. Check if ANY T16 member name matches assigned_to in fee_records
  const mismatch = await db.execute(sql`
    SELECT
      tm.name AS team_member_name,
      COUNT(DISTINCT fr.case_id)::int AS cases_with_fees,
      COALESCE(SUM(fr.t16_fee_received::numeric),0) AS t16_total
    FROM team_members tm
    LEFT JOIN fee_records fr ON fr.assigned_to = tm.name AND fr.t16_fee_received > 0
    WHERE tm.team = 'T16' AND tm.is_active = TRUE
    GROUP BY tm.name
    ORDER BY t16_total DESC
  `) as unknown as Record<string, unknown>[];
  console.log("\nT16 member → fee_records attribution:");
  console.log(JSON.stringify(mismatch, null, 2));

  await client.end();
}
main();
