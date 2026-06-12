/**
 * TEST-ONLY: seed login accounts for exercising roles + access overrides.
 *
 *   npm run seed:test-users
 *
 * ⚠️  These use weak, predictable passwords on purpose (easy testing). DELETE
 *     these accounts — and ideally this script — before production launch.
 *     Requires migration 0018 (the `lead` enum value) to be applied first.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { users } from "../src/lib/db/schema";

const TEST_USERS = [
  { email: "admin@hogansmith.com", password: "admin123", name: "Test Admin", role: "admin" },
  { email: "lead@hogansmith.com", password: "lead123", name: "Test Lead", role: "lead" },
  { email: "member@hogansmith.com", password: "member123", name: "Test Member", role: "member" },
] as const;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set. Run via: npm run seed:test-users");
    process.exit(1);
  }

  const client = postgres(connectionString, { max: 1, prepare: false });
  const db = drizzle(client, { schema: { users } });

  try {
    for (const u of TEST_USERS) {
      const passwordHash = await bcrypt.hash(u.password, 12);
      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, u.email))
        .limit(1);

      if (existing) {
        await db
          .update(users)
          .set({
            passwordHash,
            name: u.name,
            role: u.role,
            isActive: true,
            mustChangePassword: false,
            updatedAt: new Date(),
          })
          .where(eq(users.id, existing.id));
        console.log(`✓ Updated ${u.email} (${u.role})`);
      } else {
        await db.insert(users).values({
          email: u.email,
          name: u.name,
          passwordHash,
          role: u.role,
          mustChangePassword: false,
        });
        console.log(`✓ Created ${u.email} (${u.role})`);
      }
    }
    console.log("\nDone. ⚠️  Delete these test accounts before production.");
  } catch (err) {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
