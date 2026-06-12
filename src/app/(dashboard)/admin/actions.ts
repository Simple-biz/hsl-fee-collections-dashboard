"use server";

import bcrypt from "bcryptjs";
import { eq, and, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { users, userAccessOverrides } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth-helpers";
import { PAGE_KEYS, type PageKey } from "@/lib/access/pages";
import { rolePageDefaults } from "@/lib/access/role-defaults";
import {
  CAPABILITY_KEYS,
  roleCapabilityDefaults,
  type CapabilityKey,
} from "@/lib/access/capabilities";
import {
  effectivePages,
  effectiveCapabilities,
  type AccessOverrides,
  type PageOverrides,
  type CapabilityOverrides,
} from "@/lib/access/resolve";

type ActionResult<T = void> = T extends void
  ? { ok: true; warning?: string } | { ok: false; error: string }
  : ({ ok: true; warning?: string } & T) | { ok: false; error: string };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MIN_PASSWORD_LEN = 8;
const ROLES = ["admin", "lead", "member", "system_admin"] as const;
type Role = (typeof ROLES)[number];

const isRole = (v: unknown): v is Role => ROLES.includes(v as Role);

/** Returns true iff `targetId` is the last enabled system_admin in the DB. */
async function isLastSystemAdmin(targetId: number): Promise<boolean> {
  const [row] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(users)
    .where(
      and(
        eq(users.role, "system_admin"),
        eq(users.isActive, true),
        ne(users.id, targetId),
      ),
    );
  return (row?.n ?? 0) === 0;
}

export async function createUser(input: {
  email: string;
  password: string;
  name?: string | null;
  role: Role;
  mustChangePassword?: boolean;
}): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const email = input.email.toLowerCase().trim();
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Invalid email" };
  if (input.password.length < MIN_PASSWORD_LEN) {
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LEN} characters` };
  }
  if (!isRole(input.role)) return { ok: false, error: "Invalid role" };

  try {
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing.length > 0) {
      return { ok: false, error: "A user with that email already exists" };
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    await db.insert(users).values({
      email,
      name: input.name?.trim() || null,
      passwordHash,
      role: input.role,
      mustChangePassword: input.mustChangePassword ?? true,
    });

    revalidatePath("/admin");

    const webhookUrl = process.env.N8N_NEW_USER_EMAIL_WEBHOOK_URL;
    if (webhookUrl) {
      try {
        const emailRes = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password: input.password,
            name: input.name?.trim() || null,
            role: input.role,
          }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!emailRes.ok) {
          console.error("Welcome email webhook failed:", emailRes.status);
          return { ok: true, warning: `User created but welcome email could not be sent (webhook ${emailRes.status}).` };
        }
      } catch (err) {
        console.error("Welcome email webhook error:", err);
        return { ok: true, warning: "User created but welcome email could not be sent (network error)." };
      }
    }

    return { ok: true };
  } catch (error) {
    console.error("createUser error:", error);
    return { ok: false, error: "Server error" };
  }
}

export async function updateUserRole(input: {
  userId: number;
  role: Role;
}): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  if (!Number.isFinite(input.userId)) return { ok: false, error: "Invalid user id" };
  if (!isRole(input.role)) return { ok: false, error: "Invalid role" };

  const callerId = Number(guard.session.user.id);
  if (input.userId === callerId) {
    return { ok: false, error: "You can't change your own role" };
  }

  try {
    const [target] = await db
      .select({ id: users.id, role: users.role, isActive: users.isActive })
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1);
    if (!target) return { ok: false, error: "User not found" };

    if (
      target.role === "system_admin" &&
      input.role !== "system_admin" &&
      target.isActive &&
      (await isLastSystemAdmin(target.id))
    ) {
      return { ok: false, error: "Can't demote the last active system_admin" };
    }

    await db
      .update(users)
      .set({ role: input.role, updatedAt: new Date() })
      .where(eq(users.id, input.userId));

    revalidatePath("/admin");
    return { ok: true };
  } catch (error) {
    console.error("updateUserRole error:", error);
    return { ok: false, error: "Server error" };
  }
}

export async function setUserActive(input: {
  userId: number;
  isActive: boolean;
}): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  if (!Number.isFinite(input.userId)) return { ok: false, error: "Invalid user id" };

  const callerId = Number(guard.session.user.id);
  if (input.userId === callerId) {
    return { ok: false, error: "You can't deactivate your own account" };
  }

  try {
    const [target] = await db
      .select({ id: users.id, role: users.role, isActive: users.isActive })
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1);
    if (!target) return { ok: false, error: "User not found" };

    if (
      !input.isActive &&
      target.role === "system_admin" &&
      target.isActive &&
      (await isLastSystemAdmin(target.id))
    ) {
      return { ok: false, error: "Can't deactivate the last active system_admin" };
    }

    await db
      .update(users)
      .set({ isActive: input.isActive, updatedAt: new Date() })
      .where(eq(users.id, input.userId));

    revalidatePath("/admin");
    return { ok: true };
  } catch (error) {
    console.error("setUserActive error:", error);
    return { ok: false, error: "Server error" };
  }
}

export async function resetUserPassword(input: {
  userId: number;
  password: string;
  mustChangePassword?: boolean;
}): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  if (!Number.isFinite(input.userId)) return { ok: false, error: "Invalid user id" };
  if (input.password.length < MIN_PASSWORD_LEN) {
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LEN} characters` };
  }

  try {
    const passwordHash = await bcrypt.hash(input.password, 12);
    const result = await db
      .update(users)
      .set({ passwordHash, mustChangePassword: input.mustChangePassword ?? true, updatedAt: new Date() })
      .where(eq(users.id, input.userId));

    if (result.length === 0) {
      // postgres-js doesn't return rowCount on UPDATE the same as pg; check separately.
    }

    revalidatePath("/admin");
    return { ok: true };
  } catch (error) {
    console.error("resetUserPassword error:", error);
    return { ok: false, error: "Server error" };
  }
}

