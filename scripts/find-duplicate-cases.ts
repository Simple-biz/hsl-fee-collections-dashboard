/**
 * Read-only scan for duplicate `cases` rows caused by the Fees Closed sync
 * bug (fixed in src/app/api/sheets/fees-closed/sync/route.ts): unresolved
 * sheet rows used to get a brand-new synthetic client_id on every sync run
 * instead of updating the existing case, so the same person could end up
 * with N separate case + fee_record rows.
 *
 * Groups cases by normalized (lastName, firstName) and reports any group
 * with more than one row. Does not modify anything.
 *
 * Usage:
 *   npx dotenv -e .env.local -- tsx scripts/find-duplicate-cases.ts
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { inArray } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";

const SYNTHETIC_ID_BASE = 900_000_000;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set. Run via: npx dotenv -e .env.local -- tsx scripts/find-duplicate-cases.ts");
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
        caseLink: schema.cases.caseLink,
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

    const dupGroups = Array.from(groups.entries())
      .filter(([, rows]) => rows.length > 1)
      .sort((a, b) => b[1].length - a[1].length);

    if (dupGroups.length === 0) {
      console.log("No duplicate (lastName, firstName) groups found.");
      return;
    }

    const caseIds = dupGroups.flatMap(([, rows]) => rows.map((r) => r.clientId));
    const feeRecordRows = await db
      .select({ caseId: schema.feeRecords.caseId, isClosed: schema.feeRecords.isClosed })
      .from(schema.feeRecords)
      .where(inArray(schema.feeRecords.caseId, caseIds));
    const feeRecordMap = new Map(feeRecordRows.map((r) => [r.caseId, r.isClosed]));

    console.log(`${dupGroups.length} duplicate name group(s), ${caseIds.length} total rows:\n`);
    for (const [k, rows] of dupGroups) {
      const [lastName, firstName] = k.split("|");
      console.log(`"${lastName}, ${firstName}" — ${rows.length} rows`);
      for (const r of rows.sort((a, b) => a.clientId - b.clientId)) {
        const synthetic = r.clientId >= SYNTHETIC_ID_BASE ? "synthetic" : "real";
        const closed = feeRecordMap.get(r.clientId);
        console.log(
          `  id=${r.id} clientId=${r.clientId} (${synthetic}) isClosed=${closed ?? "no fee_record"} createdAt=${r.createdAt?.toISOString()} caseLink="${r.caseLink}"`,
        );
      }
      console.log("");
    }
  } catch (err) {
    console.error("Scan failed:", err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
