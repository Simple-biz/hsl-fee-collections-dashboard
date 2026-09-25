/**
 * Shared helpers for API route handler tests.
 *
 * Usage pattern — each test file:
 *   1. vi.mock("server-only", () => ({}))
 *   2. vi.mock("@/auth", () => ({ auth: vi.fn() }))
 *   3. vi.mock("@/lib/db", () => ({ db: mockDb }))
 *   4. Import the route under test
 *   5. Use makeSession / makeReq / makeCtx to drive it
 */

import { vi } from "vitest";
import { NextRequest } from "next/server";
import type { Session } from "next-auth";

export type AppRole = "member" | "lead" | "admin" | "system_admin";

interface SessionOptions {
  pages?: string[];
  capabilities?: string[];
  mustChangePassword?: boolean;
}

/** Build a minimal NextAuth Session for a given role. */
export function makeSession(
  role: AppRole = "member",
  opts: SessionOptions = {},
): Session {
  return {
    user: {
      id: "test-1",
      name: "Test User",
      email: "test@hsl.test",
      role,
      mustChangePassword: opts.mustChangePassword ?? false,
      pages: opts.pages ?? [],
      capabilities: opts.capabilities ?? [],
    },
    expires: new Date(Date.now() + 3_600_000).toISOString(),
  };
}

/** Build a NextRequest for a route handler. */
export function makeReq(
  method: string,
  body?: unknown,
  url = "http://localhost/api/test",
): NextRequest {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new NextRequest(url, init);
}

/** Build the route context object expected by dynamic segment handlers. */
export function makeCtx(id: string | number) {
  return { params: Promise.resolve({ id: String(id) }) };
}

/**
 * A minimal chainable db mock. Every method returns itself so Drizzle-style
 * fluent chains (.select().from().where()) resolve without errors. Terminal
 * operations resolve to empty arrays. Auth-guard tests never reach the DB;
 * this mock prevents import-time errors and catches unexpected DB calls.
 */
export const mockDb = {
  select: vi.fn(),
  execute: vi.fn().mockResolvedValue([]),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

// Wire up the fluent chain: each method returns an object whose every property
// is either another mock (for chaining) or a Promise (for the terminal call).
const chain = {
  from: vi.fn(),
  where: vi.fn(),
  leftJoin: vi.fn(),
  innerJoin: vi.fn(),
  groupBy: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn().mockResolvedValue([]),
  offset: vi.fn().mockResolvedValue([]),
  execute: vi.fn().mockResolvedValue([]),
  values: vi.fn(),
  set: vi.fn(),
  onConflictDoUpdate: vi.fn().mockResolvedValue([]),
  returning: vi.fn().mockResolvedValue([]),
};
// Make every non-terminal method return the same chain so arbitrary depth works.
Object.keys(chain).forEach((k) => {
  const fn = chain[k as keyof typeof chain];
  if (typeof fn === "function" && !String(fn).includes("mockResolvedValue")) {
    (fn as ReturnType<typeof vi.fn>).mockReturnValue(chain);
  }
});

mockDb.select.mockReturnValue(chain);
mockDb.insert.mockReturnValue(chain);
mockDb.update.mockReturnValue(chain);
mockDb.delete.mockReturnValue(chain);
