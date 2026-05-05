import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";

const journal = JSON.parse(
  readFileSync("./drizzle/meta/_journal.json", "utf8"),
);
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
await sql`
  CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
    id SERIAL PRIMARY KEY,
    hash text NOT NULL,
    created_at bigint
  )
`;

for (const entry of journal.entries) {
  const file = readFileSync(`./drizzle/${entry.tag}.sql`, "utf8");
  const hash = createHash("sha256").update(file).digest("hex");
  const exists =
    await sql`SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = ${hash}`;
  if (exists.length) {
    console.log(`skip  ${entry.tag} (already marked)`);
    continue;
  }
  await sql`
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES (${hash}, ${entry.when})
  `;
  console.log(`mark  ${entry.tag} as applied`);
}

await sql.end();
