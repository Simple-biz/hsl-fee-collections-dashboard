/**
 * TEST-ONLY: seed login accounts for exercising roles + access overrides.
 *
 *   npm run seed:test-users
 *
 * Generates random passwords on each run and prints them to stdout.
 * Requires migration 0018 (the `lead` enum value) to be applied first.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { users } from "../src/lib/db/schema";

const TEST_ROLES = ["admin", "lead", "member"] as const;
const TEST_EMAILS: Record<(typeof TEST_ROLES)[number], string> = {
  admin: "admin@hogansmith.com",
  lead: "lead@hogansmith.com",
  member: "member@hogansmith.com",
};
const TEST_NAMES: Record<(typeof TEST_ROLES)[number], string> = {
  admin: "Test Admin",
  lead: "Test Lead",
  member: "Test Member",
};

function generatePassword(): string {
  return randomBytes(12).toString("base64url");
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set. Run via: npm run seed:test-users");
    process.exit(1);
  }

  if (connectionString.includes("neon.tech") && !process.env.SEED_ALLOW_NEON) {
    console.error(
      "❌  DATABASE_URL points to a Neon endpoint. Refusing to seed.\n" +
      "    To seed the Neon test branch, set SEED_ALLOW_NEON=1:\n" +
      "    SEED_ALLOW_NEON=1 dotenv -e .env.neon-branch -- tsx scripts/seed-test-users.ts",
    );
    process.exit(1);
  }

  if (connectionString.includes("neon.tech") && process.env.SEED_ALLOW_NEON) {
    const host = new URL(connectionString).hostname;
    process.stdout.write(
      `⚠️   SEED_ALLOW_NEON is set. Writing to Neon host: ${host}\n` +
      `    Type "yes" to proceed: `,
    );
    const answer = await new Promise<string>((resolve) => {
      const cleanup = (val: string) => {
        process.stdin.removeListener("data", onData);
        process.stdin.removeListener("end", onEnd);
        process.stdin.removeListener("close", onEnd);
        resolve(val);
      };
      const onData = (d: Buffer) => cleanup(d.toString().trim());
      const onEnd = () => cleanup("");
      process.stdin.once("data", onData);
      process.stdin.once("end", onEnd);
      process.stdin.once("close", onEnd);
    });
    if (answer !== "yes") {
      console.log("Aborted.");
      process.exit(0);
    }
  }

  const client = postgres(connectionString, { max: 1, prepare: false });
  const db = drizzle(client, { schema: { users } });

  console.log("Generated test credentials (printed once — save these now):");
  console.log("─".repeat(60));

  try {
    for (const role of TEST_ROLES) {
      const email = TEST_EMAILS[role];
      const name = TEST_NAMES[role];
      const password = generatePassword();
      const passwordHash = await bcrypt.hash(password, 12);

      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existing) {
        await db
          .update(users)
          .set({
            passwordHash,
            name,
            role,
            isActive: true,
            mustChangePassword: false,
            updatedAt: new Date(),
          })
          .where(eq(users.id, existing.id));
        console.log(`✓ Updated  ${email}  password: ${password}`);
      } else {
        await db.insert(users).values({
          email,
          name,
          passwordHash,
          role,
          mustChangePassword: false,
        });
        console.log(`✓ Created  ${email}  password: ${password}`);
      }
    }
    console.log("─".repeat(60));
    console.log("Done.");
  } catch (err) {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
