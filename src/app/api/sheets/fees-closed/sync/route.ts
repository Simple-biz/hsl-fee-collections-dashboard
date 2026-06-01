import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { cases } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  mapFeesClosedRows,
  type ParsedFeesClosedRow,
} from "@/lib/import/fees-closed-mapper";
import type { SheetRow } from "@/lib/import/sheets-mapper";

export const runtime = "nodejs";
export const maxDuration = 60;

const fetchFeesClosedRows = async (): Promise<{
  rows: SheetRow[];
  usingMock: boolean;
}> => {
  const webhookUrl = process.env.FEES_CLOSED_SYNC_WEBHOOK_URL;
  if (!webhookUrl) return { rows: [], usingMock: true };

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trigger: "manual" }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok)
    throw new Error(
      `Fees Closed sync webhook failed (${res.status}): ${await res.text()}`,
    );
  const rows = (await res.json()) as SheetRow[];
  if (!Array.isArray(rows))
    throw new Error("Fees Closed sync webhook returned invalid response shape");
  return { rows, usingMock: false };
};

// POST /api/sheets/fees-closed/sync
//   mode=preview  → fetch, match to DB by caseLink, return preview (no writes)
//   mode=upsert   → re-fetch, insert/update fees_closed rows by clientId
export const POST = async (req: NextRequest) => {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) {
      return NextResponse.json(
        { error: guard.error },
        { status: guard.error === "Unauthenticated" ? 401 : 403 },
      );
    }

    const { searchParams } = new URL(req.url);
    const modeParam = searchParams.get("mode") ?? "preview";
    if (modeParam !== "preview" && modeParam !== "upsert") {
      return NextResponse.json({ error: `Invalid mode: ${modeParam}` }, { status: 400 });
    }
    const mode = modeParam;

    const { rows: rawRows, usingMock } = await fetchFeesClosedRows();
    const { rows: parsed, warnings } = mapFeesClosedRows(rawRows);

    // Match sheet rows to cases in DB by caseLink (CASE NAME → cases.case_link).
    // When CLIENT_ID is added to the Fees Closed tab, switch to matching by clientId.
    const caseNames = parsed.map((r) => r.caseName);
    const matchedCases =
      caseNames.length > 0
        ? await db
            .select({ clientId: cases.clientId, caseLink: cases.caseLink })
            .from(cases)
            .where(inArray(cases.caseLink, caseNames))
        : [];

    const caseLinkToClientId = new Map(
      matchedCases.map((c) => [c.caseLink, c.clientId]),
    );

    type PreviewRow = {
      caseName: string;
      clientId: number | null;
      matchedInDb: boolean;
      closedDate: string | null;
      assignedTo: string | null;
      claimType: string | null;
      totalFeesPaid: string;
    };

    const previewRows: PreviewRow[] = parsed.map((r) => {
      const clientId = caseLinkToClientId.get(r.caseName) ?? null;
      return {
        caseName: r.caseName,
        clientId,
        matchedInDb: clientId !== null,
        closedDate: r.closedDate,
        assignedTo: r.assignedTo,
        claimType: r.claimType,
        totalFeesPaid: r.totalFeesPaid,
      };
    });

    if (mode === "preview") {
      const matched = previewRows.filter((r) => r.matchedInDb).length;
      return NextResponse.json({
        mode,
        usingMock,
        summary: {
          fetched: parsed.length,
          matchedInDb: matched,
          unmatchedInDb: parsed.length - matched,
          warnings,
        },
        rows: previewRows,
      });
    }

    // upsert mode
    let body: { selectedCaseNames: unknown };
    try {
      body = (await req.json()) as { selectedCaseNames: unknown };
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    if (!Array.isArray(body.selectedCaseNames)) {
      return NextResponse.json(
        { error: "selectedCaseNames must be an array" },
        { status: 400 },
      );
    }

    const selectedSet = new Set(body.selectedCaseNames as string[]);
    const candidates = parsed.filter((r) => selectedSet.has(r.caseName));

    if (candidates.length === 0) {
      return NextResponse.json({ upserted: 0 });
    }

    // Resolve clientIds for selected rows
    const selectedNames = candidates.map((r) => r.caseName);
    const resolved =
      selectedNames.length > 0
        ? await db
            .select({ clientId: cases.clientId, caseLink: cases.caseLink })
            .from(cases)
            .where(inArray(cases.caseLink, selectedNames))
        : [];
    const resolvedMap = new Map(resolved.map((c) => [c.caseLink, c.clientId]));

    const withClientId = candidates
      .map((r) => ({ ...r, clientId: resolvedMap.get(r.caseName) ?? null }))
      .filter((r): r is ParsedFeesClosedRow & { clientId: number } => r.clientId !== null);

    if (withClientId.length === 0) {
      return NextResponse.json({ upserted: 0 });
    }

    // TODO: insert/update fees_closed table once Sir Jeru's schema lands.
    // Each row in withClientId has clientId + all ParsedFeesClosedRow fields.
    // Expected shape:
    //   db.insert(feesClosedTable).values(withClientId.map(toFeesClosedInsert))
    //     .onConflictDoUpdate({ target: feesClosedTable.caseId, set: ... })
    //
    // Uncomment and implement once fees_closed is added to schema.ts and migrations run.

    return NextResponse.json({
      upserted: withClientId.length,
      note: "fees_closed table not yet available — upsert is a no-op until schema is ready",
    });
  } catch (error) {
    console.error("POST /api/sheets/fees-closed/sync error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
};
