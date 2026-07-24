import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { prepare: false, ssl: "require" });
  const db = drizzle(client);

  const result = await db.execute(sql`
    UPDATE fee_records
    SET t2_fee_received_date = COALESCE(
      (SELECT MAX(fp.received_date)
       FROM fee_payments fp
       WHERE fp.case_id = fee_records.case_id
         AND fp.fee_type = 't2'),
      fee_records.created_at::date
    )
    WHERE t2_fee_received > 0
      AND t2_fee_received_date IS NULL
  `);

  console.log("Rows updated:", result.count ?? result);
  await client.end();
}

main();