// ---- Access overrides (page-level) -----------------------------------------

/** Load a user's page access for the admin modal: role default, the stored
 *  deviations, and the resolved effective set. */
export async function getUserAccess(input: {
  userId: number;
}): Promise<
  ActionResult<{
    role: Role;
    defaultPages: PageKey[];
    overrides: PageOverrides;
    effectivePages: PageKey[];
    defaultCapabilities: CapabilityKey[];
    effectiveCapabilities: CapabilityKey[];
  }>
> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!Number.isFinite(input.userId)) {
    return { ok: false, error: "Invalid user id" };
  }

  try {
    const [user] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1);
    if (!user) return { ok: false, error: "User not found" };

    const [ov] = await db
      .select({ overrides: userAccessOverrides.overrides })
      .from(userAccessOverrides)
      .where(eq(userAccessOverrides.userId, input.userId))
      .limit(1);

    const stored = (ov?.overrides as AccessOverrides) ?? {};
    const pageOverrides = stored.pages ?? {};
    const capOverrides = stored.capabilities ?? {};
    return {
      ok: true,
      role: user.role as Role,
      defaultPages: rolePageDefaults(user.role),
      overrides: pageOverrides,
      effectivePages: effectivePages(user.role, { pages: pageOverrides }),
      defaultCapabilities: roleCapabilityDefaults(user.role),
      effectiveCapabilities: effectiveCapabilities(user.role, {
        capabilities: capOverrides,
      }),
    };
  } catch (error) {
    console.error("getUserAccess error:", error);
    return { ok: false, error: "Server error" };
  }
}

/** Save a user's page access. The client sends the full grant map (pageKey →
 *  granted); we persist ONLY deviations from the role default, so "Apply Role
 *  Defaults" (all-matching) stores an empty override. Takes effect on the
 *  user's next login (access is baked into their token at sign-in). */
export async function updateUserAccess(input: {
  userId: number;
  pages: Record<string, boolean>;
  capabilities?: Record<string, boolean>;
}): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!Number.isFinite(input.userId)) {
    return { ok: false, error: "Invalid user id" };
  }

  try {
    const [user] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1);
    if (!user) return { ok: false, error: "User not found" };

    const pageDefaults = new Set(rolePageDefaults(user.role));
    const deviations: PageOverrides = {};
    for (const key of PAGE_KEYS) {
      const granted = input.pages[key];
      if (granted === undefined) continue;
      if (granted !== pageDefaults.has(key)) deviations[key] = granted;
    }

    const capDefaults = new Set(roleCapabilityDefaults(user.role));
    const capDeviations: CapabilityOverrides = {};
    for (const key of CAPABILITY_KEYS) {
      const granted = input.capabilities?.[key];
      if (granted === undefined) continue;
      if (granted !== capDefaults.has(key)) capDeviations[key] = granted;
    }

    const overrides: AccessOverrides = {
      pages: deviations,
      capabilities: capDeviations,
    };
    await db
      .insert(userAccessOverrides)
      .values({ userId: input.userId, overrides })
      .onConflictDoUpdate({
        target: userAccessOverrides.userId,
        set: { overrides, updatedAt: new Date() },
      });

    revalidatePath("/admin");
    return { ok: true };
  } catch (error) {
    console.error("updateUserAccess error:", error);
    return { ok: false, error: "Server error" };
  }
}
