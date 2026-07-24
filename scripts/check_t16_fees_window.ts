import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { prepare: false, ssl: "require" });
  const db = drizzle(client);

  // How many T16-assigned cases have t16_fee_received > 0, and what date range?
  const [summary] = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE fr.t16_fee_received > 0)::int                        AS has_t16_received,
      COUNT(*) FILTER (WHERE fr.t16_fee_received > 0 AND fr.t16_fee_received_date IS NOT NULL)::int AS has_date,
      MIN(fr.t16_fee_received_date)                                                AS earliest_date,
      MAX(fr.t16_fee_received_date)                                                AS latest_date,
      COUNT(*) FILTER (WHERE fr.t16_fee_received > 0
        AND fr.t16_fee_received_date >= CURRENT_DATE - INTERVAL '30 days')::int   AS last_30d,
      COUNT(*) FILTER (WHERE fr.t16_fee_received > 0
        AND fr.t16_fee_received_date >= CURRENT_DATE - INTERVAL '7 days')::int    AS last_7d,
      COALESCE(SUM(CASE WHEN fr.t16_fee_received > 0
        AND fr.t16_fee_received_date >= CURRENT_DATE - INTERVAL '30 days'
        THEN fr.t16_fee_received::numeric END), 0)                                AS amount_30d,
      COALESCE(SUM(CASE WHEN fr.t16_fee_received > 0
        AND fr.t16_fee_received_date >= CURRENT_DATE - INTERVAL '7 days'
        THEN fr.t16_fee_received::numeric END), 0)                                AS amount_7d
    FROM fee_records fr
    JOIN team_members tm ON tm.name = fr.assigned_to AND tm.team = 'T16' AND tm.is_active = TRUE
  `) as unknown as [Record<string, unknown>];

  console.log("T16 fee_records summary:", JSON.stringify(summary, null, 2));

  // Also check fee_payments for T16 cases in recent windows
  const [ledger] = await db.execute(sql`
    SELECT
      COUNT(*)::int                                                                 AS total_payments,
      COUNT(*) FILTER (WHERE fp.received_date >= CURRENT_DATE - INTERVAL '30 days')::int AS last_30d,
      COUNT(*) FILTER (WHERE fp.received_date >= CURRENT_DATE - INTERVAL '7 days')::int  AS last_7d,
      COALESCE(SUM(CASE WHEN fp.received_date >= CURRENT_DATE - INTERVAL '30 days'
        THEN fp.amount::numeric END), 0)                                           AS amount_30d,
      COALESCE(SUM(CASE WHEN fp.received_date >= CURRENT_DATE - INTERVAL '7 days'
        THEN fp.amount::numeric END), 0)                                           AS amount_7d
    FROM fee_payments fp
    JOIN fee_records fr ON fr.case_id = fp.case_id
    JOIN team_members tm ON tm.name = fr.assigned_to AND tm.team = 'T16' AND tm.is_active = TRUE
  `) as unknown as [Record<string, unknown>];

  console.log("T16 fee_payments ledger:", JSON.stringify(ledger, null, 2));
}

main();
