import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { cases, userDetails } from "@/lib/db/schema";
import { myCaseDb } from "@/lib/db/mycase";
import { mapMyCaseRows, type MyCaseDbRow } from "@/lib/import/mycase-mapper";
import { fetchCaseDetails } from "@/lib/mycase-proxy";
import { fetchChronicleClient, parseChronicleResponse } from "@/lib/chronicle-client";
import { auth } from "@/auth";

const CHRONICLE_LINK_FIELD_ID = 1101112;

const resolveId = async (context: {
  params: { id: string } | Promise<{ id: string }>;
}) => {
  const p = context.params instanceof Promise ? await context.params : context.params;
  return parseInt(p.id);
};

// GET /api/mycase/cases/[id]/details
// Resolution order for each field:
//   1. MyCase mirror DB (custom_fields_named)
//   2. Live MyCase API via n8n webhook (only for chronicleLink)
//   3. Chronicle API (only for t2/t16 decisions when mirror returns "unknown")
//   4. Local app DB (cases + user_details) — fills whatever is still null
export const GET = async (
  _req: NextRequest,
  context: { params: { id: string } | Promise<{ id: string }> },
) => {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const caseId = await resolveId(context);
    if (!Number.isFinite(caseId)) {
      return NextResponse.json({ error: "Invalid case ID" }, { status: 400 });
    }

    // Fire mirror DB and local DB in parallel.
    const [rows, localRows] = await Promise.all([
      myCaseDb<MyCaseDbRow[]>`
        SELECT c.id, c.name, c.case_stage, c.status, c.opened_date, c.closed_date,
               c.custom_fields_named, c.case_number,
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
        WHERE c.id = ${caseId}
        LIMIT 1
      `,
      db
        .select({
          approvalDate: cases.approvalDate,
          claimTypeLabel: cases.claimTypeLabel,
          levelWon: cases.levelWon,
          t2Decision: cases.t2Decision,
          t16Decision: cases.t16Decision,
          chronicleId: userDetails.chronicleId,
          ssnLast4: userDetails.ssnLast4,
        })
        .from(cases)
        .leftJoin(userDetails, eq(userDetails.caseId, cases.clientId))
        .where(eq(cases.clientId, caseId))
        .limit(1),
    ]);

    if (rows.length === 0) {
      return NextResponse.json({ error: "Case not found in MyCase" }, { status: 404 });
    }

    const { rows: mapped, warnings } = mapMyCaseRows(rows);
    if (mapped.length === 0) {
      return NextResponse.json({ error: "Case could not be mapped", warnings }, { status: 422 });
    }

    const r = mapped[0];
    const local = localRows[0] ?? null;

    // --- Chronicle link (3-step) ---
    const rawMirrorLink = rows[0].custom_fields_named?.["CHRONICLE LINK"];
    let chronicleLink =
      typeof rawMirrorLink === "string" && rawMirrorLink.includes("chroniclelegal.com")
        ? rawMirrorLink.trim()
        : null;

    if (!chronicleLink) {
      const liveDetail = await fetchCaseDetails(caseId).catch(() => null);
      const liveField = liveDetail?.custom_field_values?.find(
        (f) => f.custom_field.id === CHRONICLE_LINK_FIELD_ID,
      );
      if (typeof liveField?.value === "string" && liveField.value.includes("chroniclelegal.com")) {
        chronicleLink = liveField.value.trim();
      }
    }

    if (!chronicleLink && local?.chronicleId != null) {
      chronicleLink = `https://app.chroniclelegal.com/dashboard/clients/${local.chronicleId}`;
    }

    // --- Fill remaining nulls from local DB ---
    const approvalDate = r.approvalDate ?? local?.approvalDate ?? null;
    const claimTypeLabel = r.claimTypeLabel ?? local?.claimTypeLabel ?? null;
    const levelWon = r.levelWon ?? local?.levelWon ?? null;

    // --- SSN last 4 (local DB → mirror → Chronicle) ---
    let ssnLast4: string | null = local?.ssnLast4 ?? null;
    if (!ssnLast4 && rows[0].case_number) {
      const digits = rows[0].case_number.replace(/\D/g, "");
      if (digits.length >= 4) ssnLast4 = digits.slice(-4);
    }

    // --- Decisions (mirror → Chronicle → local DB) ---
    let t2Decision: string = r.t2Decision !== "unknown" ? r.t2Decision : "unknown";
    let t16Decision: string = r.t16Decision !== "unknown" ? r.t16Decision : "unknown";

    // user_details.chronicle_id may not be backfilled yet; fall back to the ID
    // embedded in the chronicle link sourced from the mirror's CHRONICLE LINK field.
    const chronicleIdForDecisions: number | null =
      local?.chronicleId ??
      (() => {
        if (!chronicleLink) return null;
        const m = chronicleLink.match(/\/clients\/(\d+)/);
        return m ? parseInt(m[1]) : null;
      })();

    const needsChronicle =
      (t2Decision === "unknown" || t16Decision === "unknown" || !ssnLast4) &&
      chronicleIdForDecisions != null;

    if (needsChronicle) {
      const apiUrl = process.env.CHRONICLE_API_URL ?? process.env.CHRONICLE_BASE_URL ?? "";
      const apiKey = process.env.CHRONICLE_API_KEY ?? "";
      if (apiUrl && apiKey) {
        const raw = await fetchChronicleClient(chronicleIdForDecisions!, apiUrl, apiKey).catch(() => null);
        if (raw) {
          const chr = parseChronicleResponse(raw);
          if (t2Decision === "unknown" && chr.t2Decision) t2Decision = chr.t2Decision;
          if (t16Decision === "unknown" && chr.t16Decision) t16Decision = chr.t16Decision;
          if (!ssnLast4 && chr.last4Ssn) ssnLast4 = chr.last4Ssn;
        }
      }
    }

    if (t2Decision === "unknown") t2Decision = local?.t2Decision ?? "unknown";
    if (t16Decision === "unknown") t16Decision = local?.t16Decision ?? "unknown";

    return NextResponse.json({
      data: {
        caseStage: rows[0].case_stage,
        approvalDate,
        assignedTo: r.assignedTo,
        winSheetStatus: r.winSheetStatus,
        claimTypeLabel,
        levelWon,
        chronicleLink,
        ssnLast4,
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
        feesConfirmation: r.feesConfirmation,
        t2Decision,
        t16Decision,
        notes: r.notes,
      },
      warnings,
    });
  } catch (err) {
    console.error("GET /api/mycase/cases/[id]/details error:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
};
