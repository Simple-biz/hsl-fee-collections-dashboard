import "server-only";
import { auth } from "@/auth";
import type { Session } from "next-auth";
import type { CapabilityKey } from "@/lib/access/capabilities";
import { roleCapabilityDefaults } from "@/lib/access/capabilities";
import type { PageKey } from "@/lib/access/pages";
import { hasCapability, hasPageAccess, effectivePagesForSession } from "@/lib/access/resolve";

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

export type CapabilityGuard =
  | { ok: true; session: Session }
  | { ok: false; error: "Unauthenticated" | "Forbidden" };

/**
 * True iff an already-fetched session has the given capability. Reads the
 * effective capability set baked into the session at sign-in. Tokens minted
 * before capabilities existed have no `capabilities` array — for those we
 * fall back to the role defaults so existing sessions behave correctly until
 * next login. Use this (over requireCapability) when a route needs the
 * session regardless of the capability check's outcome — e.g. a "self or
 * this capability" rule where acting on your own resource is always allowed.
 */
export const sessionHasCapability = (
  session: Session | null | undefined,
  capability: CapabilityKey,
): boolean => {
  if (!session?.user) return false;
  const role = session.user.role;
  const rawCaps = session.user.capabilities;
  const isAdmin = role === "admin" || role === "system_admin";
  const caps = isAdmin
    ? roleCapabilityDefaults(role)
    : rawCaps && rawCaps.length > 0
      ? rawCaps
      : roleCapabilityDefaults(role);
  return hasCapability(caps, capability);
};

/**
 * Server-side guard for a capability (e.g. "case.create"). Rejects outright
 * when the session lacks it — use sessionHasCapability directly for routes
 * that need the session even when the capability check fails.
 */
export async function requireCapability(
  capability: CapabilityKey,
): Promise<CapabilityGuard> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Unauthenticated" };
  if (!sessionHasCapability(session, capability)) {
    return { ok: false, error: "Forbidden" };
  }
  return { ok: true, session };
}

export type PageAccessGuard =
  | { ok: true; session: Session }
  | { ok: false; error: "Unauthenticated" | "Forbidden" };

/**
 * True iff an already-fetched session has access to the given page. Mirrors
 * `sessionHasCapability`'s identical stale-token fallback: tokens minted
 * before per-page access existed have no `pages` array — fall back to the
 * role's defaults for those so existing sessions behave correctly until next
 * login.
 */
export const sessionHasPageAccess = (
  session: Session | null | undefined,
  pageKey: PageKey,
): boolean => {
  if (!session?.user) return false;
  const effectivePages = effectivePagesForSession(
    session.user.pages,
    session.user.role,
  );
  return hasPageAccess(effectivePages, pageKey);
};

/**
 * Server-side guard mirroring the page a route's data actually belongs to
 * (e.g. an /api/scoreboard route guarded by the "scoreboard" page). Several
 * routes only enforced "is logged in" via the edge middleware and nothing
 * else — this closes that gap by reusing the same effective-pages logic the
 * middleware and sidebar already use, so a route's access always matches
 * what the UI shows.
 */
export async function requirePageAccess(
  pageKey: PageKey,
): Promise<PageAccessGuard> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Unauthenticated" };
  if (!sessionHasPageAccess(session, pageKey)) {
    return { ok: false, error: "Forbidden" };
  }
  return { ok: true, session };
}

/** HTTP status for a failed capability/admin guard. */
export const guardStatus = (error: "Unauthenticated" | "Forbidden"): number =>
  error === "Unauthenticated" ? 401 : 403;
