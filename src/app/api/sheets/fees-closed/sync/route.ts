import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { cases, feeRecords, activityLog } from "@/lib/db/schema";
import { myCaseDb } from "@/lib/db/mycase";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  mapFeesClosedRows,
  type ParsedFeesClosedRow,
} from "@/lib/import/fees-closed-mapper";
import { parseCaseLink, SYNTHETIC_ID_BASE } from "@/lib/import/sheets-mapper";
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
  nextFollowUpDate: null,
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
    signal: AbortSignal.timeout(55_000),
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

const UpsertBody = z.object({ selectedCaseNames: z.array(z.string()) });

// POST /api/sheets/fees-closed/sync
//   mode=preview  → fetch, resolve IDs from CASE NAME_url, return preview (no writes)
//   mode=upsert   → use cached rows, upsert cases + feeRecords with real MyCase IDs
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

    // Resolve IDs: prefer CASE NAME_url; fall back to mirror DB by name.
    // Normalize whitespace so minor formatting differences don't cause silent misses.
    const normName = (s: string) => s.trim().replace(/\s+/g, " ");
    const noUrlNames = parsed.filter((r) => r.myCaseId == null).map((r) => r.caseName);
    const mirrorRows = noUrlNames.length > 0
      ? await myCaseDb<{ id: string | number; name: string }[]>`
          SELECT id, TRIM(name) AS name FROM cases WHERE TRIM(name) = ANY(${noUrlNames.map(normName)})
        `.catch(() => [] as { id: string | number; name: string }[])
      : [];
    const mirrorMap = new Map(mirrorRows.map((r) => [normName(r.name), Number(r.id)]));

    const resolveId = (r: ParsedFeesClosedRow): number | null =>
      r.myCaseId ?? mirrorMap.get(normName(r.caseName)) ?? null;

    // matchedInDb = already has a closed feeRecord in the local DB.
    const resolvedIds = parsed.map(resolveId).filter((id): id is number => id !== null);
    const existingInDb = resolvedIds.length > 0
      ? await db
          .select({ caseId: feeRecords.caseId })
          .from(feeRecords)
          .where(inArray(feeRecords.caseId, resolvedIds))
          .then((rows) => new Set(rows.map((r) => r.caseId)))
      : new Set<number>();

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
      const clientId = resolveId(r);
      return {
        caseName: r.caseName,
        clientId,
        matchedInDb: clientId !== null && existingInDb.has(clientId),
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
    const parsed2 = UpsertBody.safeParse(await req.json().catch(() => null));
    if (!parsed2.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const selectedSet = new Set(parsed2.data.selectedCaseNames);
    const candidates = parsed.filter((r) => selectedSet.has(r.caseName));

    if (candidates.length === 0) {
      return NextResponse.json({ upserted: 0, created: 0 });
    }

    // Resolve IDs: CASE NAME_url first, then mirror DB, then synthetic.
    const withRealId = candidates
      .map((r) => {
        const clientId = resolveId(r);
        if (clientId == null) return null;
        const { firstName, lastName } = parseCaseLink(r.caseName);
        return { ...r, clientId, firstName, lastName };
      })
      .filter((r): r is ParsedFeesClosedRow & { clientId: number; firstName: string; lastName: string } => r !== null);

    const withoutRealId = candidates.filter((r) => resolveId(r) == null);

    let created = 0;
    let updated = 0;

    await db.transaction(async (tx) => {
      let syntheticRows: (ParsedFeesClosedRow & { clientId: number; firstName: string; lastName: string })[] = [];

      if (withoutRealId.length > 0) {
        const [{ maxSynthetic }] = await tx
          .select({ maxSynthetic: sql<number>`COALESCE(MAX(client_id), ${SYNTHETIC_ID_BASE - 1})::int` })
          .from(cases)
          .where(sql`client_id >= ${SYNTHETIC_ID_BASE}`);
        let nextId = Math.max(maxSynthetic, SYNTHETIC_ID_BASE - 1) + 1;
        syntheticRows = withoutRealId.map((r) => {
          const { firstName, lastName } = parseCaseLink(r.caseName);
          return { ...r, clientId: nextId++, firstName, lastName };
        });
      }

      // Deduplicate by clientId — two sheet rows can resolve to the same mirror ID.
      // Last occurrence wins (most recent data in the sheet).
      const allRowsMap = new Map<number, typeof withRealId[number]>();
      for (const r of [...withRealId, ...syntheticRows]) allRowsMap.set(r.clientId, r);
      const allRows = Array.from(allRowsMap.values());

      // Upsert cases — onConflictDoNothing preserves existing win-sheet data.
      for (const batch of chunk(allRows, 100)) {
        await tx
          .insert(cases)
          .values(
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
          )
          .onConflictDoNothing();
      }

      // Upsert feeRecords — always overwrite with latest sheet values.
      for (const batch of chunk(allRows, 100)) {
        await tx
          .insert(feeRecords)
          .values(
            batch.map((r) => {
              const closedAt = r.closedDate ? new Date(r.closedDate) : new Date();
              return toFeeRecordValues(r, r.clientId, closedAt);
            }),
          )
          .onConflictDoUpdate({
            target: feeRecords.caseId,
            set: {
              isClosed: sql`excluded.is_closed`,
              nextFollowUpDate: sql`excluded.next_follow_up_date`,
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

      const newCaseIds = allRows
        .map((r) => r.clientId)
        .filter((id) => !existingInDb.has(id));
      if (newCaseIds.length > 0) {
        await tx.insert(activityLog).values(
          newCaseIds.map((caseId) => ({
            caseId,
            message: "Marked closed from Fees Closed sheet during sync.",
            createdBy: "Sheet Sync",
          })),
        );
      }

      created = newCaseIds.length;
      updated = allRows.length - newCaseIds.length;
    });

    return NextResponse.json({ upserted: updated, created });
  } catch (error) {
    const cause = (error as { cause?: unknown })?.cause;
    console.error("POST /api/sheets/fees-closed/sync error:", cause ?? error);
    const msg = cause instanceof Error ? cause.message
      : error instanceof Error ? error.message
      : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};
