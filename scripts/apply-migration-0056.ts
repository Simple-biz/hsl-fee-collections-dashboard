/**
 * Applies migration 0056 (partial indexes) outside a transaction.
 *
 * CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
 * drizzle-kit's `db:migrate` wraps every migration in BEGIN/COMMIT, so
 * running this via the standard path would fail with:
 *   "ERROR: CREATE INDEX CONCURRENTLY cannot run inside a transaction block"
 *
 * This script connects directly (no transaction wrapper), creates both
 * indexes with IF NOT EXISTS so it is safe to re-run, then records the
 * migration in drizzle's tracking table so `db:migrate` won't try to apply
 * 0056 again.
 *
 * Usage:
 *   npm run apply-migration-0056
 *
 * Rollback (safe at any time, no data change):
 *   DROP INDEX CONCURRENTLY IF EXISTS idx_fee_records_follow_up_open;
 *   DROP INDEX CONCURRENTLY IF EXISTS idx_inbound_call_records_unresolved;
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

function migrationHash(): string {
  const migrationPath = join(
    import.meta.dirname ?? __dirname,
    "../drizzle/0056_add_partial_indexes_follow_up_and_backlog.sql",
  );
  const content = readFileSync(migrationPath, "utf8");
  return createHash("sha256").update(content).digest("hex");
}

async function main() {
  console.log("Applying migration 0056 (partial indexes)…\n");

  // Check if already applied
  const existing = await sql`
    SELECT id FROM "drizzle"."__drizzle_migrations"
    WHERE hash = ${migrationHash()}
    LIMIT 1
  `;
  if (existing.length > 0) {
    console.log("Migration 0056 already recorded in __drizzle_migrations — skipping.");
    await sql.end();
    return;
  }

  console.log("Creating idx_fee_records_follow_up_open…");
  await sql`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_fee_records_follow_up_open"
    ON "fee_records" USING btree ("next_follow_up_date")
    WHERE is_closed = false
  `;
  console.log("  ✓ done");

  console.log("Creating idx_inbound_call_records_unresolved…");
  await sql`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_inbound_call_records_unresolved"
    ON "inbound_call_records" USING btree ("called_back_resolved")
    WHERE called_back_resolved = false
  `;
  console.log("  ✓ done");

  console.log("\nRecording migration in drizzle.__drizzle_migrations…");
  await sql`
    INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at)
    VALUES (${migrationHash()}, ${Date.now()})
    ON CONFLICT DO NOTHING
  `;
  console.log("  ✓ done");

  console.log("\nMigration 0056 applied successfully.");
  await sql.end();
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
