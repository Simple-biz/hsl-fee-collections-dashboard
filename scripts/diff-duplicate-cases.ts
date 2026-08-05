/**
 * Read-only follow-up to find-duplicate-cases.ts: for every duplicate
 * (lastName, firstName) group with all-synthetic client_ids, fetch each
 * row's full `cases` + `fee_records` data and report whether every row in
 * the group is byte-identical (ignoring id/clientId/createdAt/updatedAt/
 * syncedAt) or whether values drifted across sync runs.
 *
 * Usage:
 *   npx dotenv -e .env.local -- tsx scripts/diff-duplicate-cases.ts
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { inArray, eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";

const SYNTHETIC_ID_BASE = 900_000_000;
const IGNORE_KEYS = new Set([
  "id", "clientId", "caseId", "createdAt", "updatedAt", "syncedAt", "closedAt",
]);

const normalize = (row: Record<string, unknown>) => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (IGNORE_KEYS.has(k)) continue;
    out[k] = v instanceof Date ? v.toISOString() : v;
  }
  return out;
};

async function main() {
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

    // Only the sync-bug groups: >1 row, every clientId synthetic.
    const bugGroups = Array.from(groups.entries()).filter(
      ([, rows]) => rows.length > 1 && rows.every((r) => r.clientId >= SYNTHETIC_ID_BASE),
    );

    console.log(`${bugGroups.length} synthetic duplicate group(s) to diff.\n`);

    let identicalGroups = 0;
    let driftedGroups = 0;

    for (const [k, rows] of bugGroups) {
      const clientIds = rows.map((r) => r.clientId);
      const caseRows = await db
        .select()
        .from(schema.cases)
        .where(inArray(schema.cases.clientId, clientIds));
      const feeRows = await db
        .select()
        .from(schema.feeRecords)
        .where(inArray(schema.feeRecords.caseId, clientIds));

      const caseNorms = caseRows
        .sort((a, b) => a.clientId - b.clientId)
        .map((r) => JSON.stringify(normalize(r as unknown as Record<string, unknown>)));
      const feeNorms = feeRows
        .sort((a, b) => a.caseId - b.caseId)
        .map((r) => JSON.stringify(normalize(r as unknown as Record<string, unknown>)));

      const casesIdentical = new Set(caseNorms).size === 1;
      const feesIdentical = new Set(feeNorms).size === 1;

      const [lastName, firstName] = k.split("|");
      if (casesIdentical && feesIdentical) {
        identicalGroups++;
      } else {
        driftedGroups++;
        console.log(`DRIFT: "${lastName}, ${firstName}" (${rows.length} rows) — cases identical=${casesIdentical}, feeRecords identical=${feesIdentical}`);
        if (!feesIdentical) {
          // Show which fields differ between the first and last fee record.
          const sorted = feeRows.sort((a, b) => a.caseId - b.caseId);
          const first = normalize(sorted[0] as unknown as Record<string, unknown>);
          const last = normalize(sorted[sorted.length - 1] as unknown as Record<string, unknown>);
          for (const kk of Object.keys(first)) {
            if (JSON.stringify(first[kk]) !== JSON.stringify(last[kk])) {
              console.log(`    ${kk}: first=${JSON.stringify(first[kk])} last=${JSON.stringify(last[kk])}`);
            }
          }
        }
      }
    }

    console.log(`\nSummary: ${identicalGroups} groups fully identical, ${driftedGroups} groups drifted.`);
  } catch (err) {
    console.error("Diff failed:", err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
