import "server-only";
import { auth } from "@/auth";
import type { Session } from "next-auth";

type AdminRole = "admin" | "system_admin";

export type AdminSession = Session & {
  user: NonNullable<Session["user"]> & { role: AdminRole };
};

export type AdminGuard =
  | { ok: true; session: AdminSession }
  | { ok: false; error: "Unauthenticated" | "Forbidden" };

/**
 * Server-side guard for admin-only operations. Returns a discriminated union
 * so callers (server actions, server components) can branch without try/catch.
 */
export async function requireAdmin(): Promise<AdminGuard> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Unauthenticated" };
  const role = session.user.role;
  if (role !== "admin" && role !== "system_admin") {
    return { ok: false, error: "Forbidden" };
  }
  return { ok: true, session: session as AdminSession };
}

export const isAdminRole = (role: string | undefined | null): role is AdminRole =>
  role === "admin" || role === "system_admin";
