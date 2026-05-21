/**
 * Create or update a dashboard login account.
 *
 * Accounts are admin-seeded (no public sign-up), so use this script to add
 * users. If the email already exists, its password / name / role are updated.
 *
 * Usage (DATABASE_URL is loaded from .env.local by the npm script):
 *   npm run user:create -- --email you@hogansmith.com --password "secret" --name "Jane Doe" --role admin
 *
 * Flags:
 *   --email     (required)  login email, stored lowercased
 *   --password  (required)  plaintext password; hashed with bcrypt before storage
 *   --name      (optional)  display name
 *   --role      (optional)  "admin" | "member" | "system_admin"  (default: member)
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { users } from "../src/lib/db/schema";

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = "true";
      }
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const email = (args.email ?? "").toLowerCase().trim();
  const password = args.password ?? "";
  const name = args.name?.trim() || null;
  const role = (args.role ?? "member").trim();

  if (!email || !password) {
    console.error(
      'Missing required flags.\n\n  npm run user:create -- --email you@hogansmith.com --password "secret" --name "Jane Doe" --role admin\n',
    );
    process.exit(1);
  }

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error(`Invalid email: ${email}`);
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  if (role !== "admin" && role !== "member" && role !== "system_admin") {
    console.error(
      `Invalid role: ${role} (expected "admin", "member", or "system_admin")`,
    );
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error(
      "DATABASE_URL is not set. Run via: npm run user:create -- ...",
    );
    process.exit(1);
  }

  const client = postgres(connectionString, { max: 1, prepare: false });
  const db = drizzle(client, { schema: { users } });

  try {
    const passwordHash = await bcrypt.hash(password, 12);

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing) {
      await db
        .update(users)
        .set({ passwordHash, name, role, isActive: true, updatedAt: new Date() })
        .where(eq(users.id, existing.id));
      console.log(`✓ Updated existing user: ${email} (role: ${role})`);
    } else {
      await db.insert(users).values({ email, name, passwordHash, role });
      console.log(`✓ Created user: ${email} (role: ${role})`);
    }
  } catch (err) {
    console.error("Failed to create/update user:", err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
