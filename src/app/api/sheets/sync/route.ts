import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { inArray, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { cases, feeRecords, activityLog } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  mapSheetRows,
  MYCASE_URL_RE,
  MOCK_SHEET_ROWS,
  SYNTHETIC_ID_BASE,
  type SheetRow,
} from "@/lib/import/sheets-mapper";
import { mapFeesClosedRows } from "@/lib/import/fees-closed-mapper";
import type { ParsedCaseRow } from "@/lib/import/xlsx-mapper";

export const runtime = "nodejs";
export const maxDuration = 300;

const CHUNK = 500;
const SHEET_CACHE_TTL = 5 * 60 * 1000;

type SheetCache = { masterRows: SheetRow[]; feesClosedRows: SheetRow[]; ts: number };
let sheetCache: SheetCache | null = null;

const chunked = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const fetchMasterListRows = async (): Promise<{
  rows: SheetRow[];
  usingMock: boolean;
}> => {
  const webhookUrl = process.env.SHEETS_SYNC_WEBHOOK_URL;
  if (!webhookUrl) return { rows: MOCK_SHEET_ROWS, usingMock: true };

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trigger: "manual" }),
    signal: AbortSignal.timeout(55_000),
  });
  if (!res.ok)
    throw new Error(
      `Sheets sync webhook failed (${res.status}): ${await res.text()}`,
    );
  const rows = (await res.json()) as SheetRow[];
  if (!Array.isArray(rows))
    throw new Error("Sheets sync webhook returned invalid response shape");
  return { rows, usingMock: false };
};

const fetchFeesClosedSheetRows = async (): Promise<SheetRow[]> => {
  const webhookUrl = process.env.FEES_CLOSED_SYNC_WEBHOOK_URL;
  if (!webhookUrl) return [];
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trigger: "manual" }),
      signal: AbortSignal.timeout(55_000),
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as SheetRow[];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
};

const toCaseInsert = (r: ParsedCaseRow) => ({
  clientId: r.clientId,
  externalId: r.externalId,
  caseLink: r.caseLink,
  firstName: r.firstName,
  lastName: r.lastName,
  approvalDate: r.approvalDate,
  levelWon: r.levelWon,
  claimType: r.claimType,
  claimTypeLabel: r.claimTypeLabel,
  aljFirstName: r.aljFirstName,
  aljLastName: r.aljLastName,
});

const toFeeInsert = (r: ParsedCaseRow) => ({
  caseId: r.clientId,
  assignedTo: r.assignedTo,
  winSheetStatus: r.winSheetStatus,
  winSheetLink: r.winSheetLink,
  winSheetLinkText: r.winSheetLinkText,
  caseStatus: r.caseStatus,
  feesConfirmation: r.feesConfirmation,
  dateAssignedToAgent: r.dateAssignedToAgent,
  approvedBy: r.approvedBy,
  t16Retro: r.t16Retro,
  t16FeeDue: r.t16FeeDue,
  t16FeeReceived: r.t16FeeReceived,
  t16Pending: r.t16Pending,
  t16FeeReceivedDate: r.t16FeeReceivedDate,
  t2Retro: r.t2Retro,
  t2FeeDue: r.t2FeeDue,
  t2FeeReceived: r.t2FeeReceived,
  t2Pending: r.t2Pending,
  t2FeeReceivedDate: r.t2FeeReceivedDate,
  auxRetro: r.auxRetro,
  auxFeeDue: r.auxFeeDue,
  auxFeeReceived: r.auxFeeReceived,
  auxPending: r.auxPending,
  auxFeeReceivedDate: r.auxFeeReceivedDate,
  daysAfterApproval: r.daysAfterApproval,
  approvalCategory: r.approvalCategory,
  feesStatus: r.feesStatus,
  weekAssignedToAgent: r.weekAssignedToAgent,
  monthAssignedToAgent: r.monthAssignedToAgent,
});

