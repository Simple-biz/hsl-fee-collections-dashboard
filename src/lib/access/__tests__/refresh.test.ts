// version.test.ts covers *when* a token is considered stale. This covers what
// actually happens to it — the half that broke in #466, where the capability
// existed and the role granted it but the signed-in token never learned.
// refreshAccessIfChanged tests cover the per-user stamp logic added in #467.

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockResolveAccess = vi.fn();
const mockDbQuery = vi.fn();
const mockDbLimit = vi.fn();
const mockDbWhere = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/access/server", () => ({
  resolveAccess: (...args: unknown[]) => mockResolveAccess(...args),
}));
// Mock the DB query chain used by refreshAccessIfChanged so tests never hit
// the real database. The chain is: db.select().from().leftJoin().where().limit()
vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          where: mockDbWhere,
        }),
      }),
    }),
  },
}));
vi.mock("@/lib/db/schema", () => ({
  users: {},
  userAccessOverrides: {},
}));

import { refreshAccessIfStale, refreshAccessIfChanged, type RefreshableToken } from "@/lib/access/refresh";
import { ACCESS_SCHEMA_VERSION } from "@/lib/access/version";

const FRESH = { pages: ["cases"], capabilities: ["feePetition.manage"] };

beforeEach(() => {
  mockResolveAccess.mockReset();
  mockResolveAccess.mockResolvedValue(FRESH);
  mockDbQuery.mockReset();
  mockDbQuery.mockResolvedValue([]); // safe default: no row → refreshAccessIfChanged skips
  mockDbWhere.mockReset();
  mockDbWhere.mockImplementation(() => ({ limit: mockDbLimit }));
  mockDbLimit.mockReset();
  mockDbLimit.mockImplementation(() => mockDbQuery());
});

