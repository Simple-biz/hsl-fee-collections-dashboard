"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { auth, signOut } from "@/auth";

const MIN_PASSWORD_LEN = 8;

type Result = { ok: true } | { ok: false; error: string };

export async function setNewPassword(input: {
  newPassword: string;
  confirmPassword: string;
}): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not signed in" };

  const userId = Number(session.user.id);
  if (!Number.isFinite(userId)) return { ok: false, error: "Invalid session" };

  if (input.newPassword.length < MIN_PASSWORD_LEN) {
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LEN} characters` };
  }
  if (input.newPassword !== input.confirmPassword) {
    return { ok: false, error: "Passwords do not match" };
  }

  try {
    const [user] = await db
      .select({ id: users.id, isActive: users.isActive })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user || !user.isActive) return { ok: false, error: "Account not found" };

    const passwordHash = await bcrypt.hash(input.newPassword, 12);
    await db
      .update(users)
      .set({ passwordHash, mustChangePassword: false, updatedAt: new Date() })
      .where(eq(users.id, userId));

    await signOut({ redirect: false });
    return { ok: true };
  } catch (error) {
    console.error("setNewPassword error:", error);
    return { ok: false, error: "Server error" };
  }
}
