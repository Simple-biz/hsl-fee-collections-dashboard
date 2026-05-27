// Read-only pre-flight check before running `npm run db:migrate` against
// prod. Lists every migration already applied (in drizzle.__drizzle_migrations)
// and every migration on disk (drizzle/meta/_journal.json), so you can
// confirm the diff matches your expectations before mutating prod.
//
// Run with:  node --env-file=.env.local scripts/preflight-migrate.mjs

import { readFile } from "node:fs/promises";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set (did you load .env.local?)");
  process.exit(1);
}

// Quick masked print so you can confirm you're pointed at prod.
const masked = url.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:****@");
console.log(`DB:  ${masked}\n`);

const sql = postgres(url, { max: 1, prepare: false });

try {
  // Migrations on disk
  const journal = JSON.parse(
    await readFile(new URL("../drizzle/meta/_journal.json", import.meta.url)),
  );
  const journalTags = journal.entries.map((e) => e.tag);

  // Migrations applied in this DB
  const rows = await sql`
    SELECT id, hash, created_at
    FROM drizzle.__drizzle_migrations
    ORDER BY created_at ASC
  `;

  console.log(`Applied in DB:        ${rows.length}`);
  console.log(`On disk (journal):    ${journalTags.length}`);
  console.log(`Pending:              ${journalTags.length - rows.length}\n`);

  console.log("Journal tags (in order):");
  for (let i = 0; i < journalTags.length; i++) {
    const status = i < rows.length ? "✓ applied" : "→ PENDING";
    console.log(`  [${i.toString().padStart(2, "0")}] ${status}  ${journalTags[i]}`);
  }
} catch (err) {
  console.error("\nPre-flight failed:", err.message);
  process.exit(1);
} finally {
  await sql.end({ timeout: 1 });
}
