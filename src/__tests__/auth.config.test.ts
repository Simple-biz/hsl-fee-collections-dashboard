import { describe, it, expect } from "vitest";
import { authConfig } from "@/auth.config";

const authorized = authConfig.callbacks!.authorized!;

const makeReq = (pathname: string) => ({
  request: { nextUrl: new URL(`http://localhost${pathname}`) },
});

const session = (overrides = {}) => ({
  auth: {
    user: {
      id: "1",
      role: "member",
      mustChangePassword: false,
      pages: ["master_fees", "overview"],
      capabilities: ["case.update"],
      ...overrides,
    },
  },
});

describe("proxy authorized callback", () => {
  it("blocks unauthenticated requests to protected routes (returns false → redirects to /login)", () => {
    // @ts-expect-error — minimal mock; unused fields omitted
    const result = authorized({ auth: null, ...makeReq("/master-fees") });
    expect(result).toBe(false);
  });

  it("blocks unauthenticated requests to any protected route", () => {
    for (const path of ["/", "/fees-closed", "/scoreboard", "/admin"]) {
      // @ts-expect-error — minimal mock
      const result = authorized({ auth: null, ...makeReq(path) });
      expect(result).toBe(false);
    }
  });

  it("allows unauthenticated access to /login", () => {
    // @ts-expect-error — minimal mock
    const result = authorized({ auth: null, ...makeReq("/login") });
    expect(result).toBe(true);
  });

  it("allows authenticated users through protected routes", () => {
    // @ts-expect-error — minimal mock
    const result = authorized({ ...session(), ...makeReq("/master-fees") });
    expect(result).toBe(true);
  });

  it("redirects authenticated users away from /login", () => {
    // @ts-expect-error — minimal mock
    const result = authorized({ ...session(), ...makeReq("/login") });
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).headers.get("location")).toBe(
      "http://localhost/",
    );
  });

  it("redirects users with mustChangePassword to /change-password", () => {
    // @ts-expect-error — minimal mock
    const result = authorized({
      ...session({ mustChangePassword: true }),
      ...makeReq("/master-fees"),
    });
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).headers.get("location")).toBe(
      "http://localhost/change-password",
    );
  });

  it("redirects authenticated users without page access to /", () => {
    // Use /admin — not in the member role defaults, so the stale-token
    // fallback cannot rescue a member token that lacks it.
    // @ts-expect-error — minimal mock
    const result = authorized({
      ...session({ pages: ["master_fees", "overview"] }), // no admin
      ...makeReq("/admin"),
    });
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).headers.get("location")).toBe(
      "http://localhost/",
    );
  });

  it("allows access when the page is in role defaults but missing from a stale token", () => {
    // Tokens minted before per-page access was introduced have an empty pages
    // array. The gate falls back to role defaults so those sessions aren't
    // locked out until next login.
    // @ts-expect-error — minimal mock
    const result = authorized({
      ...session({ pages: [] }), // stale token — empty array triggers role-default fallback
      ...makeReq("/master-fees"), // "master_fees" is in the member role default
    });
    expect(result).toBe(true);
  });
});
