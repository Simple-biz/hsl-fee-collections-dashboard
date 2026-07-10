"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { auth } from "@/auth";

const MIN_PASSWORD_LEN = 8;

type Result = { ok: true } | { ok: false; error: string };

/**
 * Self-service password change for the signed-in user. Requires the current
 * password (unlike the admin reset, which doesn't) so a hijacked/forgotten
 * open session can't silently change the password.
 */
export async function changeOwnPassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not signed in" };

  const userId = Number(session.user.id);
  if (!Number.isFinite(userId)) return { ok: false, error: "Invalid session" };

  if (input.newPassword.length < MIN_PASSWORD_LEN) {
    return {
      ok: false,
      error: `New password must be at least ${MIN_PASSWORD_LEN} characters`,
    };
  }
  if (input.newPassword === input.currentPassword) {
    return { ok: false, error: "New password must differ from the current one" };
  }

  try {
    const [user] = await db
      .select({
        id: users.id,
        passwordHash: users.passwordHash,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user || !user.isActive) return { ok: false, error: "Account not found" };

    const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
    if (!valid) return { ok: false, error: "Current password is incorrect" };

    const passwordHash = await bcrypt.hash(input.newPassword, 12);
    await db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, userId));

    return { ok: true };
  } catch (error) {
    console.error("changeOwnPassword error:", error);
    return { ok: false, error: "Server error" };
  }
}