describe("refreshAccessIfStale", () => {
  // The #466 scenario end to end: an admin signed in before the capability
  // shipped, carrying pages but no feePetition.manage.
  it("replaces a pre-stamp token's access with the freshly resolved set", async () => {
    const token: RefreshableToken = { id: "7", role: "admin", pages: ["cases"], capabilities: [] };

    const result = await refreshAccessIfStale(token);

    expect(mockResolveAccess).toHaveBeenCalledWith(7, "admin");
    expect(result.capabilities).toEqual(["feePetition.manage"]);
    expect(result.pages).toEqual(["cases"]);
    expect(result.accessVersion).toBe(ACCESS_SCHEMA_VERSION);
  });

  // Stamping is what stops the refresh repeating on every single request.
  it("does not touch the database once the token is stamped", async () => {
    const token = { id: "7", role: "admin", accessVersion: ACCESS_SCHEMA_VERSION };

    await refreshAccessIfStale(token);

    expect(mockResolveAccess).not.toHaveBeenCalled();
  });

  // resolveAccess reads per-user overrides, which may *revoke* something the
  // role grants by default. Rebuilding from role defaults would hand it back,
  // which is why this goes to the database rather than to the defaults table.
  it("honours an override that revokes a role-default capability", async () => {
    mockResolveAccess.mockResolvedValue({ pages: ["cases"], capabilities: [] });
    const token = { id: "7", role: "lead", capabilities: ["feePetition.manage"] };

    const result = await refreshAccessIfStale(token);

    expect(result.capabilities).toEqual([]);
  });

  // A database blip must not sign the user out or strip their access.
  it("leaves the token intact and unstamped when the lookup fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockResolveAccess.mockRejectedValue(new Error("connection lost"));
    const token: RefreshableToken = { id: "7", role: "admin", pages: ["cases"], capabilities: ["case.finalize"] };

    const result = await refreshAccessIfStale(token);

    expect(result.pages).toEqual(["cases"]);
    expect(result.capabilities).toEqual(["case.finalize"]);
    // Unstamped, so the next request retries rather than locking in the stale set.
    expect(result.accessVersion).toBeUndefined();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("ignores a token with no role to resolve against", async () => {
    await refreshAccessIfStale({ id: "7" });
    expect(mockResolveAccess).not.toHaveBeenCalled();
  });
});

describe("refreshAccessIfChanged", () => {
  it("returns null when the user row is missing (deleted user)", async () => {
    mockDbQuery.mockResolvedValue([]);
    const token: RefreshableToken = { id: "5", role: "admin", accessStamp: "2026-01-01T00:00:00.000Z" };

    const result = await refreshAccessIfChanged(token);

    expect(result).toBeNull();
    expect(mockResolveAccess).not.toHaveBeenCalled();
  });

  it("returns null when isActive is false (deactivated user)", async () => {
    mockDbQuery.mockResolvedValue([{
      isActive: false,
      role: "admin",
      updatedAt: new Date("2026-09-01"),
      overrideUpdatedAt: null,
      mustChangePassword: false,
    }]);
    const token: RefreshableToken = { id: "5", role: "admin", accessStamp: "2026-01-01T00:00:00.000Z" };

    const result = await refreshAccessIfChanged(token);

    expect(result).toBeNull();
    expect(mockResolveAccess).not.toHaveBeenCalled();
  });

  it("fast-paths when the stamp has not changed", async () => {
    const stamp = "2026-09-01T00:00:00.000Z";
    mockDbQuery.mockResolvedValue([{
      isActive: true,
      role: "admin",
      updatedAt: new Date(stamp),
      overrideUpdatedAt: null,
      mustChangePassword: false,
    }]);
    const token: RefreshableToken = { id: "5", role: "admin", accessStamp: stamp };

    const result = await refreshAccessIfChanged(token);

    expect(result).toBe(token);
    expect(mockResolveAccess).not.toHaveBeenCalled();
  });

  it("re-resolves and re-stamps when users.updated_at has changed (e.g. role change)", async () => {
    const oldStamp = "2026-09-01T00:00:00.000Z";
    const newStamp = "2026-09-20T10:00:00.000Z";
    mockDbQuery.mockResolvedValue([{
      isActive: true,
      role: "member",
      updatedAt: new Date(newStamp),
      overrideUpdatedAt: null,
      mustChangePassword: false,
    }]);
    mockResolveAccess.mockResolvedValue({ pages: ["cases"], capabilities: [] });
    const token: RefreshableToken = { id: "5", role: "admin", accessStamp: oldStamp, accessVersion: 1 };

    const result = await refreshAccessIfChanged(token);

    expect(result).not.toBeNull();
    expect(result?.role).toBe("member");
    expect(result?.pages).toEqual(["cases"]);
    expect(result?.capabilities).toEqual([]);
    expect(result?.accessStamp).toBe(newStamp);
    expect(result?.accessVersion).toBe(ACCESS_SCHEMA_VERSION);
    expect(mockResolveAccess).toHaveBeenCalledWith(5, "member");
  });

  it("uses overrideUpdatedAt as stamp when it is more recent than users.updated_at", async () => {
    const userStamp = "2026-09-01T00:00:00.000Z";
    const overrideStamp = "2026-09-25T12:00:00.000Z";
    mockDbQuery.mockResolvedValue([{
      isActive: true,
      role: "lead",
      updatedAt: new Date(userStamp),
      overrideUpdatedAt: new Date(overrideStamp),
      mustChangePassword: false,
    }]);
    const token: RefreshableToken = { id: "5", role: "lead", accessStamp: userStamp };

    const result = await refreshAccessIfChanged(token);

    expect(result?.accessStamp).toBe(overrideStamp);
    expect(mockResolveAccess).toHaveBeenCalledWith(5, "lead");
  });

  it("leaves the token intact when the DB query fails (fail open)", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockDbQuery.mockRejectedValue(new Error("connection timeout"));
    const token: RefreshableToken = { id: "5", role: "admin", pages: ["cases"], accessStamp: "2026-01-01T00:00:00.000Z" };

    const result = await refreshAccessIfChanged(token);

    expect(result).toBe(token);
    expect(result?.pages).toEqual(["cases"]);
    expect(mockResolveAccess).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("leaves the stamp unset when re-resolve fails so the next request retries", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockDbQuery.mockResolvedValue([{
      isActive: true,
      role: "member",
      updatedAt: new Date("2026-09-20T00:00:00.000Z"),
      overrideUpdatedAt: null,
      mustChangePassword: false,
    }]);
    mockResolveAccess.mockRejectedValue(new Error("db error"));
    const originalStamp = "2026-01-01T00:00:00.000Z";
    const token: RefreshableToken = { id: "5", role: "admin", pages: ["cases"], accessStamp: originalStamp };

    const result = await refreshAccessIfChanged(token);

    expect(result).not.toBeNull();
    expect(result?.role).toBe("admin");
    expect(result?.pages).toEqual(["cases"]);
    expect(result?.capabilities).toBeUndefined();
    expect(result?.accessStamp).toBe(originalStamp);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("returns the token unchanged when it has no id", async () => {
    const token: RefreshableToken = { role: "admin" };

    const result = await refreshAccessIfChanged(token);

    expect(result).toBe(token);
    expect(mockDbQuery).not.toHaveBeenCalled();
    expect(mockDbWhere).not.toHaveBeenCalled();
  });

  it("applies a WHERE clause with a single argument to filter by user id", async () => {
    mockDbQuery.mockResolvedValue([]);
    await refreshAccessIfChanged({ id: "5", role: "admin" });
    expect(mockDbWhere).toHaveBeenCalledTimes(1);
    expect(mockDbWhere).toHaveBeenCalledWith(expect.anything());
  });

  it("re-resolves on first post-deploy request when accessStamp is absent (migration path)", async () => {
    const stamp = "2026-09-01T00:00:00.000Z";
    mockDbQuery.mockResolvedValue([{
      isActive: true,
      role: "admin",
      updatedAt: new Date(stamp),
      overrideUpdatedAt: null,
      mustChangePassword: false,
    }]);
    const token: RefreshableToken = { id: "5", role: "admin" }; // no accessStamp

    const result = await refreshAccessIfChanged(token);

    expect(result?.accessStamp).toBe(stamp);
    expect(mockResolveAccess).toHaveBeenCalledWith(5, "admin");
  });

  it("propagates mustChangePassword from the DB row on re-resolve", async () => {
    const newStamp = "2026-09-25T00:00:00.000Z";
    mockDbQuery.mockResolvedValue([{
      isActive: true,
      role: "admin",
      updatedAt: new Date(newStamp),
      overrideUpdatedAt: null,
      mustChangePassword: true,
    }]);
    mockResolveAccess.mockResolvedValue({ pages: ["cases"], capabilities: [] });
    const token: RefreshableToken = { id: "5", role: "admin", accessStamp: "2026-01-01T00:00:00.000Z", mustChangePassword: false };

    const result = await refreshAccessIfChanged(token);

    expect(result?.mustChangePassword).toBe(true);
  });

  it("queries with limit 1 to avoid full-table scans", async () => {
    mockDbQuery.mockResolvedValue([]);
    await refreshAccessIfChanged({ id: "5", role: "admin" });
    expect(mockDbLimit).toHaveBeenCalledWith(1);
  });
});
