import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- mocks (must be declared before route import) ---

const mockRequirePageAccess = vi.fn();
vi.mock("@/lib/auth-helpers", () => ({
  requirePageAccess: (...args: unknown[]) => mockRequirePageAccess(...args),
  guardStatus: () => 403,
}));

const mockIsSsrfSafe = vi.fn();
vi.mock("@/lib/ssrf-guard", () => ({
  isSsrfSafe: (...args: unknown[]) => mockIsSsrfSafe(...args),
}));

vi.mock("@/lib/chronicle-pdf-parser", () => ({
  parseChronicleAllFile: () => ({
    fullSsn: null,
    primaryDiagnosis: null,
    feeMethod: null,
    dateLastInsured: null,
    representatives: [],
    decisionHistory: [],
  }),
}));

import { POST } from "@/app/api/chronicle/pdf-parse/route";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const VALID_URL = "https://storage.chroniclelegal.com/docs/case.pdf";

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("https://app.example.com/api/chronicle/pdf-parse", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

/** Minimal structurally-valid PDF bytes (parseable by pdf-parse). */
function minimalPdfBuffer(): Buffer {
  // Hand-crafted minimal PDF with one empty page. Byte offsets are exact.
  const body = [
    "%PDF-1.4\n",
    "1 0 obj\n<</Type /Catalog /Pages 2 0 R>>\nendobj\n",
    "2 0 obj\n<</Type /Pages /Kids [3 0 R] /Count 1>>\nendobj\n",
    "3 0 obj\n<</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]>>\nendobj\n",
  ];
  let offset = 0;
  const offsets: number[] = [];
  const lines: string[] = [];
  for (const section of body) {
    if (/^\d+ 0 obj/.test(section)) offsets.push(offset);
    lines.push(section);
    offset += Buffer.byteLength(section, "latin1");
  }
  const xrefOffset = offset;
  const xref = [
    "xref\n",
    `0 ${offsets.length + 1}\n`,
    "0000000000 65535 f \n",
    ...offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`),
    "trailer\n",
    `<</Size ${offsets.length + 1} /Root 1 0 R>>\n`,
    "startxref\n",
    `${xrefOffset}\n`,
    "%%EOF\n",
  ];
  return Buffer.from(lines.join("") + xref.join(""), "latin1");
}

function makeReadableStream(buf: Buffer): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(buf));
      controller.close();
    },
  });
}

function mockFetchOk(
  buf: Buffer,
  headers: Record<string, string> = { "content-type": "application/pdf" },
): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(makeReadableStream(buf), { status: 200, headers }),
    ),
  );
}

// ---------------------------------------------------------------------------
// setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.unstubAllGlobals();
  mockRequirePageAccess.mockResolvedValue({ ok: true });
  mockIsSsrfSafe.mockImplementation((url: string) => ({
    ok: true,
    url: new URL(url),
  }));
});

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe("POST /api/chronicle/pdf-parse", () => {
  // --- auth ---
  it("returns 403 when Chronicle page access is denied", async () => {
    mockRequirePageAccess.mockResolvedValue({ ok: false, error: "Forbidden" });
    const res = await POST(makeRequest({ allFileLink: VALID_URL }));
    expect(res.status).toBe(403);
  });

  // --- url validation ---
  it("returns 400 when allFileLink is missing", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when isSsrfSafe rejects the URL", async () => {
    mockIsSsrfSafe.mockReturnValue({ ok: false, reason: "Only HTTPS URLs are allowed" });
    const res = await POST(makeRequest({ allFileLink: "http://evil.com/file.pdf" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/https/i);
  });

  // --- content-type ---
  it("returns 415 when the response has a non-PDF content-type", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(makeReadableStream(Buffer.from("<html>")), {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      ),
    );
    const res = await POST(makeRequest({ allFileLink: VALID_URL }));
    expect(res.status).toBe(415);
    const body = await res.json();
    expect(body.error).toMatch(/content-type/i);
  });

  it("accepts application/octet-stream as a valid content-type", async () => {
    const buf = minimalPdfBuffer();
    mockFetchOk(buf, { "content-type": "application/octet-stream" });
    const res = await POST(makeRequest({ allFileLink: VALID_URL }));
    // Should not be 415 — may succeed or fail on pdf parsing but not on content-type
    expect(res.status).not.toBe(415);
  });

  // --- pdf magic bytes ---
  it("returns 415 when response body does not start with %PDF-", async () => {
    const notPdf = Buffer.from("this is not a pdf");
    mockFetchOk(notPdf);
    const res = await POST(makeRequest({ allFileLink: VALID_URL }));
    expect(res.status).toBe(415);
    const body = await res.json();
    expect(body.error).toMatch(/pdf/i);
  });

  // --- size limit via Content-Length header ---
  it("returns 413 when Content-Length exceeds 50 MB", async () => {
    const oversize = 51 * 1024 * 1024;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(makeReadableStream(Buffer.alloc(1)), {
          status: 200,
          headers: {
            "content-type": "application/pdf",
            "content-length": String(oversize),
          },
        }),
      ),
    );
    const res = await POST(makeRequest({ allFileLink: VALID_URL }));
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toMatch(/50 mb/i);
  });

  // --- size limit during streaming ---
  it("returns 413 when streamed body exceeds 50 MB", async () => {
    // Send a chunk larger than the limit without declaring Content-Length
    const oversize = 51 * 1024 * 1024;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(makeReadableStream(Buffer.alloc(oversize)), {
          status: 200,
          headers: { "content-type": "application/pdf" },
        }),
      ),
    );
    const res = await POST(makeRequest({ allFileLink: VALID_URL }));
    expect(res.status).toBe(413);
  });

  // --- redirect blocked ---
  it("returns 500 when fetch throws due to redirect: error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch: redirect not allowed")),
    );
    const res = await POST(makeRequest({ allFileLink: VALID_URL }));
    expect(res.status).toBe(500);
  });

  // --- timeout ---
  it("returns 504 when the fetch times out", async () => {
    const abortErr = new DOMException("The operation was aborted due to timeout", "TimeoutError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortErr));
    const res = await POST(makeRequest({ allFileLink: VALID_URL }));
    expect(res.status).toBe(504);
  });

  // --- happy path ---
  it("returns 200 with extracted data for a valid PDF", async () => {
    const buf = minimalPdfBuffer();
    mockFetchOk(buf);
    const res = await POST(makeRequest({ allFileLink: VALID_URL }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.meta).toHaveProperty("pdfPages");
    expect(body.meta).toHaveProperty("pdfSizeMB");
  });
});
