import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { cases, feeRecords, activityLog } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  mapFeesClosedRows,
  type ParsedFeesClosedRow,
} from "@/lib/import/fees-closed-mapper";
import type { SheetRow } from "@/lib/import/sheets-mapper";

export const runtime = "nodejs";
export const maxDuration = 120;

const chunk = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

// Cache fetched rows for 5 minutes so preview and upsert use the same data
// without triggering the webhook twice (webhook may dequeue on each POST).
const FC_CACHE_TTL = 5 * 60 * 1000;
let fcCache: { rows: SheetRow[]; ts: number } | null = null;

// "2026.03.24 Coronel, Angelica v. ALJ Smith" → { firstName: "Angelica", lastName: "Coronel" }
const parseNameFromCaseLink = (caseLink: string): { firstName: string; lastName: string } => {
  const withoutDate = caseLink.replace(/^\d{4}[.\-]\d{2}[.\-]\d{2}\s+/, "");
  const clientPart = withoutDate.split(/\s+vs?\.\s+/i)[0].trim();
  const commaIdx = clientPart.indexOf(",");
  if (commaIdx === -1) return { firstName: "Unknown", lastName: clientPart || "Unknown" };
  return {
    lastName: clientPart.slice(0, commaIdx).trim() || "Unknown",
    firstName: clientPart.slice(commaIdx + 1).trim() || "Unknown",
  };
};

const parseClaimType = (raw: string | null): string[] => {
  if (!raw) return [];
  const s = raw.trim().toUpperCase();
  if (s.includes("T2") && s.includes("T16")) return ["T2", "T16"];
  if (s === "T2") return ["T2"];
  if (s === "T16") return ["T16"];
  return [s];
};

const toFeeRecordValues = (r: ParsedFeesClosedRow, clientId: number, closedAt: Date) => ({
  caseId: clientId,
  isClosed: true,
  closedAt,
  winSheetStatus: "closed",
  syncStatus: "synced" as const,
  syncedAt: new Date(),
  assignedTo: r.assignedTo ?? null,
  winSheetLink: r.winSheetLink ?? null,
  feesConfirmation: r.feesConfirmation ?? null,
  caseStatus: r.caseStatus ?? null,
  approvedBy: r.approvedBy ?? null,
  t16Retro: r.t16Retro,
  t16FeeDue: r.t16FeeDue,
  t16FeeReceived: r.t16FeeReceived,
  t16Pending: r.t16Pending,
  t16FeeReceivedDate: r.t16FeeReceivedDate ?? null,
  t2Retro: r.t2Retro,
  t2FeeDue: r.t2FeeDue,
  t2FeeReceived: r.t2FeeReceived,
  t2Pending: r.t2Pending,
  t2FeeReceivedDate: r.t2FeeReceivedDate ?? null,
  auxRetro: r.auxRetro,
  auxFeeDue: r.auxFeeDue,
  auxFeeReceived: r.auxFeeReceived,
  auxPending: r.auxPending,
  auxFeeReceivedDate: r.auxFeeReceivedDate ?? null,
  totalRetroDue: r.totalRetroDue,
  totalFeesExpected: r.totalFeesExpected,
  totalFeesPaid: r.totalFeesPaid,
});

const fetchFeesClosedRows = async (): Promise<{
  rows: SheetRow[];
  usingMock: boolean;
}> => {
  const cached = fcCache && Date.now() - fcCache.ts < FC_CACHE_TTL ? fcCache : null;
  if (cached) return { rows: cached.rows, usingMock: false };

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

  fcCache = { rows, ts: Date.now() };
  return { rows, usingMock: false };
};

