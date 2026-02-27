import { NextRequest, NextResponse } from "next/server";
import { parseChronicleAllFile } from "@/lib/chronicle-pdf-parser";

// pdf-parse v1 tries to load a test PDF on require() — import from lib directly to avoid this
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse/lib/pdf-parse");

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { allFileLink } = body;

    if (!allFileLink || typeof allFileLink !== "string") {
      return NextResponse.json(
        { error: "allFileLink is required" },
        { status: 400 },
      );
    }

    // Validate URL
    try {
      new URL(allFileLink);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL provided" },
        { status: 400 },
      );
    }

    // Download the PDF (public/signed URL — no auth needed)
    console.log(`[pdf-parse] Downloading PDF...`);
    const pdfResponse = await fetch(allFileLink, {
      signal: AbortSignal.timeout(30000),
    });

    if (!pdfResponse.ok) {
      return NextResponse.json(
        {
          error: `Failed to download PDF: ${pdfResponse.status} ${pdfResponse.statusText}`,
        },
        { status: 502 },
      );
    }

    const arrayBuffer = await pdfResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileSizeMB = (buffer.length / 1024 / 1024).toFixed(1);
    console.log(`[pdf-parse] Downloaded ${fileSizeMB}MB, extracting text...`);

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
