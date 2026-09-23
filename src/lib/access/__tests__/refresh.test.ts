// version.test.ts covers *when* a token is considered stale. This covers what
// actually happens to it — the half that broke in #466, where the capability
// existed and the role granted it but the signed-in token never learned.

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockResolveAccess = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/access/server", () => ({
  resolveAccess: (...args: unknown[]) => mockResolveAccess(...args),
}));

import { refreshAccessIfStale, type RefreshableToken } from "@/lib/access/refresh";
import { ACCESS_SCHEMA_VERSION } from "@/lib/access/version";

const FRESH = { pages: ["cases"], capabilities: ["feePetition.manage"] };

beforeEach(() => {
  mockResolveAccess.mockReset();
  mockResolveAccess.mockResolvedValue(FRESH);
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
