import type { ParsedCaseRow } from "./xlsx-mapper";

export type MyCaseDbRow = {
  id: number | string; // postgres.js returns bigint columns as strings
  name: string | null;
  case_stage: string | null;
  status: string | null;
  opened_date: string | null;
  closed_date: string | null;
  custom_fields_named: Record<string, unknown> | null;
  client_first_name: string | null;
  client_last_name: string | null;
};

const cf = (row: MyCaseDbRow, key: string): string | null => {
  const v = row.custom_fields_named?.[key];
  if (v == null || v === "") return null;
  return String(v).trim() || null;
};

const num = (v: string | null): string => {
  if (!v) return "0";
  const n = Number(String(v).replace(/[, $]/g, ""));
  return Number.isFinite(n) ? String(n) : "0";
};

const dateOnly = (v: string | null): string | null => {
  if (!v) return null;
  const s = v.trim();
  const iso = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso) {
    const out = `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
    return Number.isNaN(new Date(out).getTime()) ? null : out;
  }
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mdy) {
    const yy = mdy[3].length === 2 ? `20${mdy[3]}` : mdy[3];
    const out = `${yy}-${mdy[1].padStart(2, "0")}-${mdy[2].padStart(2, "0")}`;
    return Number.isNaN(new Date(out).getTime()) ? null : out;
  }
  return null;
};

const MYCASE_URL_RE = /mycase\.com\/court_cases\/(\d+)/i;

const parseCaseLink = (name: string) => {
  let s = name.trim();
  s = s.replace(/^\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}\s+/, "");
  const parts = s.split(/\s+vs?(?:[.,]\s*|\s+)/i);
  const left = parts[0] || "";
  const right = parts[1] || "";
  const leftClean = left.replace(/\s*\([^)]*\)?$/, "").trim();
  let lastRaw: string, firstRaw: string;
  if (leftClean.includes(",")) {
    [lastRaw, firstRaw] = leftClean.split(/,\s*/);
  } else {
    const tokens = leftClean.split(/\s+/);
    lastRaw = tokens[0] ?? leftClean;
    firstRaw = tokens.slice(1).join(" ");
  }
  const lastName = (lastRaw || leftClean).trim();
  const firstName = (firstRaw || "").trim();
  let aljFirstName: string | null = null;
  let aljLastName: string | null = null;
  const aljClean = right.replace(/^ALJ\s+/i, "").replace(/\s*\([^)]*\)?$/, "").trim();
  if (aljClean && !/^SSA$/i.test(aljClean)) {
    const tokens = aljClean.split(/\s+/);
    if (tokens.length >= 2) {
      aljFirstName = tokens[0];
      aljLastName = tokens.slice(1).join(" ");
    } else {
      aljLastName = tokens[0] ?? null;
    }
  }
  return { firstName, lastName, aljFirstName, aljLastName };
};

const mapClaimType = (raw: string | null) => {
  const s = (raw ?? "").trim().toUpperCase();
  if (!s) return { claimType: [] as string[], claimTypeLabel: null as "T2" | "T16" | "T2_T16" | null };
  if (s.includes("CONC") || (s.includes("T2") && s.includes("T16")))
    return { claimType: ["T2", "T16"], claimTypeLabel: "T2_T16" as const };
  if (s.includes("T16") || s.includes("SSI"))
    return { claimType: ["T16"], claimTypeLabel: "T16" as const };
  if (s.includes("T2") || s.includes("SSDI"))
    return { claimType: ["T2"], claimTypeLabel: "T2" as const };
  return { claimType: [s], claimTypeLabel: null };
};

const mapLevelWon = (raw: string | null): ParsedCaseRow["levelWon"] => {
  const s = (raw ?? "").trim().toUpperCase().replace(/\s+/g, "_");
  if (s === "INITIAL") return "INITIAL";
  if (s === "RECON" || s === "RECONSIDERATION") return "RECON";
  if (s === "HEARING" || s === "ALJ" || s === "ALJ_HEARING") return "HEARING";
  if (s === "AC" || s === "APPEALS_COUNCIL") return "AC";
  if (s === "FEDERAL_COURT" || s === "FEDERAL") return "FEDERAL_COURT";
  if (s === "FEE_PETITION" || s === "FEE_PET") return "FEE_PETITION";
  return null;
};

const mapDecision = (raw: string | null): ParsedCaseRow["t2Decision"] => {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return "unknown";
  if (s.includes("partially favorable")) return "partially_favorable";
  if (s.includes("favorable")) return "fully_favorable";
  if (s.includes("unfavorable") || s.includes("denied") || s === "ufd") return "unfavorable";
  if (s.includes("dismiss")) return "dismissed";
  if (s.includes("remand")) return "remand";
  return "unknown";
};

const mapWinSheetStatus = (row: MyCaseDbRow): ParsedCaseRow["winSheetStatus"] => {
  const pif = (cf(row, "PAID IN FULL") ?? "").toLowerCase();
  if (pif === "yes") return "paid_in_full";

  const stage = (row.case_stage ?? "").toLowerCase();
  if (stage.includes("fees paid") || stage.includes("fee paid")) return "paid_in_full";
  if (stage.includes("pending fees") || stage.includes("fee due") || stage.includes("pending fee"))
    return "pending_payment";
  if (stage.includes("closed") || stage.includes("turndown") || stage.includes("withdraw"))
    return "closed";

  const t2Received = Number(cf(row, "T2 FEE PAID") ?? "0");
  const t16Received = Number(cf(row, "T16 FEE PAID") ?? "0");
  if (t2Received > 0 || t16Received > 0) return "partially_paid";

  const approvalDate = dateOnly(cf(row, "APPROVAL DATE"));
  if (approvalDate) return "in_progress";

  return "not_started";
};

const computeApprovalCategory = (days: number | null): string | null => {
  if (days == null) return null;
  if (days > 60) return ">60";
  if (days > 30) return "31-60";
  return "0-30";
};

export const mapMyCaseRows = (
  rows: MyCaseDbRow[],
): { rows: ParsedCaseRow[]; warnings: { row: number; message: string }[] } => {
  const out: ParsedCaseRow[] = [];
  const warnings: { row: number; message: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];

    const caseLink = r.name?.trim() ?? "";
    if (!caseLink) {
      warnings.push({ row: i + 1, message: `Row ${r.id}: no case name — skipped` });
      continue;
    }

    const { firstName, lastName, aljFirstName, aljLastName } = parseCaseLink(caseLink);

    const resolvedFirst = firstName || r.client_first_name?.trim() || "Unknown";
    const resolvedLast = lastName || r.client_last_name?.trim() || "Unknown";

    const approvalDate = dateOnly(cf(r, "APPROVAL DATE"));

    const daysAfterApproval = approvalDate
      ? Math.floor((Date.now() - new Date(approvalDate).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    const ct = mapClaimType(cf(r, "CLAIM TYPE") ?? cf(r, "What TYPE of CLAIM?"));

    const t2Retro = num(cf(r, "T2 RETRO"));
    const t2FeeDue = num(cf(r, "T2 FEE DUE"));
    const t2FeeReceived = num(cf(r, "T2 FEE PAID") ?? cf(r, "FEE RECEIVED"));
    const t2Pending = String(Math.max(0, Number(t2FeeDue) - Number(t2FeeReceived)));

    const t16Retro = num(cf(r, "T16 RETRO"));
    const t16FeeDue = num(cf(r, "T16 FEE DUE"));
    const t16FeeReceived = num(cf(r, "T16 FEE PAID"));
    const t16Pending = String(Math.max(0, Number(t16FeeDue) - Number(t16FeeReceived)));

    const chronicleLinkRaw = cf(r, "CHRONICLE LINK");
    const chronicleMatch = chronicleLinkRaw?.match(/\/clients\/(\d+)/);
    const externalId = chronicleMatch
      ? chronicleLinkRaw
      : `https://app.mycase.com/court_cases/${r.id}`;

    out.push({
      clientId: Number(r.id),
      externalId: externalId ?? null,
      caseLink,
      firstName: resolvedFirst,
      lastName: resolvedLast,
      approvalDate,
      levelWon: mapLevelWon(cf(r, "Level of Win") ?? cf(r, "STAGE PAID")),
      claimType: ct.claimType,
      claimTypeLabel: ct.claimTypeLabel,
      aljFirstName,
      aljLastName,

      assignedTo: cf(r, "FEE ASSIGNMENT"),
      winSheetStatus: mapWinSheetStatus(r),
      winSheetLink: null,
      winSheetLinkText: null,
      caseStatus: r.case_stage ?? r.status ?? null,
      feesConfirmation: cf(r, "FEES CONFIRMATION")?.slice(0, 50) ?? null,
      dateAssignedToAgent: null,
      approvedBy: null,

      t16Retro,
      t16FeeDue,
      t16FeeReceived,
      t16Pending,
      t16FeeReceivedDate: dateOnly(cf(r, "DATE T16 FEE PAID")),

      t2Retro,
      t2FeeDue,
      t2FeeReceived,
      t2Pending,
      t2FeeReceivedDate: dateOnly(cf(r, "DATE T2 FEE PAID") ?? cf(r, "T2 FEE REC'D DATE")),

      auxRetro: "0",
      auxFeeDue: "0",
      auxFeeReceived: "0",
      auxPending: "0",
      auxFeeReceivedDate: null,

      daysAfterApproval,
      approvalCategory: computeApprovalCategory(daysAfterApproval),
      feesStatus: null,
      weekAssignedToAgent: null,
      monthAssignedToAgent: null,

      t2Decision: mapDecision(cf(r, "T2 DECISION")),
      t16Decision: mapDecision(cf(r, "T16 DECISION")),

      notes: cf(r, "COLLECTION NOTES"),
    });
  }

  return { rows: out, warnings };
};
