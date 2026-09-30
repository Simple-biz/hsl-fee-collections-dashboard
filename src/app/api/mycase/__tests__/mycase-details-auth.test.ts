/**
 * Regression guard for the MyCase case-details auth hardening (issue #392).
 *
 * GET /api/mycase/cases/[id]/details was auth-only and returned sensitive data
 * (ssnLast4, chronicleLink, decisions). It now requires master_fees page access
 * AND case.editPii capability, matching the gate already on the documents and
 * file routes (fixed in issue #443).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session } from "next-auth";
import type { PageKey } from "@/lib/access/pages";
import type { CapabilityKey } from "@/lib/access/capabilities";

// ---- mocks ----

vi.mock("server-only", () => ({}));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/auth-helpers", () => ({
  sessionHasPageAccess: vi.fn(),
  sessionHasCapability: vi.fn(),
}));

// Prevent real DB / external API calls.
vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        leftJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      })),
    })),
  },
}));
vi.mock("@/lib/db/mycase", () => ({
  myCaseDb: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/import/mycase-mapper", () => ({
  mapMyCaseRows: vi.fn().mockReturnValue({ rows: [], warnings: [] }),
  mapDecision: vi.fn((d: string) => d),
}));
vi.mock("@/lib/mycase-proxy", () => ({
  fetchCaseDetails: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/chronicle-client", () => ({
  fetchChronicleClient: vi.fn().mockResolvedValue(null),
  parseChronicleResponse: vi.fn().mockReturnValue({}),
}));

import { auth } from "@/auth";
import { sessionHasPageAccess, sessionHasCapability } from "@/lib/auth-helpers";
import { GET } from "@/app/api/mycase/cases/[id]/details/route";

const mockAuth = vi.mocked(auth);
const mockHasPage = vi.mocked(sessionHasPageAccess);
const mockHasCap = vi.mocked(sessionHasCapability);

const fakeSession: Session = {
  user: {
    id: "1",
    name: "Test",
    email: "test@example.com",
    role: "lead",
    mustChangePassword: false,
    pages: ["master_fees"] as PageKey[],
    capabilities: ["case.editPii"] as CapabilityKey[],
  },
  expires: "9999",
};

const makeReq = () => new Request("http://localhost/api/mycase/cases/1/details");
const makeCtx = (id: string) => ({ params: Promise.resolve({ id }) });

const setGate = (hasSession: boolean, hasPage: boolean, hasCap: boolean) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockAuth.mockResolvedValue(hasSession ? fakeSession : (null as any));
  mockHasPage.mockReturnValue(hasPage);
  mockHasCap.mockReturnValue(hasCap);
};

describe("GET /api/mycase/cases/[id]/details", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 — unauthenticated (no session)", async () => {
    setGate(false, false, false);
    const res = await GET(makeReq() as never, makeCtx("1") as never);
    expect(res.status).toBe(401);
  });

  it("403 — authenticated but lacks master_fees page access", async () => {
    setGate(true, false, true);
    const res = await GET(makeReq() as never, makeCtx("1") as never);
    expect(res.status).toBe(403);
    expect(mockHasPage).toHaveBeenCalledWith(expect.anything(), "master_fees");
  });

  it("403 — authenticated but lacks case.editPii capability", async () => {
    setGate(true, true, false);
    const res = await GET(makeReq() as never, makeCtx("1") as never);
    expect(res.status).toBe(403);
    expect(mockHasCap).toHaveBeenCalledWith(expect.anything(), "case.editPii");
  });

  it("passes gate (master_fees + case.editPii) and proceeds to data fetch", async () => {
    setGate(true, true, true);
    const res = await GET(makeReq() as never, makeCtx("1") as never);
    // myCaseDb returns [] → 404 "Case not found in MyCase"; the 403 gate did NOT fire
    expect(res.status).toBe(404);
    expect(mockHasPage).toHaveBeenCalledWith(expect.anything(), "master_fees");
    expect(mockHasCap).toHaveBeenCalledWith(expect.anything(), "case.editPii");
  });
});
