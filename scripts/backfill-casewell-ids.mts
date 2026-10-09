/**
 * Backfill casewell_id on user_details rows that have a chronicle_id but no casewell_id.
 *
 * Phase 1: resolve via Casewell by-legacy-id API (fast, definitive).
 * Phase 2 (fallback): for still-unresolved rows, search by claimant name.
 *   - Exactly 1 result whose name matches closely → high-confidence match.
 *   - Multiple plausible results → ambiguous, skipped and reported.
 *
 * Usage:
 *   npx dotenv-cli -e .env.local -- npx tsx scripts/backfill-casewell-ids.mts            # dry run
 *   npx dotenv-cli -e .env.local -- npx tsx scripts/backfill-casewell-ids.mts --apply    # write to DB
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { isNotNull, isNull, eq, sql } from "drizzle-orm";
import { userDetails, cases } from "../src/lib/db/schema";
import { getClientsByLegacyId, searchClients } from "../src/lib/casewell-client";

const DRY_RUN = !process.argv.includes("--apply");

const client = postgres(process.env.DATABASE_URL!, { prepare: false, ssl: "require" });
const db = drizzle(client);

console.log(DRY_RUN ? "=== DRY RUN (pass --apply to write) ===" : "=== APPLY MODE — writing to prod DB ===");
console.log();

// ─── 1. Fetch all user_details rows with chronicle_id but no casewell_id ─────

const rows = await db
  .select({
    caseId: userDetails.caseId,
    chronicleId: userDetails.chronicleId,
    firstName: cases.firstName,
    lastName: cases.lastName,
  })
  .from(userDetails)
  .innerJoin(cases, eq(cases.clientId, userDetails.caseId))
  .where(sql`${userDetails.chronicleId} IS NOT NULL AND ${userDetails.casewellId} IS NULL`);

console.log(`Found ${rows.length} rows with chronicle_id set but no casewell_id.`);
console.log();

if (rows.length === 0) {
  console.log("Nothing to backfill.");
  await client.end();
  process.exit(0);
}

// ─── Phase 1: by-legacy-id ────────────────────────────────────────────────────

const legacyIds = rows.map((r) => r.chronicleId as number);
console.log(`[Phase 1] Calling by-legacy-id for ${legacyIds.length} IDs (chunked at 200)…`);

const casewellMap = await getClientsByLegacyId(legacyIds);

const phase1Updates: { caseId: number; chronicleId: number; casewellId: string; source: "legacy-id" }[] = [];
const unresolved = rows.filter((r) => !casewellMap.has(r.chronicleId as number));

for (const row of rows) {
  const casewellId = casewellMap.get(row.chronicleId as number);
  if (casewellId) {
    phase1Updates.push({ caseId: row.caseId, chronicleId: row.chronicleId as number, casewellId, source: "legacy-id" });
  }
}

console.log(`  Resolved: ${phase1Updates.length}  |  Unresolved: ${unresolved.length}`);
console.log();

// ─── Phase 2: name-search fallback ───────────────────────────────────────────

const phase2Updates: { caseId: number; chronicleId: number; casewellId: string; name: string; source: "name-search" }[] = [];
const ambiguous: { caseId: number; chronicleId: number; name: string; matches: number }[] = [];
const stillUnresolved: { caseId: number; chronicleId: number; name: string }[] = [];

if (unresolved.length > 0) {
  console.log(`[Phase 2] Name-search fallback for ${unresolved.length} unresolved rows…`);

  for (const row of unresolved) {
    const fullName = `${row.firstName} ${row.lastName}`.trim();
    const searchName = row.lastName.trim();

    // Throttle to avoid 429s from the search endpoint.
    await new Promise((r) => setTimeout(r, 500));

    let results;
    try {
      const resp = await searchClients(searchName, { pageSize: 10 });
      results = resp.items;
    } catch (err) {
      console.warn(`  [warn] search error for "${searchName}":`, (err as Error).message);
      stillUnresolved.push({ caseId: row.caseId, chronicleId: row.chronicleId as number, name: fullName });
      continue;
    }

    if (results.length === 0) {
      stillUnresolved.push({ caseId: row.caseId, chronicleId: row.chronicleId as number, name: fullName });
      continue;
    }

    // Definitive: result carries a legacy_client_id that matches ours.
    const definitiveMatch = results.find((r) => r.legacy_client_id === (row.chronicleId as number));
    if (definitiveMatch) {
      phase2Updates.push({
        caseId: row.caseId,
        chronicleId: row.chronicleId as number,
        casewellId: String(definitiveMatch.id),
        name: fullName,
        source: "name-search",
      });
      continue;
    }

    // High-confidence: exactly 1 result whose name closely matches (both first + last).
    const normalise = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
    const normFirst = normalise(row.firstName);
    const normLast = normalise(row.lastName);

    const closeMatches = results.filter((r) => {
      const rNorm = normalise(r.claimant_name);
      return rNorm.includes(normFirst) && rNorm.includes(normLast);
    });

    if (closeMatches.length === 1) {
      phase2Updates.push({
        caseId: row.caseId,
        chronicleId: row.chronicleId as number,
        casewellId: String(closeMatches[0].id),
        name: fullName,
        source: "name-search",
      });
    } else if (closeMatches.length > 1) {
      ambiguous.push({ caseId: row.caseId, chronicleId: row.chronicleId as number, name: fullName, matches: closeMatches.length });
    } else {
      stillUnresolved.push({ caseId: row.caseId, chronicleId: row.chronicleId as number, name: fullName });
    }
  }

  console.log(`  High-confidence: ${phase2Updates.length}  |  Ambiguous: ${ambiguous.length}  |  Still unresolved: ${stillUnresolved.length}`);
  console.log();
}

// ─── Summary ──────────────────────────────────────────────────────────────────

const allUpdates = [...phase1Updates, ...phase2Updates];
console.log(`Total to write: ${allUpdates.length}  (${phase1Updates.length} via legacy-id + ${phase2Updates.length} via name-search)`);
console.log();

if (phase2Updates.length > 0) {
  console.log("Name-search matches (preview first 20):");
  for (const u of phase2Updates.slice(0, 20)) {
    console.log(`  case_id=${u.caseId}  chronicle_id=${u.chronicleId}  name="${u.name}"  →  casewell_id=${u.casewellId}`);
  }
  if (phase2Updates.length > 20) console.log(`  … and ${phase2Updates.length - 20} more`);
  console.log();
}

if (ambiguous.length > 0) {
  console.log(`Ambiguous (skipped — ${ambiguous.length}):`);
  for (const a of ambiguous) {
    console.log(`  case_id=${a.caseId}  chronicle_id=${a.chronicleId}  name="${a.name}"  matches=${a.matches}`);
  }
  console.log();
}

if (stillUnresolved.length > 0) {
  console.log(`Still unresolved (${stillUnresolved.length}):`);
  for (const u of stillUnresolved.slice(0, 20)) {
    console.log(`  case_id=${u.caseId}  chronicle_id=${u.chronicleId}  name="${u.name}"`);
  }
  if (stillUnresolved.length > 20) console.log(`  … and ${stillUnresolved.length - 20} more`);
  console.log();
}

if (DRY_RUN) {
  console.log("Dry run complete. Pass --apply to write these updates.");
  await client.end();
  process.exit(0);
}

if (allUpdates.length === 0) {
  console.log("Nothing to write.");
  await client.end();
  process.exit(0);
}

// ─── Apply ────────────────────────────────────────────────────────────────────

let applied = 0;
let skipped = 0;
for (const u of allUpdates) {
  try {
    await db
      .update(userDetails)
      .set({ casewellId: u.casewellId })
      .where(eq(userDetails.caseId, u.caseId));
    applied++;
  } catch (err) {
    skipped++;
    console.warn(
      `Skipped case_id=${u.caseId} chronicle_id=${u.chronicleId ?? "—"} name="${(u as { name?: string }).name ?? "—"}" casewellId=${u.casewellId}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

console.log(`Done. Updated ${applied} rows, skipped ${skipped} rows.`);
await client.end();
