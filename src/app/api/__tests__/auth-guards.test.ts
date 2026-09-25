/**
 * Route × role auth-guard regression tests.
 *
 * Every guarded API route must reject unauthenticated callers (401) and
 * callers with insufficient role/capability (403). These tests assert that
 * invariant for the highest-risk routes and include explicit regression tests
 * for the four gaps proven by the #372 security audit:
 *   - IDOR on GET /api/mycase/documents/[id]/file
 *   - Capability bypass on POST /api/chronicle/import
 *   - Missing gate on GET /api/team-members  (fixed in this PR)
 *   - Unauthorized DELETE /api/inbound-calls/[id]
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import { auth } from "@/auth";
import { makeSession, makeReq, makeCtx, mockDb } from "./helpers";

// ---------------------------------------------------------------------------
// Module mocks — hoisted before any import of the routes under test
// ---------------------------------------------------------------------------
vi.mock("server-only", () => ({}));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: mockDb }));
// n8n proxy — routes import mycase-proxy indirectly; mock to avoid network
vi.mock("@/lib/mycase-proxy", () => ({
  fetchCaseDocuments: vi.fn().mockResolvedValue([]),
  fetchCaseDetails: vi.fn().mockResolvedValue({}),
  fetchDocumentDownloadUrl: vi.fn().mockResolvedValue("https://example.com/doc"),
}));

// ---------------------------------------------------------------------------
// Lazy route imports — imported AFTER mocks are established
// ---------------------------------------------------------------------------
const getArchiveCases = async () =>
  (await import("@/app/api/archive/cases/route")).GET;
const getChronicleImport = async () =>
  (await import("@/app/api/chronicle/import/route")).POST;
const getChroniclePull = async () =>
  (await import("@/app/api/chronicle/pull/route")).POST;
const getMycaseDocFile = async () =>
  (await import("@/app/api/mycase/documents/[id]/file/route")).GET;
const getMycaseDocs = async () =>
  (await import("@/app/api/mycase/cases/[id]/documents/route")).GET;
const getMycaseSync = async () =>
  (await import("@/app/api/mycase/sync/route")).POST;
const getCasesId = async () =>
  (await import("@/app/api/cases/[id]/route")).GET;
const getTeamMembersGET = async () =>
  (await import("@/app/api/team-members/route")).GET;
const getTeamMembersPOST = async () =>
  (await import("@/app/api/team-members/route")).POST;
const getInboundCallsDelete = async () =>
  (await import("@/app/api/inbound-calls/[id]/route")).DELETE;
const getArchiveReopen = async () =>
  (await import("@/app/api/archive/reopen/route")).POST;

const mockAuth = vi.mocked(auth);

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const NULL_SESSION = null;

// ---------------------------------------------------------------------------
// Table-driven: every route returns 401 when there is no session
// ---------------------------------------------------------------------------
describe("401 — unauthenticated", () => {
  const cases = [
    {
      label: "GET /api/archive/cases",
      handler: getArchiveCases,
      req: () => makeReq("GET"),
      ctx: undefined as undefined,
    },
    {
      label: "POST /api/archive/reopen",
      handler: getArchiveReopen,
      req: () => makeReq("POST", {}),
      ctx: undefined,
    },
    {
      label: "POST /api/chronicle/import",
      handler: getChronicleImport,
      req: () => makeReq("POST", { cases: [] }),
      ctx: undefined,
    },
    {
      label: "POST /api/chronicle/pull",
      handler: getChroniclePull,
      req: () => makeReq("POST", { clientId: 1 }),
      ctx: undefined,
    },
    {
      label: "GET /api/mycase/documents/[id]/file",
      handler: getMycaseDocFile,
      req: () => makeReq("GET"),
      ctx: makeCtx(99),
    },
    {
      label: "GET /api/mycase/cases/[id]/documents",
      handler: getMycaseDocs,
      req: () => makeReq("GET"),
      ctx: makeCtx(99),
    },
    {
      label: "POST /api/mycase/sync",
      handler: getMycaseSync,
      req: () => makeReq("POST", {}),
      ctx: undefined,
    },
    {
      label: "GET /api/cases/[id]",
      handler: getCasesId,
      req: () => makeReq("GET"),
      ctx: makeCtx(1),
    },
    {
      label: "GET /api/team-members",
      handler: getTeamMembersGET,
      req: () => makeReq("GET"),
      ctx: undefined,
    },
    {
      label: "POST /api/team-members",
      handler: getTeamMembersPOST,
      req: () => makeReq("POST", { name: "Test" }),
      ctx: undefined,
    },
    {
      label: "DELETE /api/inbound-calls/[id]",
      handler: getInboundCallsDelete,
      req: () => makeReq("DELETE"),
      ctx: makeCtx(5),
    },
  ];

  for (const { label, handler, req, ctx } of cases) {
    it(`${label} → 401`, async () => {
      mockAuth.mockResolvedValue(NULL_SESSION);
      const fn = await handler();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await (fn as any)(req(), ctx);
      expect(res.status).toBe(401);
    });
  }
});

// ---------------------------------------------------------------------------
// Table-driven: admin-only routes return 403 for member/lead
// ---------------------------------------------------------------------------
describe("403 — member/lead rejected from admin-only routes", () => {
  const adminRoutes = [
    {
      label: "GET /api/archive/cases",
      handler: getArchiveCases,
      req: () => makeReq("GET"),
      ctx: undefined as undefined,
    },
    {
      label: "POST /api/archive/reopen",
      handler: getArchiveReopen,
      req: () => makeReq("POST", {}),
      ctx: undefined,
    },
    {
      label: "POST /api/mycase/sync",
      handler: getMycaseSync,
      req: () => makeReq("POST", {}),
      ctx: undefined,
    },
  ];

  for (const role of ["member", "lead"] as const) {
    for (const { label, handler, req, ctx } of adminRoutes) {
      it(`${label} → 403 for ${role}`, async () => {
        mockAuth.mockResolvedValue(makeSession(role));
        const fn = await handler();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await (fn as any)(req(), ctx);
        expect(res.status).toBe(403);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// #372 regression: IDOR on GET /api/mycase/documents/[id]/file
// A member without master_fees page access or case.editPii capability must
// not be able to download documents for any case ID.
// ---------------------------------------------------------------------------
describe("#372 regression — mycase document file download gate", () => {
  it("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(NULL_SESSION);
    const GET = await getMycaseDocFile();
    const res = await GET(makeReq("GET"), makeCtx(42));
    expect(res.status).toBe(401);
  });

  it("403 when authenticated but missing master_fees page access", async () => {
    // pages must be non-empty to suppress the role-defaults fallback;
    // "overview" is a real page that isn't master_fees.
    mockAuth.mockResolvedValue(
      makeSession("member", { pages: ["overview"], capabilities: ["case.editPii"] }),
    );
    const GET = await getMycaseDocFile();
    const res = await GET(makeReq("GET"), makeCtx(42));
    expect(res.status).toBe(403);
  });

  it("403 when authenticated with master_fees page but missing case.editPii", async () => {
    // capabilities must be non-empty to suppress the role-defaults fallback;
    // "case.update" is a real member capability that isn't case.editPii.
    mockAuth.mockResolvedValue(
      makeSession("member", { pages: ["master_fees"], capabilities: ["case.update"] }),
    );
    const GET = await getMycaseDocFile();
    const res = await GET(makeReq("GET"), makeCtx(42));
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// #372 regression — POST /api/chronicle/import capability gate
// A member with chronicle page access but no case.editPii should still be
// blocked by requirePageAccess("chronicle").
// ---------------------------------------------------------------------------
describe("#372 regression — chronicle import page gate", () => {
  it("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(NULL_SESSION);
    const POST = await getChronicleImport();
    const res = await POST(makeReq("POST", { cases: [], pdfFields: null }));
    expect(res.status).toBe(401);
  });

  it("403 when member lacks chronicle page access", async () => {
    // pages must be non-empty to suppress the role-defaults fallback.
    mockAuth.mockResolvedValue(
      makeSession("member", { pages: ["overview"], capabilities: ["case.update"] }),
    );
    const POST = await getChronicleImport();
    const res = await POST(makeReq("POST", { cases: [], pdfFields: null }));
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// #372 regression — GET /api/team-members was unguarded (fixed in this PR)
// ---------------------------------------------------------------------------
describe("#372 regression — team-members GET auth guard", () => {
  it("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(NULL_SESSION);
    const GET = await getTeamMembersGET();
    const res = await GET(makeReq("GET"));
    expect(res.status).toBe(401);
  });

  it("403 when member lacks team page access", async () => {
    // pages must be non-empty to suppress the role-defaults fallback.
    mockAuth.mockResolvedValue(
      makeSession("member", { pages: ["overview"], capabilities: ["case.update"] }),
    );
    const GET = await getTeamMembersGET();
    const res = await GET(makeReq("GET"));
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// #372 regression — DELETE /api/inbound-calls/[id]
// Any authenticated user may delete (intentional — no role gate). The guard
// is authentication only: unauthenticated callers must get 401.
// ---------------------------------------------------------------------------
describe("#372 regression — inbound-calls DELETE auth check", () => {
  it("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(NULL_SESSION);
    const DELETE = await getInboundCallsDelete();
    const res = await DELETE(makeReq("DELETE"), makeCtx(5));
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// mycase documents listing guard (same capability requirement as file route)
// ---------------------------------------------------------------------------
describe("GET /api/mycase/cases/[id]/documents — capability gate", () => {
  it("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(NULL_SESSION);
    const GET = await getMycaseDocs();
    const res = await GET(makeReq("GET"), makeCtx(1));
    expect(res.status).toBe(401);
  });

  it("403 when missing case.editPii capability", async () => {
    mockAuth.mockResolvedValue(
      makeSession("member", { pages: ["master_fees"], capabilities: [] }),
    );
    const GET = await getMycaseDocs();
    const res = await GET(makeReq("GET"), makeCtx(1));
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// chronicle/pull guard
// ---------------------------------------------------------------------------
describe("POST /api/chronicle/pull — page gate", () => {
  it("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(NULL_SESSION);
    const POST = await getChroniclePull();
    const res = await POST(makeReq("POST", { clientId: 112221 }));
    expect(res.status).toBe(401);
  });

  it("403 when member lacks chronicle page", async () => {
    mockAuth.mockResolvedValue(makeSession("member", { pages: [] }));
    const POST = await getChroniclePull();
    const res = await POST(makeReq("POST", { clientId: 112221 }));
    expect(res.status).toBe(403);
  });
});
