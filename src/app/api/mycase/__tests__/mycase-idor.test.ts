/**
 * Regression guard for the MyCase IDOR fix (issue #443).
 *
 * Both routes had no auth whatsoever; a member session could enumerate any
 * case's documents and fetch files containing SSNs/medical PII. The fix adds
 * a master_fees page-access + case.editPii capability gate. This test matrix
 * ensures that gate can't silently regress.
 *
 * Entitlement rule (explicitly decided, see #443): any authenticated user with
 * master_fees page access and case.editPii may access documents for any case
 * (all-staff model; object-level scoping is intentionally deferred).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session } from "next-auth";
import type { PageKey } from "@/lib/access/pages";
import type { CapabilityKey } from "@/lib/access/capabilities";

// ---- mocks — hoisted by Vitest before any import ----

// Suppress "server-only" guard; Vitest runs in Node, not the Next.js server runtime.
vi.mock("server-only", () => ({}));

vi.mock("@/auth", () => ({ auth: vi.fn() }));

// Mock just the two helpers the routes use so we control the gate without
// pulling in bcrypt or the DB client.
vi.mock("@/lib/auth-helpers", () => ({
  sessionHasPageAccess: vi.fn(),
  sessionHasCapability: vi.fn(),
}));

vi.mock("@/lib/mycase-proxy", () => ({
  fetchCaseDocuments: vi.fn().mockResolvedValue([]),
  fetchDocumentDownloadUrl: vi
    .fn()
    .mockResolvedValue("https://s3.example.com/file.pdf"),
}));

import { auth } from "@/auth";
import { sessionHasPageAccess, sessionHasCapability } from "@/lib/auth-helpers";
import { GET as getCaseDocuments } from "@/app/api/mycase/cases/[id]/documents/route";
import { GET as getDocumentFile } from "@/app/api/mycase/documents/[id]/file/route";

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
    pages: ["master_fees", "overview"] as PageKey[],
    capabilities: ["case.update", "case.editPii"] as CapabilityKey[],
  },
  expires: "9999",
};

const makeReq = () => new Request("http://localhost/api/mycase/test");
const makeCtx = (id: string) => ({ params: Promise.resolve({ id }) });

// Helpers: configure the three-layer gate outcome.
const setGate = (
  hasSession: boolean,
  hasPage: boolean,
  hasCap: boolean,
) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockAuth.mockResolvedValue(hasSession ? fakeSession : (null as any));
  mockHasPage.mockReturnValue(hasPage);
  mockHasCap.mockReturnValue(hasCap);
};

// ---- GET /api/mycase/cases/[id]/documents ----

describe("GET /api/mycase/cases/[id]/documents", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 — unauthenticated (no session)", async () => {
    setGate(false, false, false);
    const res = await getCaseDocuments(makeReq() as never, makeCtx("1") as never);
    expect(res.status).toBe(401);
  });

  it("403 — authenticated but lacks case.editPii (member)", async () => {
    setGate(true, true, false);
    const res = await getCaseDocuments(makeReq() as never, makeCtx("1") as never);
    expect(res.status).toBe(403);
  });

  it("403 — authenticated but lacks master_fees page access", async () => {
    setGate(true, false, true);
    const res = await getCaseDocuments(makeReq() as never, makeCtx("1") as never);
    expect(res.status).toBe(403);
  });

  it("200 — fully entitled (lead / admin)", async () => {
    setGate(true, true, true);
    const res = await getCaseDocuments(makeReq() as never, makeCtx("1") as never);
    expect(res.status).toBe(200);
    expect(mockHasPage).toHaveBeenCalledWith(expect.anything(), "master_fees");
    expect(mockHasCap).toHaveBeenCalledWith(expect.anything(), "case.editPii");
  });
});

// ---- GET /api/mycase/documents/[id]/file ----

describe("GET /api/mycase/documents/[id]/file", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 — unauthenticated (no session)", async () => {
    setGate(false, false, false);
    const res = await getDocumentFile(makeReq() as never, makeCtx("9001") as never);
    expect(res.status).toBe(401);
  });

  it("403 — authenticated but lacks case.editPii (member)", async () => {
    setGate(true, true, false);
    const res = await getDocumentFile(makeReq() as never, makeCtx("9001") as never);
    expect(res.status).toBe(403);
  });

  it("403 — authenticated but lacks master_fees page access", async () => {
    setGate(true, false, true);
    const res = await getDocumentFile(makeReq() as never, makeCtx("9001") as never);
    expect(res.status).toBe(403);
  });

  it("passes the gate (lead / admin) and proxies the file", async () => {
    setGate(true, true, true);
    // Stub the downstream S3 fetch so the route doesn't make a real network call.
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response("pdf-bytes", {
          status: 200,
          headers: { "content-type": "application/pdf", "content-length": "9" },
        }),
      );
    const res = await getDocumentFile(makeReq() as never, makeCtx("9001") as never);
    expect(res.status).toBe(200);
    expect(mockHasPage).toHaveBeenCalledWith(expect.anything(), "master_fees");
    expect(mockHasCap).toHaveBeenCalledWith(expect.anything(), "case.editPii");
    fetchSpy.mockRestore();
  });
});
