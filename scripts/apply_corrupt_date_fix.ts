import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { prepare: false, ssl: "require" });
  const db = drizzle(client);

  const r1 = await db.execute(sql`
    UPDATE fee_records
    SET t16_fee_received_date = (t16_fee_received_date + INTERVAL '2000 years')::date
    WHERE t16_fee_received > 0
      AND t16_fee_received_date IS NOT NULL
      AND EXTRACT(YEAR FROM t16_fee_received_date) < 2000
  `);
  console.log("T16 rows fixed:", r1.count ?? 0);

  const r2 = await db.execute(sql`
    UPDATE fee_records
    SET t2_fee_received_date = (t2_fee_received_date + INTERVAL '2000 years')::date
    WHERE t2_fee_received > 0
      AND t2_fee_received_date IS NOT NULL
      AND EXTRACT(YEAR FROM t2_fee_received_date) < 2000
  `);
  console.log("T2 rows fixed:", r2.count ?? 0);

  const r3 = await db.execute(sql`
    UPDATE fee_records
    SET aux_fee_received_date = (aux_fee_received_date + INTERVAL '2000 years')::date
    WHERE aux_fee_received > 0
      AND aux_fee_received_date IS NOT NULL
      AND EXTRACT(YEAR FROM aux_fee_received_date) < 2000
  `);
  console.log("AUX rows fixed:", r3.count ?? 0);

  await client.end();
}

main();
