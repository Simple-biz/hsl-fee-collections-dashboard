import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { prepare: false, ssl: "require" });
  const db = drizzle(client);

  const rows = await db.execute(sql`
    SELECT
      't16' AS fee_type,
      COUNT(*)::int                                         AS corrupted_count,
      COALESCE(SUM(t16_fee_received::numeric), 0)          AS hidden_amount,
      MIN(t16_fee_received_date)                           AS earliest,
      MAX(t16_fee_received_date)                           AS latest
    FROM fee_records
    WHERE t16_fee_received > 0
      AND EXTRACT(YEAR FROM t16_fee_received_date) < 2000

    UNION ALL

    SELECT
      't2' AS fee_type,
      COUNT(*)::int,
      COALESCE(SUM(t2_fee_received::numeric), 0),
      MIN(t2_fee_received_date),
      MAX(t2_fee_received_date)
    FROM fee_records
    WHERE t2_fee_received > 0
      AND EXTRACT(YEAR FROM t2_fee_received_date) < 2000

    UNION ALL

    SELECT
      'aux' AS fee_type,
      COUNT(*)::int,
      COALESCE(SUM(aux_fee_received::numeric), 0),
      MIN(aux_fee_received_date),
      MAX(aux_fee_received_date)
    FROM fee_records
    WHERE aux_fee_received > 0
      AND EXTRACT(YEAR FROM aux_fee_received_date) < 2000
  `) as unknown as Record<string, unknown>[];

  console.log(JSON.stringify(rows, null, 2));
  await client.end();
}

main();