const toClosedAt = (closedDate: string | null): Date | null => {
  if (!closedDate) return null;
  const parsed = new Date(`${closedDate}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

// POST /api/sheets/sync
//   mode=preview  → diff MASTER LIST + Fees Closed sheet vs DB; return all 4 categories
//   mode=upsert   → import new rows, update existing, and mark Fees Closed rows closed
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

    if (mode === "preview") {
      // Fetch MASTER LIST and Fees Closed sheet in parallel
      const [{ rows: masterRaw, usingMock }, feesClosedRaw] = await Promise.all([
        fetchMasterListRows(),
        fetchFeesClosedSheetRows(),
      ]);
      sheetCache = { masterRows: masterRaw, feesClosedRows: feesClosedRaw, ts: Date.now() };

      const { rows: parsed, warnings, needsLink } = mapSheetRows(masterRaw);
      const { rows: feesClosedParsed } = mapFeesClosedRows(feesClosedRaw);

      // Build lookup sets
      const sheetClientIdSet = new Set(parsed.map((r) => r.clientId));
      const feesClosedCaseNameSet = new Set(
        feesClosedParsed.map((r) => r.caseName.trim()),
      );


      // Pull all DB cases + their fee records for diff comparison
      const allDbCases = await db
        .select({
          clientId: cases.clientId,
          caseLink: cases.caseLink,
          firstName: cases.firstName,
          lastName: cases.lastName,
          approvalDate: cases.approvalDate,
          levelWon: cases.levelWon,
          claimType: cases.claimType,
          claimTypeLabel: cases.claimTypeLabel,
          aljFirstName: cases.aljFirstName,
          aljLastName: cases.aljLastName,
          assignedTo: feeRecords.assignedTo,
          winSheetStatus: feeRecords.winSheetStatus,
          caseStatus: feeRecords.caseStatus,
          feesConfirmation: feeRecords.feesConfirmation,
          dateAssignedToAgent: feeRecords.dateAssignedToAgent,
          approvedBy: feeRecords.approvedBy,
          t16Retro: feeRecords.t16Retro,
          t16FeeDue: feeRecords.t16FeeDue,
          t16FeeReceived: feeRecords.t16FeeReceived,
          t16Pending: feeRecords.t16Pending,
          t16FeeReceivedDate: feeRecords.t16FeeReceivedDate,
          t2Retro: feeRecords.t2Retro,
          t2FeeDue: feeRecords.t2FeeDue,
          t2FeeReceived: feeRecords.t2FeeReceived,
          t2Pending: feeRecords.t2Pending,
          t2FeeReceivedDate: feeRecords.t2FeeReceivedDate,
          auxRetro: feeRecords.auxRetro,
          auxFeeDue: feeRecords.auxFeeDue,
          auxFeeReceived: feeRecords.auxFeeReceived,
          auxPending: feeRecords.auxPending,
          auxFeeReceivedDate: feeRecords.auxFeeReceivedDate,
          isClosed: feeRecords.isClosed,
        })
        .from(cases)
        .leftJoin(feeRecords, eq(feeRecords.caseId, cases.clientId));

      type DbRow = (typeof allDbCases)[number];

      type ChangedField = { field: string; sheet: string; db: string };

      const getChangedFields = (r: ParsedCaseRow, db: DbRow): ChangedField[] => {
        const f: ChangedField[] = [];
        const s = (field: string, a: string | null | undefined, b: string | null | undefined) => {
          if ((a ?? null) !== (b ?? null)) f.push({ field, sheet: String(a ?? ""), db: String(b ?? "") });
        };
        // Like `s`, but for fields the upsert preserves rather than blanks
        // when the sheet has no value — a blank sheet cell isn't a "change"
        // since the DB value survives the sync untouched.
        const sPreserveOnBlank = (field: string, a: string | null | undefined, b: string | null | undefined) => {
          if (a != null && a !== (b ?? null)) f.push({ field, sheet: String(a), db: String(b ?? "") });
        };
        // Compare monetary amounts with 1-cent tolerance. The sheet formula (0.25 × retro)
        // produces sub-cent values like 4760.695. Postgres decimal(12,2) stores 4760.70 (rounds
        // up), but JavaScript IEEE 754 stores 4760.695 as 4760.6949... and any JS rounding
        // gives 4760.69 — so string/toFixed comparisons always diverge on the boundary.
        // A difference < $0.01 is purely a precision artifact; any real change is ≥ $1.
        const n = (field: string, sheet: string, db: string | null | undefined) => {
          if (Math.abs(Number(sheet) - Number(db ?? "0")) >= 0.01)
            f.push({ field, sheet, db: db ?? "" });
        };
        const a = (field: string, arr: string[], dbArr: string[] | null | undefined) => {
          if (JSON.stringify([...(arr ?? [])].sort()) !== JSON.stringify([...(dbArr ?? [])].sort()))
            f.push({ field, sheet: arr.join(","), db: (dbArr ?? []).join(",") });
        };
        s("caseLink", r.caseLink, db.caseLink);
        s("firstName", r.firstName, db.firstName);
        s("lastName", r.lastName, db.lastName);
        s("approvalDate", r.approvalDate, db.approvalDate);
        s("levelWon", r.levelWon, db.levelWon);
        a("claimType", r.claimType, db.claimType);
        s("claimTypeLabel", r.claimTypeLabel, db.claimTypeLabel);
        s("aljFirstName", r.aljFirstName, db.aljFirstName);
        s("aljLastName", r.aljLastName, db.aljLastName);
        s("assignedTo", r.assignedTo, db.assignedTo);
        s("winSheetStatus", r.winSheetStatus, db.winSheetStatus ?? "not_started");
        s("caseStatus", r.caseStatus, db.caseStatus);
        sPreserveOnBlank("feesConfirmation", r.feesConfirmation, db.feesConfirmation);
        s("dateAssignedToAgent", r.dateAssignedToAgent, db.dateAssignedToAgent);
        s("approvedBy", r.approvedBy, db.approvedBy);
        n("t16Retro", r.t16Retro, db.t16Retro);
        n("t16FeeDue", r.t16FeeDue, db.t16FeeDue);
        n("t16FeeReceived", r.t16FeeReceived, db.t16FeeReceived);
        // t16Pending excluded: sheet webhook doesn't reliably return this column;
        // the DB value is preserved by CASE WHEN in the upsert.
        s("t16FeeReceivedDate", r.t16FeeReceivedDate, db.t16FeeReceivedDate);
        n("t2Retro", r.t2Retro, db.t2Retro);
        n("t2FeeDue", r.t2FeeDue, db.t2FeeDue);
        n("t2FeeReceived", r.t2FeeReceived, db.t2FeeReceived);
        // t2Pending excluded — same reason as t16Pending above.
        s("t2FeeReceivedDate", r.t2FeeReceivedDate, db.t2FeeReceivedDate);
        n("auxRetro", r.auxRetro, db.auxRetro);
        n("auxFeeDue", r.auxFeeDue, db.auxFeeDue);
        n("auxFeeReceived", r.auxFeeReceived, db.auxFeeReceived);
        // auxPending excluded — same reason as t16Pending above.
        s("auxFeeReceivedDate", r.auxFeeReceivedDate, db.auxFeeReceivedDate);
        return f;
      };

      const dbMap = new Map(allDbCases.map((c) => [c.clientId, c]));

      // Category 1 & 2: sheet rows — new vs changed vs unchanged
      const sheetRows = parsed.map((r) => {
        const dbEntry = dbMap.get(r.clientId);
        const changedFields = dbEntry ? getChangedFields(r, dbEntry) : [];
        const status = !dbEntry ? "new" : changedFields.length > 0 ? "changed" : "unchanged";
        return {
          clientId: r.clientId,
          caseName: `${r.lastName}, ${r.firstName}`,
          caseLink: r.caseLink,
          externalUrl: r.externalId,
          approvalDate: r.approvalDate,
          assignedTo: r.assignedTo,
          winSheetStatus: r.winSheetStatus,
          winSheetLink: r.winSheetLink,
          winSheetLinkText: r.winSheetLinkText,
          totalExpected:
            (Number(r.t16FeeDue) || 0) +
            (Number(r.t2FeeDue) || 0) +
            (Number(r.auxFeeDue) || 0),
          hasNotes: !!r.notes,
          isSynthetic: r.clientId >= SYNTHETIC_ID_BASE,
          status,
          changedFields,
        };
      });

      // Category 3 & 4: DB-only rows (cases table entries not in the sheet)
      const dbOnlyCases = allDbCases.filter(
        (c) => !sheetClientIdSet.has(c.clientId),
      );

      const feesClosedRows = dbOnlyCases
        .filter((c) => !c.isClosed && c.caseLink && feesClosedCaseNameSet.has(c.caseLink.trim()))
        .map((c) => ({
          clientId: c.clientId,
          caseName: `${c.lastName}, ${c.firstName}`,
          caseLink: c.caseLink ?? "",
          approvalDate: c.approvalDate,
          status: "fees_closed" as const,
        }));

      const missingRows = dbOnlyCases
        .filter((c) => !c.isClosed && (!c.caseLink || !feesClosedCaseNameSet.has(c.caseLink.trim())))
        .map((c) => ({
          clientId: c.clientId,
          caseName: `${c.lastName}, ${c.firstName}`,
          caseLink: c.caseLink ?? "",
          approvalDate: c.approvalDate,
          status: "missing" as const,
        }));

      // Closed DB cases whose caseLink is not in the Fees Closed sheet
      const missingClosedRows = allDbCases
        .filter(
          (c) =>
            c.isClosed &&
            !sheetClientIdSet.has(c.clientId) &&
            (!c.caseLink || !feesClosedCaseNameSet.has(c.caseLink.trim())),
        )
        .map((c) => ({
          clientId: c.clientId,
          caseName: `${c.lastName}, ${c.firstName}`,
          caseLink: c.caseLink ?? "",
          approvalDate: c.approvalDate,
          status: "missing_closed" as const,
        }));

      const newCount = sheetRows.filter((r) => r.status === "new").length;
      const changedCount = sheetRows.filter((r) => r.status === "changed").length;

      return NextResponse.json({
        mode,
        usingMock,
        summary: {
          fetched: parsed.length,
          new: newCount,
          changed: changedCount,
          unchanged: parsed.length - newCount - changedCount,
          feesClosed: feesClosedRows.length,
          missing: missingRows.length,
          missingClosed: missingClosedRows.length,
          synthetic: sheetRows.filter((r) => r.isSynthetic).length,
          needsLink: needsLink.length,
          warnings,
        },
        rows: {
          sheet: sheetRows,
          feesClosed: feesClosedRows,
          missing: missingRows,
          missingClosed: missingClosedRows,
          needsLink,
        },
      });
    }

    // upsert mode
    let body: { selectedClientIds: unknown; linkOverrides?: unknown };
    try {
      body = (await req.json()) as { selectedClientIds: unknown; linkOverrides?: unknown };
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    if (!Array.isArray(body.selectedClientIds)) {
      return NextResponse.json(
        { error: "selectedClientIds must be an array" },
        { status: 400 },
      );
    }
    if (body.selectedClientIds.length > 1000) {
      return NextResponse.json(
        { error: "selectedClientIds exceeds maximum of 1000" },
        { status: 400 },
      );
    }
    const ids = Array.from(new Set((body.selectedClientIds as unknown[]).map(Number)));

    if (ids.some((n) => !Number.isInteger(n))) {
      return NextResponse.json(
        { error: "selectedClientIds must contain only integers" },
        { status: 400 },
      );
    }

    const rawOverrides: Record<string, string> =
      body.linkOverrides != null && typeof body.linkOverrides === "object" && !Array.isArray(body.linkOverrides)
        ? Object.fromEntries(
            Object.entries(body.linkOverrides as Record<string, unknown>).filter(
              (entry): entry is [string, string] => typeof entry[1] === "string",
            ),
          )
        : {};

    const selectedSet = new Set(ids);

    const cached = sheetCache && Date.now() - sheetCache.ts < SHEET_CACHE_TTL ? sheetCache : null;
    const [{ rows: rawRows }, feesClosedRaw] = cached
      ? [{ rows: cached.masterRows }, cached.feesClosedRows]
      : await Promise.all([fetchMasterListRows(), fetchFeesClosedSheetRows()]);
    if (!cached) sheetCache = { masterRows: rawRows, feesClosedRows: feesClosedRaw, ts: Date.now() };

    const patchedRows = rawRows.map((r, i) => {
      const override = rawOverrides[String(i + 2)];
      if (!override) return r;
      if (!MYCASE_URL_RE.test(override)) return r;
      return { ...r, "CASE LINK_url": override };
    });
    rawRows.forEach((_, i) => {
      const override = rawOverrides[String(i + 2)];
      if (!override) return;
      const match = override.match(MYCASE_URL_RE);
      if (match) selectedSet.add(Number(match[1]));
    });

    const { rows: parsed } = mapSheetRows(patchedRows);
    const { rows: feesClosedParsed } = mapFeesClosedRows(feesClosedRaw);

    const seenCandidates = new Set<number>();

    const candidates = parsed.filter((r) => {
      if (!selectedSet.has(r.clientId)) return false;
      if (seenCandidates.has(r.clientId)) return false;

      seenCandidates.add(r.clientId);
      return true;
    });

    const sheetClientIdSet = new Set(parsed.map((r) => r.clientId));
    const feesClosedByCaseName = new Map(
      feesClosedParsed.map((r) => [r.caseName.trim(), r]),
    );

    const selectedDbCases =
      ids.length > 0
        ? await db
            .select({ clientId: cases.clientId, caseLink: cases.caseLink })
            .from(cases)
            .where(inArray(cases.clientId, ids))
        : [];

    const feesClosedMatches = selectedDbCases.flatMap((c) => {
      if (sheetClientIdSet.has(c.clientId) || !c.caseLink) return [];
      const feesClosedRow = feesClosedByCaseName.get(c.caseLink.trim());
      return feesClosedRow
        ? [{ clientId: c.clientId, closedAt: toClosedAt(feesClosedRow.closedDate) }]
        : [];
    });

    if (candidates.length === 0 && feesClosedMatches.length === 0) {
      return NextResponse.json({ inserted: 0, updated: 0, closed: 0 });
    }

    const incomingIds = candidates.map((r) => r.clientId);
    const existing =
      incomingIds.length > 0
        ? await db
            .select({ clientId: cases.clientId })
            .from(cases)
            .where(inArray(cases.clientId, incomingIds))
        : [];
    const existingSet = new Set(existing.map((e) => e.clientId));

    const newRows = candidates.filter((r) => !existingSet.has(r.clientId));
    const updateRows = candidates.filter((r) => existingSet.has(r.clientId));

    let inserted = 0;
    let updated = 0;
    let closed = 0;

    await db.transaction(async (tx) => {
      for (const batch of chunked(newRows, CHUNK)) {
        const insertedCases = await tx
          .insert(cases)
          .values(batch.map(toCaseInsert))
          .onConflictDoNothing({
            target: cases.clientId,
          })
          .returning({ clientId: cases.clientId });

        const insertedClientIds = new Set(insertedCases.map((r) => r.clientId));
        const insertedRows = batch.filter((r) => insertedClientIds.has(r.clientId));

        if (insertedRows.length === 0) continue;

        await tx
          .insert(feeRecords)
          .values(insertedRows.map(toFeeInsert))
          .onConflictDoNothing({
            target: feeRecords.caseId,
          });

        const withNotes = insertedRows.filter((r) => r.notes);
        if (withNotes.length > 0) {
          await tx.insert(activityLog).values(
            withNotes.map((r) => ({
              caseId: r.clientId,
              message: r.notes!,
              createdBy: "Sheet Sync",
            })),
          );
        }

        inserted += insertedRows.length;
      }
      for (const batch of chunked(feesClosedMatches, CHUNK)) {
        if (batch.length === 0) continue;

        for (const row of batch) {
          await tx
            .insert(feeRecords)
            .values({
              caseId: row.clientId,
              isClosed: true,
              nextFollowUpDate: null,
              closedAt: row.closedAt,
              winSheetStatus: "closed",
              syncStatus: "synced",
              syncedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: feeRecords.caseId,
              set: {
                isClosed: true,
                nextFollowUpDate: null,
                closedAt: row.closedAt,
                winSheetStatus: "closed",
                syncStatus: "synced",
                syncedAt: new Date(),
                updatedAt: new Date(),
              },
            });
        }

        await tx.insert(activityLog).values(
          batch.map((row) => ({
            caseId: row.clientId,
            message: "Marked closed from Fees Closed sheet during Google Sheets sync.",
            createdBy: "Sheet Sync",
          })),
        );
        closed += batch.length;
      }
    });

    if (updateRows.length > 0) {
      for (const batch of chunked(updateRows, CHUNK)) {
        await Promise.all([
          db.execute(sql`
            UPDATE cases SET
              external_id        = v.external_id,
              case_link          = v.case_link,
              first_name         = v.first_name,
              last_name          = v.last_name,
              -- Once set, a sync never overwrites approval_date — see the
              -- matching comment in the MyCase sync route.
              approval_date      = COALESCE(cases.approval_date, v.approval_date::date),
              level_won          = v.level_won,
              claim_type         = v.claim_type::text[],
              claim_type_label   = v.claim_type_label,
              alj_first_name     = v.alj_first_name,
              alj_last_name      = v.alj_last_name,
              updated_at         = now()
            FROM (VALUES ${sql.join(
              batch.map((r) => sql`(
                ${r.clientId},
                ${r.externalId},
                ${r.caseLink},
                ${r.firstName},
                ${r.lastName},
                ${r.approvalDate},
                ${r.levelWon},
                ${'{' + r.claimType.join(',') + '}'},
                ${r.claimTypeLabel},
                ${r.aljFirstName},
                ${r.aljLastName}
              )`),
              sql`,`,
            )}) AS v(client_id, external_id, case_link, first_name, last_name, approval_date, level_won, claim_type, claim_type_label, alj_first_name, alj_last_name)
            WHERE cases.client_id = v.client_id::int
          `),
          // Upsert fee_records so cases that somehow have no fee_record row still get written.
          // COALESCE preserves the existing DB win_sheet_link rather than overwriting it.
          db.execute(sql`
            INSERT INTO fee_records (
              case_id, assigned_to, win_sheet_status, win_sheet_link, win_sheet_link_text,
              case_status, fees_confirmation, date_assigned_to_agent, approved_by,
              t16_retro, t16_fee_due, t16_fee_received, t16_pending, t16_fee_received_date,
              t2_retro, t2_fee_due, t2_fee_received, t2_pending, t2_fee_received_date,
              aux_retro, aux_fee_due, aux_fee_received, aux_pending, aux_fee_received_date,
              days_after_approval, approval_category, fees_status,
              week_assigned_to_agent, month_assigned_to_agent
            )
            VALUES ${sql.join(
              batch.map((r) => sql`(
                ${r.clientId},
                ${r.assignedTo},
                ${r.winSheetStatus},
                ${r.winSheetLink},
                ${r.winSheetLinkText},
                ${r.caseStatus},
                ${r.feesConfirmation},
                ${r.dateAssignedToAgent}::date,
                ${r.approvedBy},
                ${r.t16Retro}::numeric,
                ${r.t16FeeDue}::numeric,
                ${r.t16FeeReceived}::numeric,
                ${r.t16Pending}::numeric,
                ${r.t16FeeReceivedDate}::date,
                ${r.t2Retro}::numeric,
                ${r.t2FeeDue}::numeric,
                ${r.t2FeeReceived}::numeric,
                ${r.t2Pending}::numeric,
                ${r.t2FeeReceivedDate}::date,
                ${r.auxRetro}::numeric,
                ${r.auxFeeDue}::numeric,
                ${r.auxFeeReceived}::numeric,
                ${r.auxPending}::numeric,
                ${r.auxFeeReceivedDate}::date,
                ${r.daysAfterApproval}::int,
                ${r.approvalCategory},
                ${r.feesStatus},
                ${r.weekAssignedToAgent},
                ${r.monthAssignedToAgent}
              )`),
              sql`,`,
            )}
            ON CONFLICT (case_id) DO UPDATE SET
              assigned_to              = EXCLUDED.assigned_to,
              win_sheet_status         = EXCLUDED.win_sheet_status,
              win_sheet_link           = COALESCE(fee_records.win_sheet_link, EXCLUDED.win_sheet_link),
              win_sheet_link_text      = EXCLUDED.win_sheet_link_text,
              case_status              = EXCLUDED.case_status,
              fees_confirmation        = CASE WHEN EXCLUDED.fees_confirmation IS NOT NULL THEN EXCLUDED.fees_confirmation ELSE fee_records.fees_confirmation END,
              date_assigned_to_agent   = EXCLUDED.date_assigned_to_agent,
              approved_by              = EXCLUDED.approved_by,
              t16_retro                = EXCLUDED.t16_retro,
              t16_fee_due              = EXCLUDED.t16_fee_due,
              t16_fee_received         = EXCLUDED.t16_fee_received,
              t16_pending              = CASE WHEN EXCLUDED.t16_pending::numeric != 0 THEN EXCLUDED.t16_pending ELSE fee_records.t16_pending END,
              t16_fee_received_date    = EXCLUDED.t16_fee_received_date,
              t2_retro                 = EXCLUDED.t2_retro,
              t2_fee_due               = EXCLUDED.t2_fee_due,
              t2_fee_received          = EXCLUDED.t2_fee_received,
              t2_pending               = CASE WHEN EXCLUDED.t2_pending::numeric != 0 THEN EXCLUDED.t2_pending ELSE fee_records.t2_pending END,
              t2_fee_received_date     = EXCLUDED.t2_fee_received_date,
              aux_retro                = EXCLUDED.aux_retro,
              aux_fee_due              = EXCLUDED.aux_fee_due,
              aux_fee_received         = EXCLUDED.aux_fee_received,
              aux_pending              = CASE WHEN EXCLUDED.aux_pending::numeric != 0 THEN EXCLUDED.aux_pending ELSE fee_records.aux_pending END,
              aux_fee_received_date    = EXCLUDED.aux_fee_received_date,
              days_after_approval      = EXCLUDED.days_after_approval,
              approval_category        = EXCLUDED.approval_category,
              fees_status              = EXCLUDED.fees_status,
              week_assigned_to_agent   = EXCLUDED.week_assigned_to_agent,
              month_assigned_to_agent  = EXCLUDED.month_assigned_to_agent,
              updated_at               = now()
          `),
        ]);
      }
      updated = updateRows.length;
    }

    return NextResponse.json({ inserted, updated, closed });
  } catch (error) {
    console.error("POST /api/sheets/sync error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
};
