/**
 * Applies migrations 0056 and 0057 to the Neon test branch.
 *
 * 0056 uses CREATE INDEX CONCURRENTLY which cannot run inside a transaction.
 * On the test branch we drop CONCURRENTLY (no production load, locking is fine).
 * 0057 disables triggers around data updates — applied inside a transaction.
 *
 * Both are recorded in drizzle's tracking table so db:migrate won't re-apply them.
 *
 * Usage:
 *   dotenv -e .env.neon-branch -- npx tsx scripts/apply-migrations-0056-0057-neon-branch.ts
 */

import postgres from "postgres";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const sql = postgres(connectionString, { prepare: false });

function migrationHash(filename: string): string {
  const filePath = join(process.cwd(), "drizzle", filename);
  const content = readFileSync(filePath, "utf8");
  return createHash("sha256").update(content).digest("hex");
}

async function recordMigration(name: string, hash: string) {
  await sql`
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES (${hash}, ${Date.now()})
    ON CONFLICT DO NOTHING
  `;
  console.log(`✓ Recorded ${name} in drizzle.__drizzle_migrations`);
}

async function main() {
  // ── 0056: partial indexes (no CONCURRENTLY on test branch) ──────────────
  console.log("Applying 0056 partial indexes...");
  await sql`
    CREATE INDEX IF NOT EXISTS "idx_fee_records_follow_up_open"
    ON "fee_records" USING btree ("next_follow_up_date")
    WHERE is_closed = false
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS "idx_inbound_call_records_unresolved"
    ON "inbound_call_records" USING btree ("called_back_resolved")
    WHERE called_back_resolved = false
  `;
  await recordMigration(
    "0056",
    migrationHash("0056_add_partial_indexes_follow_up_and_backlog.sql"),
  );

  // ── 0057: normalize enum spellings ──────────────────────────────────────
  console.log("Applying 0057 enum normalization...");
  await sql`UPDATE "cases" SET "level_won" = 'FEE PETITION' WHERE "level_won" = 'FEE_PETITION'`;
  await sql`UPDATE "cases" SET "level_won" = 'RECON' WHERE "level_won" = 'RECONSIDERATION'`;
  await sql`UPDATE "cases" SET "claim_type_label" = 'CONC' WHERE "claim_type_label" = 'T2_T16'`;
  await sql`ALTER TABLE "fee_records" DISABLE TRIGGER "trg_fee_records_compute_totals"`;
  await sql`ALTER TABLE "fee_records" DISABLE TRIGGER "trg_fee_records_updated_at"`;
  await sql`UPDATE "fee_records" SET "win_sheet_status" = 'Started' WHERE "win_sheet_status" = 'started'`;
  await sql`UPDATE "fee_records" SET "win_sheet_status" = 'Finished' WHERE "win_sheet_status" IN ('paid_in_full', 'closed')`;
  await sql`ALTER TABLE "fee_records" ENABLE TRIGGER "trg_fee_records_compute_totals"`;
  await sql`ALTER TABLE "fee_records" ENABLE TRIGGER "trg_fee_records_updated_at"`;
  await recordMigration(
    "0057",
    migrationHash("0057_normalize_enum_spellings.sql"),
  );

  console.log("Done. Run db:migrate to apply 0058.");
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
