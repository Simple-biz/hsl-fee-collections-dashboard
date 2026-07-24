import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { prepare: false, ssl: "require" });
  const db = drizzle(client);

  const rows = await db.execute(sql`
    SELECT
      fr.case_id,
      fr.assigned_to,
      fr.t2_fee_received,
      fr.t2_fee_received_date,
      fr.updated_at,
      fr.created_at,
      (SELECT MAX(fp.received_date) FROM fee_payments fp
       WHERE fp.case_id = fr.case_id AND fp.fee_type = 't2') AS ledger_last_date,
      (SELECT MAX(fp.created_at)    FROM fee_payments fp
       WHERE fp.case_id = fr.case_id AND fp.fee_type = 't2') AS ledger_last_created
    FROM fee_records fr
    WHERE fr.t2_fee_received > 0
      AND fr.t2_fee_received_date IS NULL
    ORDER BY fr.t2_fee_received DESC
  `) as unknown as Record<string, unknown>[];

  console.log(JSON.stringify(rows, null, 2));
  await client.end();
}

main();
