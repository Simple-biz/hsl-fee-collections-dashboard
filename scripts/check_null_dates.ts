import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { prepare: false, ssl: "require" });
  const db = drizzle(client);

  const [r] = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE t16_fee_received > 0 AND t16_fee_received_date IS NULL)::int AS t16_null_date,
      COUNT(*) FILTER (WHERE t2_fee_received  > 0 AND t2_fee_received_date  IS NULL)::int AS t2_null_date,
      COUNT(*) FILTER (WHERE aux_fee_received > 0 AND aux_fee_received_date IS NULL)::int AS aux_null_date,
      COALESCE(SUM(CASE WHEN t16_fee_received > 0 AND t16_fee_received_date IS NULL THEN t16_fee_received::numeric ELSE 0 END), 0) AS t16_hidden,
      COALESCE(SUM(CASE WHEN t2_fee_received  > 0 AND t2_fee_received_date  IS NULL THEN t2_fee_received::numeric  ELSE 0 END), 0) AS t2_hidden,
      COALESCE(SUM(CASE WHEN aux_fee_received > 0 AND aux_fee_received_date IS NULL THEN aux_fee_received::numeric ELSE 0 END), 0) AS aux_hidden
    FROM fee_records
  `) as unknown as [Record<string, unknown>];

  console.log(JSON.stringify(r, null, 2));
  await client.end();
}

main();
