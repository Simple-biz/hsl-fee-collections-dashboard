import { NextRequest, NextResponse } from "next/server";
import { parseChronicleAllFile } from "@/lib/chronicle-pdf-parser";
import { requirePageAccess, guardStatus } from "@/lib/auth-helpers";
import { isSsrfSafe } from "@/lib/ssrf-guard";

// pdf-parse v1 tries to load a test PDF on require() — import from lib directly to avoid this
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse/lib/pdf-parse");

export const maxDuration = 60;

const MAX_PDF_BYTES = 50 * 1024 * 1024; // 50 MB

export async function POST(request: NextRequest) {
  try {
    const guard = await requirePageAccess("chronicle");
    if (!guard.ok) {
      return NextResponse.json(
        { error: guard.error },
        { status: guardStatus(guard.error) },
      );
    }

    const body = await request.json();
    const { allFileLink } = body;

    if (!allFileLink || typeof allFileLink !== "string") {
      return NextResponse.json(
        { error: "allFileLink is required" },
        { status: 400 },
      );
    }

    // Validate URL — require HTTPS and block private/reserved addresses
    const ssrf = isSsrfSafe(allFileLink);
    if (!ssrf.ok) {
      return NextResponse.json({ error: ssrf.reason }, { status: 400 });
    }

    // Download the PDF (public/signed URL — no auth needed)
    console.log(`[pdf-parse] Downloading PDF...`);
    const pdfResponse = await fetch(ssrf.url, {
      signal: AbortSignal.timeout(30000),
      redirect: "error",
    });

    if (!pdfResponse.ok) {
      return NextResponse.json(
        {
          error: `Failed to download PDF: ${pdfResponse.status} ${pdfResponse.statusText}`,
        },
        { status: 502 },
      );
    }

    // Reject if Content-Length already declares an oversized file
    const rawContentLength = pdfResponse.headers.get("content-length");
    if (rawContentLength) {
      const declaredSize = parseInt(rawContentLength, 10);
      if (Number.isFinite(declaredSize) && declaredSize > MAX_PDF_BYTES) {
        return NextResponse.json(
          { error: "PDF exceeds the 50 MB size limit" },
          { status: 413 },
        );
      }
    }

    // Reject non-PDF content types (allow application/pdf and generic octet-stream)
    const contentType = pdfResponse.headers.get("content-type") ?? "";
    if (!contentType.includes("pdf") && !contentType.startsWith("application/octet-stream")) {
      return NextResponse.json(
        { error: `Expected a PDF but received content-type: ${contentType || "(none)"}` },
        { status: 415 },
      );
    }

    // Stream response body; abort if accumulated size exceeds the limit
    const reader = pdfResponse.body?.getReader();
    if (!reader) {
      return NextResponse.json({ error: "Response body was empty" }, { status: 502 });
    }

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > MAX_PDF_BYTES) {
          await reader.cancel();
          return NextResponse.json(
            { error: "PDF exceeds the 50 MB size limit" },
            { status: 413 },
          );
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    const fileSizeMB = (buffer.length / 1024 / 1024).toFixed(1);
    console.log(`[pdf-parse] Downloaded ${fileSizeMB}MB, extracting text...`);

    // Validate PDF magic bytes before handing to the parser
    if (buffer.length < 5 || buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
      return NextResponse.json(
        { error: "Response does not appear to be a valid PDF" },
        { status: 415 },
      );
    }

    // Parse PDF text
    const pdfData = await pdfParse(buffer);
    const rawText: string = pdfData.text;

    console.log(
      `[pdf-parse] Extracted ${rawText.length} chars from ${pdfData.numpages} pages`,
    );

    // Run extraction
    const extracted = parseChronicleAllFile(rawText, pdfData.numpages);

    console.log(`[pdf-parse] Results:`, {
      fullSsn: extracted.fullSsn ? "✓" : "✗",
      diagnoses: extracted.primaryDiagnosis ? "✓" : "✗",
      feeMethod: extracted.feeMethod || "✗",
      dli: extracted.dateLastInsured ? "✓" : "✗",
      reps: extracted.representatives.length,
      decisions: extracted.decisionHistory.length,
    });

    return NextResponse.json({
      success: true,
      data: extracted,
      meta: {
        pdfPages: pdfData.numpages,
        pdfSizeMB: fileSizeMB,
        textLength: rawText.length,
      },
    });
  } catch (error) {
    console.error("[pdf-parse] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";

    if (message.includes("timeout") || message.includes("abort")) {
      return NextResponse.json(
        { error: "PDF download timed out. The file may be too large." },
        { status: 504 },
      );
    }

    return NextResponse.json(
      { error: `PDF parsing failed: ${message}` },
      { status: 500 },
    );
  }
}
