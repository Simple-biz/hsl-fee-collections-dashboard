import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { inArray, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { myCaseDb } from "@/lib/db/mycase";
import { cases, feeRecords, activityLog } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth-helpers";
import { mapMyCaseRows, type MyCaseDbRow } from "@/lib/import/mycase-mapper";
import type { ParsedCaseRow } from "@/lib/import/xlsx-mapper";

export const runtime = "nodejs";
export const maxDuration = 120;

const CHUNK = 500;

const chunked = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const fetchAllMyCaseRows = async (): Promise<MyCaseDbRow[]> =>
  myCaseDb<MyCaseDbRow[]>`
    SELECT c.id, c.name, c.case_stage, c.status, c.opened_date, c.closed_date,
           c.custom_fields_named,
           cl.first_name AS client_first_name,
           cl.last_name  AS client_last_name
    FROM cases c
    LEFT JOIN LATERAL (
      SELECT first_name, last_name
      FROM clients
      WHERE id = ANY(c.clients) AND archived = false
      ORDER BY id
      LIMIT 1
    ) cl ON true
    WHERE (
      c.case_stage ILIKE '10 %'
      OR c.case_stage ILIKE '10A %'
      OR c.case_stage ILIKE '10B %'
      OR c.case_stage ILIKE '10C %'
    )
    ORDER BY c.id
  `;

const fetchMyCaseRowsByIds = async (ids: number[]): Promise<MyCaseDbRow[]> =>
  myCaseDb<MyCaseDbRow[]>`
    SELECT c.id, c.name, c.case_stage, c.status, c.opened_date, c.closed_date,
           c.custom_fields_named,
           cl.first_name AS client_first_name,
           cl.last_name  AS client_last_name
    FROM cases c
    LEFT JOIN LATERAL (
      SELECT first_name, last_name
      FROM clients
      WHERE id = ANY(c.clients) AND archived = false
      ORDER BY id
      LIMIT 1
    ) cl ON true
    WHERE c.id = ANY(${ids}::int[])
      AND (
        c.case_stage ILIKE '10 %'
        OR c.case_stage ILIKE '10A %'
        OR c.case_stage ILIKE '10B %'
        OR c.case_stage ILIKE '10C %'
      )
  `;

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
  t2Decision: r.t2Decision,
  t16Decision: r.t16Decision,
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

// POST /api/mycase/sync
//   mode=preview → diff MyCase DB against local fee collections DB
//   mode=upsert  → body: { selectedClientIds: number[] }
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
      const rawRows = await fetchAllMyCaseRows();
      const { rows: parsed, warnings } = mapMyCaseRows(rawRows);

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
      type ChangedField = { field: string; mycase: string; db: string };

      const getChangedFields = (r: ParsedCaseRow, dbRow: DbRow): ChangedField[] => {
        const f: ChangedField[] = [];
        const s = (field: string, a: string | null | undefined, b: string | null | undefined) => {
          if ((a ?? null) !== (b ?? null))
            f.push({ field, mycase: String(a ?? ""), db: String(b ?? "") });
        };
        const n = (field: string, incoming: string, stored: string | null | undefined) => {
          if (Math.abs(Number(incoming) - Number(stored ?? "0")) >= 0.01)
            f.push({ field, mycase: incoming, db: stored ?? "" });
        };
        const ar = (field: string, arr: string[], dbArr: string[] | null | undefined) => {
          if (
            JSON.stringify([...(arr ?? [])].sort()) !==
            JSON.stringify([...(dbArr ?? [])].sort())
          )
            f.push({ field, mycase: arr.join(","), db: (dbArr ?? []).join(",") });
        };
        s("caseLink", r.caseLink, dbRow.caseLink);
        s("firstName", r.firstName, dbRow.firstName);
        s("lastName", r.lastName, dbRow.lastName);
        s("approvalDate", r.approvalDate, dbRow.approvalDate);
        s("levelWon", r.levelWon, dbRow.levelWon);
        ar("claimType", r.claimType, dbRow.claimType);
        s("claimTypeLabel", r.claimTypeLabel, dbRow.claimTypeLabel);
        s("aljFirstName", r.aljFirstName, dbRow.aljFirstName);
        s("aljLastName", r.aljLastName, dbRow.aljLastName);
        s("assignedTo", r.assignedTo, dbRow.assignedTo);
        s("winSheetStatus", r.winSheetStatus, dbRow.winSheetStatus ?? "not_started");
        s("caseStatus", r.caseStatus, dbRow.caseStatus);
        n("t16Retro", r.t16Retro, dbRow.t16Retro);
        n("t16FeeDue", r.t16FeeDue, dbRow.t16FeeDue);
        n("t16FeeReceived", r.t16FeeReceived, dbRow.t16FeeReceived);
        s("t16FeeReceivedDate", r.t16FeeReceivedDate, dbRow.t16FeeReceivedDate);
        n("t2Retro", r.t2Retro, dbRow.t2Retro);
        n("t2FeeDue", r.t2FeeDue, dbRow.t2FeeDue);
        n("t2FeeReceived", r.t2FeeReceived, dbRow.t2FeeReceived);
        s("t2FeeReceivedDate", r.t2FeeReceivedDate, dbRow.t2FeeReceivedDate);
        return f;
      };

      const dbMap = new Map(allDbCases.map((c) => [c.clientId, c]));
      const myCaseIdSet = new Set(parsed.map((r) => r.clientId));

      const sourceRows = parsed.map((r) => {
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
          totalExpected: (Number(r.t16FeeDue) || 0) + (Number(r.t2FeeDue) || 0),
          hasNotes: !!r.notes,
          status,
          changedFields,
        };
      });

      const missingRows = allDbCases
        .filter((c) => !c.isClosed && !myCaseIdSet.has(c.clientId))
        .map((c) => ({
          clientId: c.clientId,
          caseName: `${c.lastName}, ${c.firstName}`,
          caseLink: c.caseLink ?? "",
          approvalDate: c.approvalDate,
          status: "missing" as const,
        }));

      const newCount = sourceRows.filter((r) => r.status === "new").length;
      const changedCount = sourceRows.filter((r) => r.status === "changed").length;

      return NextResponse.json({
        mode,
        summary: {
          fetched: parsed.length,
          new: newCount,
          changed: changedCount,
          unchanged: parsed.length - newCount - changedCount,
          missing: missingRows.length,
          warnings,
        },
        rows: {
          source: sourceRows,
          missing: missingRows,
        },
      });
    }

    // upsert mode
    let body: { selectedClientIds: unknown };
    try {
      body = (await req.json()) as { selectedClientIds: unknown };
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

    const rawRows = await fetchMyCaseRowsByIds(ids);
    const { rows: parsed } = mapMyCaseRows(rawRows);

    const selectedSet = new Set(ids);
    const candidates = parsed.filter((r) => selectedSet.has(r.clientId));

    if (candidates.length === 0) {
      return NextResponse.json({ inserted: 0, updated: 0 });
    }

    const incomingIds = candidates.map((r) => r.clientId);
    const existing = await db
      .select({ clientId: cases.clientId })
      .from(cases)
      .where(inArray(cases.clientId, incomingIds));
    const existingSet = new Set(existing.map((e) => e.clientId));

    const newRows = candidates.filter((r) => !existingSet.has(r.clientId));
    const updateRows = candidates.filter((r) => existingSet.has(r.clientId));

    let inserted = 0;
    let updated = 0;

    await db.transaction(async (tx) => {
      for (const batch of chunked(newRows, CHUNK)) {
        const insertedCases = await tx
          .insert(cases)
          .values(batch.map(toCaseInsert))
          .onConflictDoNothing({ target: cases.clientId })
          .returning({ clientId: cases.clientId });

        const insertedClientIds = new Set(insertedCases.map((r) => r.clientId));
        const insertedRows = batch.filter((r) => insertedClientIds.has(r.clientId));
        if (insertedRows.length === 0) continue;

        await tx
          .insert(feeRecords)
          .values(insertedRows.map(toFeeInsert))
          .onConflictDoNothing({ target: feeRecords.caseId });

        const withNotes = insertedRows.filter((r) => r.notes);
        if (withNotes.length > 0) {
          await tx.insert(activityLog).values(
            withNotes.map((r) => ({
              caseId: r.clientId,
              message: r.notes!,
              createdBy: "MyCase Sync",
            })),
          );
        }

        inserted += insertedRows.length;
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
              approval_date      = v.approval_date::date,
              level_won          = v.level_won,
              claim_type         = v.claim_type::text[],
              claim_type_label   = v.claim_type_label,
              alj_first_name     = v.alj_first_name,
              alj_last_name      = v.alj_last_name,
              t2_decision        = v.t2_decision::decision_outcome_enum,
              t16_decision       = v.t16_decision::decision_outcome_enum,
              updated_at         = now()
            FROM (VALUES ${sql.join(
              batch.map(
                (r) => sql`(
                ${r.clientId},
                ${r.externalId},
                ${r.caseLink},
                ${r.firstName},
                ${r.lastName},
                ${r.approvalDate},
                ${r.levelWon},
                ${"{" + r.claimType.join(",") + "}"},
                ${r.claimTypeLabel},
                ${r.aljFirstName},
                ${r.aljLastName},
                ${r.t2Decision},
                ${r.t16Decision}
              )`,
              ),
              sql`,`,
            )}) AS v(client_id, external_id, case_link, first_name, last_name, approval_date, level_won, claim_type, claim_type_label, alj_first_name, alj_last_name, t2_decision, t16_decision)
            WHERE cases.client_id = v.client_id::int
          `,
          ),
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
              batch.map(
                (r) => sql`(
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
              )`,
              ),
              sql`,`,
            )}
            ON CONFLICT (case_id) DO UPDATE SET
              assigned_to              = EXCLUDED.assigned_to,
              win_sheet_status         = EXCLUDED.win_sheet_status,
              win_sheet_link           = COALESCE(fee_records.win_sheet_link, EXCLUDED.win_sheet_link),
              win_sheet_link_text      = COALESCE(fee_records.win_sheet_link_text, EXCLUDED.win_sheet_link_text),
              case_status              = EXCLUDED.case_status,
              fees_confirmation        = EXCLUDED.fees_confirmation,
              date_assigned_to_agent   = COALESCE(fee_records.date_assigned_to_agent, EXCLUDED.date_assigned_to_agent),
              approved_by              = COALESCE(fee_records.approved_by, EXCLUDED.approved_by),
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
              updated_at               = now()
          `,
          ),
        ]);
      }
      updated = updateRows.length;
    }

    return NextResponse.json({ inserted, updated });
  } catch (error) {
    console.error("POST /api/mycase/sync error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
};
