import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { searchChronicleClients } from "@/lib/chronicle-client";

// ============================================================================
// POST /api/chronicle/search — Search Chronicle clients (test/lookup helper)
// Body: { firstName?, lastName?, last4Ssn?, externalId? }  (ANDed together)
// Returns a compact display shape so we can validate the search endpoint
// against the live account before building the chronicle_id backfill.
// ============================================================================

const bodySchema = z.object({
  firstName: z.string().trim().optional(),
  lastName: z.string().trim().optional(),
  last4Ssn: z.string().trim().optional(),
  externalId: z.string().trim().optional(),
});

export const POST = async (req: NextRequest) => {
  try {
    const rawBody = await req.json().catch(() => null);
    const parsedBody = bodySchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Invalid request body", issues: parsedBody.error.issues },
        { status: 400 },
      );
    }
    const firstName = parsedBody.data.firstName || undefined;
    const lastName = parsedBody.data.lastName || undefined;
    const last4Ssn = parsedBody.data.last4Ssn || undefined;
    const externalId = parsedBody.data.externalId || undefined;

    if (!firstName && !lastName && !last4Ssn && !externalId) {
      return NextResponse.json(
        { error: "Provide at least one search field" },
        { status: 400 },
      );
    }

    const apiUrl =
      process.env.CHRONICLE_API_URL || process.env.CHRONICLE_BASE_URL || "";
    const apiKey = process.env.CHRONICLE_API_KEY || "";

    // No mock fallback here — search is a live-only capability. If the key
    // isn't set, say so explicitly rather than silently returning nothing.
    if (!apiUrl || !apiKey) {
      return NextResponse.json(
        {
          error:
            "Chronicle API not configured — set CHRONICLE_API_URL and CHRONICLE_API_KEY in .env.local",
        },
        { status: 503 },
      );
    }

    const raw = await searchChronicleClients(
      { firstName, lastName, last4Ssn, externalId },
      apiUrl,
      apiKey,
    );

    const results = raw.map((r) => ({
      clientId: r.client_id,
      firstName: r.first_name,
      lastName: r.last_name,
      last4Ssn: r.last4_ssn,
      externalId: r.external_id,
      claimType: r.claim_type,
      reportType: r.report_type,
      statusOfCase: r.status_of_case,
      office: r.office_with_jurisdiction,
      t2Decision: r.t2_decision,
      t16Decision: r.t16_decision,
    }));

    return NextResponse.json({ count: results.length, results });
  } catch (error) {
    console.error("POST /api/chronicle/search error:", error);
    const msg = (error as Error).message;
    const status = msg.includes("API key")
      ? 401
      : msg.includes("parameters")
        ? 422
        : 500;
    return NextResponse.json({ error: msg }, { status });
  }
};
