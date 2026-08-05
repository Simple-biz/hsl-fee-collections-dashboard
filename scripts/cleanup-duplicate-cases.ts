/**
 * Deletes the stale duplicate `cases` rows created by the Fees Closed sync
 * bug (fixed in src/app/api/sheets/fees-closed/sync/route.ts). For every
 * (lastName, firstName) group where every row has a *synthetic* client_id
 * (>= 900,000,000), keeps the row with the latest createdAt and deletes the
 * rest. `fee_records`/`activity_log`/etc. cascade-delete via the FK on
 * cases.clientId (onDelete: "cascade") — see src/lib/db/schema.ts.
 *
 * Groups where any row has a *real* (non-synthetic) client_id are never
 * touched — those are legitimate distinct cases that happen to share a name
 * (confirmed manually for "Jackson, Melissa" and "Edwards, Lisa").
 *
 * Defaults to a dry run (prints what would be deleted, changes nothing).
 * Pass --apply to actually delete.
 *
 * Usage:
 *   npx dotenv -e .env.local -- tsx scripts/cleanup-duplicate-cases.ts            # dry run
 *   npx dotenv -e .env.local -- tsx scripts/cleanup-duplicate-cases.ts --apply    # deletes
 *
 * Take a full backup first: scripts/backup-full-export.ts
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { inArray, and, gte } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";

const SYNTHETIC_ID_BASE = 900_000_000;

async function main() {
  const apply = process.argv.includes("--apply");

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const client = postgres(connectionString, { max: 1, prepare: false });
  const db = drizzle(client, { schema });

  try {
    const allCases = await db
      .select({
        id: schema.cases.id,
        clientId: schema.cases.clientId,
        firstName: schema.cases.firstName,
        lastName: schema.cases.lastName,
        createdAt: schema.cases.createdAt,
      })
      .from(schema.cases);

    const key = (r: { firstName: string; lastName: string }) =>
      `${r.lastName.trim().toLowerCase()}|${r.firstName.trim().toLowerCase()}`;

    const groups = new Map<string, typeof allCases>();
    for (const r of allCases) {
      const k = key(r);
      const arr = groups.get(k) ?? [];
      arr.push(r);
      groups.set(k, arr);
    }

    const bugGroups = Array.from(groups.entries()).filter(
      ([, rows]) => rows.length > 1 && rows.every((r) => r.clientId >= SYNTHETIC_ID_BASE),
    );

    const toDelete: number[] = [];
    const toKeep: number[] = [];

    for (const [k, rows] of bugGroups) {
      const sorted = [...rows].sort((a, b) => {
        const at = a.createdAt?.getTime() ?? 0;
        const bt = b.createdAt?.getTime() ?? 0;
        if (at !== bt) return bt - at; // newest first
        return b.clientId - a.clientId;
      });
      const keep = sorted[0];
      const drop = sorted.slice(1);
      toKeep.push(keep.clientId);
      toDelete.push(...drop.map((r) => r.clientId));

      const [lastName, firstName] = k.split("|");
      console.log(
        `"${lastName}, ${firstName}": keep clientId=${keep.clientId} (createdAt=${keep.createdAt?.toISOString()}), delete ${drop.length} row(s): [${drop.map((r) => r.clientId).join(", ")}]`,
      );
    }

    console.log(
      `\n${bugGroups.length} groups, ${toKeep.length} rows to keep, ${toDelete.length} rows to delete.`,
    );

    if (!apply) {
      console.log("\nDry run only — no changes made. Re-run with --apply to delete.");
      return;
    }

    if (toDelete.length === 0) {
      console.log("Nothing to delete.");
      return;
    }

    await db.transaction(async (tx) => {
      const deleted = await tx
        .delete(schema.cases)
        .where(and(inArray(schema.cases.clientId, toDelete), gte(schema.cases.clientId, SYNTHETIC_ID_BASE)))
        .returning({ clientId: schema.cases.clientId });
      console.log(`\n✓ Deleted ${deleted.length} case rows (and cascaded fee_records/activity_log/etc.).`);
      if (deleted.length !== toDelete.length) {
        throw new Error(
          `Expected to delete ${toDelete.length} rows but deleted ${deleted.length} — rolling back.`,
        );
      }
    });
  } catch (err) {
    console.error("Cleanup failed:", err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
