/**
 * Regression guard for the MyCase case-details auth hardening (issue #392).
 *
 * GET /api/mycase/cases/[id]/details was auth-only despite returning sensitive
 * data (ssnLast4, chronicleLink, decisions). It now requires master_fees page
 * access — the page the endpoint belongs to. case.editPii is intentionally NOT
 * required here: member-role users have master_fees by default but not
 * case.editPii, so adding that capability gate would silently break all members'
 * case detail sheet. The documents and file routes (#443) use the stronger
 * master_fees + case.editPii gate because they serve raw files containing PII.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session } from "next-auth";
import type { PageKey } from "@/lib/access/pages";

// ---- mocks ----

vi.mock("server-only", () => ({}));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/auth-helpers", () => ({
  sessionHasPageAccess: vi.fn(),
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
import { sessionHasPageAccess } from "@/lib/auth-helpers";
import { GET } from "@/app/api/mycase/cases/[id]/details/route";

const mockAuth = vi.mocked(auth);
const mockHasPage = vi.mocked(sessionHasPageAccess);

const fakeSession: Session = {
  user: {
    id: "1",
    name: "Test",
    email: "test@example.com",
    role: "lead",
    mustChangePassword: false,
    pages: ["master_fees"] as PageKey[],
    capabilities: [],
  },
  expires: "9999",
};

const makeReq = () => new Request("http://localhost/api/mycase/cases/1/details");
const makeCtx = (id: string) => ({ params: Promise.resolve({ id }) });

const setGate = (hasSession: boolean, hasPage: boolean) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockAuth.mockResolvedValue(hasSession ? fakeSession : (null as any));
  mockHasPage.mockReturnValue(hasPage);
};

describe("GET /api/mycase/cases/[id]/details", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 — unauthenticated (no session)", async () => {
    setGate(false, false);
    const res = await GET(makeReq() as never, makeCtx("1") as never);
    expect(res.status).toBe(401);
  });

  it("403 — authenticated but lacks master_fees page access (member on another page)", async () => {
    setGate(true, false);
    const res = await GET(makeReq() as never, makeCtx("1") as never);
    expect(res.status).toBe(403);
    expect(mockHasPage).toHaveBeenCalledWith(expect.anything(), "master_fees");
  });

  it("200 — member with master_fees access can view case details (no case.editPii required)", async () => {
    setGate(true, true);
    const res = await GET(makeReq() as never, makeCtx("1") as never);
    // myCaseDb returns [] → 404 "Case not found in MyCase"; the 403 gate did NOT fire
    expect(res.status).toBe(404);
    expect(mockHasPage).toHaveBeenCalledWith(expect.anything(), "master_fees");
  });
});