// POST /api/sheets/fees-closed/sync
//   mode=preview  → fetch, match to DB by caseLink, return preview (no writes)
//   mode=upsert   → use cached rows, insert/update feeRecords.isClosed=true
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
      return NextResponse.json({ upserted: 0, created: 0 });
    }

    // Resolve clientIds for selected rows against current DB state.
    // (Main sync may have just inserted some of these cases.)
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

    // Cases selected from the sheet that have no matching cases row yet.
    // We create them with synthetic negative clientIds so they don't collide
    // with real MyCase IDs (which are always positive).
    const matchedNames = new Set(withClientId.map((r) => r.caseName));
    const unmatched = candidates.filter((r) => !matchedNames.has(r.caseName));

    if (withClientId.length === 0 && unmatched.length === 0) {
      return NextResponse.json({ upserted: 0, created: 0 });
    }

    let created = 0;

    await db.transaction(async (tx) => {
      // Bulk upsert feeRecords for cases already in the DB — chunked to avoid
      // parameter limit and reduce round trips (N rows → ceil(N/100) queries).
      const withClientIdVals = withClientId.map((r) => {
        const closedAt = r.closedDate ? new Date(r.closedDate) : new Date();
        return toFeeRecordValues(r, r.clientId, closedAt);
      });

      for (const batch of chunk(withClientIdVals, 100)) {
        await tx
          .insert(feeRecords)
          .values(batch)
          .onConflictDoUpdate({
            target: feeRecords.caseId,
            set: {
              isClosed: sql`excluded.is_closed`,
              closedAt: sql`excluded.closed_at`,
              winSheetStatus: sql`excluded.win_sheet_status`,
              syncStatus: sql`excluded.sync_status`,
              syncedAt: sql`excluded.synced_at`,
              assignedTo: sql`excluded.assigned_to`,
              winSheetLink: sql`excluded.win_sheet_link`,
              feesConfirmation: sql`excluded.fees_confirmation`,
              caseStatus: sql`excluded.case_status`,
              approvedBy: sql`excluded.approved_by`,
              t16Retro: sql`excluded.t16_retro`,
              t16FeeDue: sql`excluded.t16_fee_due`,
              t16FeeReceived: sql`excluded.t16_fee_received`,
              t16Pending: sql`excluded.t16_pending`,
              t16FeeReceivedDate: sql`excluded.t16_fee_received_date`,
              t2Retro: sql`excluded.t2_retro`,
              t2FeeDue: sql`excluded.t2_fee_due`,
              t2FeeReceived: sql`excluded.t2_fee_received`,
              t2Pending: sql`excluded.t2_pending`,
              t2FeeReceivedDate: sql`excluded.t2_fee_received_date`,
              auxRetro: sql`excluded.aux_retro`,
              auxFeeDue: sql`excluded.aux_fee_due`,
              auxFeeReceived: sql`excluded.aux_fee_received`,
              auxPending: sql`excluded.aux_pending`,
              auxFeeReceivedDate: sql`excluded.aux_fee_received_date`,
              totalRetroDue: sql`excluded.total_retro_due`,
              totalFeesExpected: sql`excluded.total_fees_expected`,
              totalFeesPaid: sql`excluded.total_fees_paid`,
              updatedAt: sql`NOW()`,
            },
          });
      }

      // Create cases rows for sheet entries with no DB match, then insert feeRecords.
      // Pre-assign synthetic negative IDs, then bulk-insert both tables in batches.
      const createdIds: number[] = [];
      if (unmatched.length > 0) {
        const [{ minNeg }] = await tx
          .select({ minNeg: sql<number>`COALESCE(MIN(client_id), 0)::int` })
          .from(cases)
          .where(sql`client_id < 0`);

        let nextId = Math.min(minNeg, 0) - 1;

        const unmatchedWithIds = unmatched.map((r) => {
          const clientId = nextId--;
          const { firstName, lastName } = parseNameFromCaseLink(r.caseName);
          return { ...r, clientId, firstName, lastName };
        });

        for (const batch of chunk(unmatchedWithIds, 100)) {
          await tx.insert(cases).values(
            batch.map((r) => ({
              clientId: r.clientId,
              firstName: r.firstName,
              lastName: r.lastName,
              caseLink: r.caseName,
              approvalDate: r.approvalDate ?? undefined,
              claimType: parseClaimType(r.claimType),
              claimTypeLabel: r.claimType?.slice(0, 50) ?? undefined,
              levelWon: r.caseLevel?.slice(0, 50) ?? undefined,
            })),
          );
        }

        const unmatchedFeeVals = unmatchedWithIds.map((r) => {
          const closedAt = r.closedDate ? new Date(r.closedDate) : new Date();
          return toFeeRecordValues(r, r.clientId, closedAt);
        });
        for (const batch of chunk(unmatchedFeeVals, 100)) {
          await tx.insert(feeRecords).values(batch);
        }

        createdIds.push(...unmatchedWithIds.map((r) => r.clientId));
        created += unmatched.length;
      }

      const allCaseIds = [
        ...withClientId.map((r) => r.clientId),
        ...createdIds,
      ];

      if (allCaseIds.length > 0) {
        await tx.insert(activityLog).values(
          allCaseIds.map((caseId) => ({
            caseId,
            message: "Marked closed from Fees Closed sheet during sync.",
            createdBy: "Sheet Sync",
          })),
        );
      }
    });

    return NextResponse.json({ upserted: withClientId.length, created });
  } catch (error) {
    console.error("POST /api/sheets/fees-closed/sync error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
};
