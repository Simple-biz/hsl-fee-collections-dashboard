import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

interface ImportCase {
  chronicleClientId: number;
  firstName: string;
  lastName: string;
  last4Ssn: string;
  claimType: "T2" | "T16" | "T2_T16";
  officeWithJurisdiction: string;
  caseLevel: string;
  statusDate: string | null;
  t2Decision: string | null;
  t16Decision: string | null;
  feeAgreement: boolean;
  feePetition: boolean;
  reportType: string;
  favorableTypes: string[];
}

// PDF fields the user can select for import
interface PdfFields {
  fullSsn?: string | null;
  dob?: string | null;
  email?: string | null;
  phone?: string | null;
  primaryDiagnosis?: string | null;
  primaryDiagnosisCode?: string | null;
  secondaryDiagnosis?: string | null;
  secondaryDiagnosisCode?: string | null;
  allegations?: string | null;
  dateLastInsured?: string | null;
  blindDli?: string | null;
  feeMethod?: "fee_agreement" | "fee_petition" | null;
  feeCapAtSigning?: number | null;
  feeAgreementDate?: string | null;
  firmName?: string | null;
  firmEin?: string | null;
  hearingOffice?: string | null;
  representatives?: { name: string; repId: string | null }[] | null;
  decisionHistory?:
    | {
        level: string;
        claimType: string;
        result: string;
        date: string | null;
      }[]
    | null;
}

// POST /api/chronicle/import — Import selected cases into DB with optional PDF-extracted fields
export const POST = async (req: NextRequest) => {
  try {
    const body = await req.json();
    const importCases: ImportCase[] = body.cases;
    const pdfFields: PdfFields | null = body.pdfFields || null;

    if (!importCases || importCases.length === 0) {
      return NextResponse.json(
        { error: "No cases to import" },
        { status: 400 },
      );
    }

    const imported: { clientId: number; name: string }[] = [];
    const errors: { name: string; error: string }[] = [];

    for (const c of importCases) {
      try {
        const clientId = c.chronicleClientId;

        const t2Dec = c.t2Decision?.toLowerCase().includes("favorable")
          ? "fully_favorable"
          : c.t2Decision?.toLowerCase().includes("unfavorable")
            ? "unfavorable"
            : c.t2Decision?.toLowerCase().includes("dismissal")
              ? "dismissed"
              : c.t2Decision
                ? "unknown"
                : null;

        const t16Dec = c.t16Decision?.toLowerCase().includes("favorable")
          ? "fully_favorable"
          : c.t16Decision?.toLowerCase().includes("unfavorable")
            ? "unfavorable"
            : c.t16Decision?.toLowerCase().includes("dismissal")
              ? "dismissed"
              : c.t16Decision
                ? "unknown"
                : null;

        const levelWon = ["INITIAL", "RECON", "HEARING", "AC"].includes(
          c.caseLevel,
        )
          ? c.caseLevel
          : "HEARING";

        // Build the INSERT with base fields + any selected PDF fields
        const columns = [
          "client_id",
          "first_name",
          "last_name",
          "last4_ssn",
          "claim_type",
          "claim_type_label",
          "level_won",
          "t2_decision",
          "t16_decision",
          "approval_date",
          "office_with_jurisdiction",
        ];
        const values: (string | number | null | string[])[] = [
          clientId,
          c.firstName,
          c.lastName,
          c.last4Ssn.replace(/\D/g, "").slice(-4),
          c.claimType === "T2_T16"
            ? ["T2", "T16"]
            : c.claimType === "T16"
              ? ["T16"]
              : ["T2"],
          c.claimType,
          levelWon,
          t2Dec,
          t16Dec,
          c.statusDate || null,
          c.officeWithJurisdiction,
        ];

        // Append selected PDF fields
        if (pdfFields) {
          if (pdfFields.fullSsn !== undefined) {
            columns.push("full_ssn");
            values.push(pdfFields.fullSsn);
          }
          if (pdfFields.dob !== undefined) {
            columns.push("dob");
            values.push(pdfFields.dob);
          }
          if (pdfFields.email !== undefined) {
            columns.push("email");
            values.push(pdfFields.email);
          }
          if (pdfFields.phone !== undefined) {
            columns.push("phone");
            values.push(pdfFields.phone);
          }
          if (pdfFields.primaryDiagnosis !== undefined) {
            columns.push("primary_diagnosis");
            values.push(pdfFields.primaryDiagnosis);
          }
          if (pdfFields.primaryDiagnosisCode !== undefined) {
            columns.push("primary_diagnosis_code");
            values.push(pdfFields.primaryDiagnosisCode);
          }
          if (pdfFields.secondaryDiagnosis !== undefined) {
            columns.push("secondary_diagnosis");
            values.push(pdfFields.secondaryDiagnosis);
          }
          if (pdfFields.secondaryDiagnosisCode !== undefined) {
            columns.push("secondary_diagnosis_code");
            values.push(pdfFields.secondaryDiagnosisCode);
          }
          if (pdfFields.allegations !== undefined) {
            columns.push("allegations");
            values.push(pdfFields.allegations);
          }
          if (pdfFields.dateLastInsured !== undefined) {
            columns.push("last_insured");
            values.push(pdfFields.dateLastInsured);
          }
          if (pdfFields.blindDli !== undefined) {
            columns.push("blind_dli");
            values.push(pdfFields.blindDli);
          }
          if (pdfFields.firmName !== undefined) {
            columns.push("firm_name");
            values.push(pdfFields.firmName);
          }
          if (pdfFields.firmEin !== undefined) {
            columns.push("firm_ein");
            values.push(pdfFields.firmEin);
          }
          if (pdfFields.hearingOffice !== undefined) {
            columns.push("hearing_office");
            values.push(pdfFields.hearingOffice);
          }
        }

        // Use parameterized query for the dynamic columns
        // Build SQL manually with positional params
        const claimArraySql =
          c.claimType === "T2_T16"
            ? `ARRAY['T2','T16']`
            : c.claimType === "T16"
              ? `ARRAY['T16']`
              : `ARRAY['T2']`;

        // For the base insert, use raw SQL with parameters
        await db.execute(
          sql.raw(`
          INSERT INTO cases (${columns.join(", ")})
          VALUES (
            ${clientId},
            '${esc(c.firstName)}',
            '${esc(c.lastName)}',
            '${c.last4Ssn.replace(/\D/g, "").slice(-4)}',
            ${claimArraySql},
            '${esc(c.claimType)}',
            '${esc(levelWon)}',
            ${t2Dec ? `'${esc(t2Dec)}'` : "NULL"},
            ${t16Dec ? `'${esc(t16Dec)}'` : "NULL"},
            ${c.statusDate ? `'${esc(c.statusDate)}'` : "NULL"},
            '${esc(c.officeWithJurisdiction)}'
            ${pdfFields ? buildPdfValuesSql(pdfFields) : ""}
          )
        `),
        );

        // Create fee record with optional PDF fee fields
        const feeMethod =
          pdfFields?.feeMethod ||
          (c.feePetition ? "fee_petition" : "fee_agreement");
        const feeCap = pdfFields?.feeCapAtSigning ?? 9200;
        const feeAgmtDate = pdfFields?.feeAgreementDate || null;

        await db.execute(
          sql.raw(`
          INSERT INTO fee_records (case_id, assigned_to, win_sheet_status, fee_method, applicable_fee_cap, fee_agreement_date, fee_computed)
          VALUES (
            ${clientId},
            NULL,
            'not_started',
            '${esc(feeMethod)}',
            ${feeCap},
            ${feeAgmtDate ? `'${esc(feeAgmtDate)}'` : "NULL"},
            FALSE
          )
        `),
        );

        // Store representatives and decision history as JSONB if selected
        if (pdfFields?.representatives) {
          await db.execute(
            sql.raw(`
            UPDATE cases SET representatives = '${esc(JSON.stringify(pdfFields.representatives))}'::jsonb
            WHERE client_id = ${clientId}
          `),
          );
        }
        if (pdfFields?.decisionHistory) {
          await db.execute(
            sql.raw(`
            UPDATE cases SET decision_history = '${esc(JSON.stringify(pdfFields.decisionHistory))}'::jsonb
            WHERE client_id = ${clientId}
          `),
          );
        }

        // Build activity log message
        const pdfFieldNames = pdfFields
          ? Object.keys(pdfFields).filter(
              (k) => (pdfFields as Record<string, unknown>)[k] != null,
            )
          : [];
        const pdfNote =
          pdfFieldNames.length > 0
            ? ` PDF fields imported: ${pdfFieldNames.length}.`
            : "";

        await db.execute(
          sql.raw(`
          INSERT INTO activity_log (case_id, message, created_by)
          VALUES (
            ${clientId},
            'Imported from Chronicle Legal (${esc(c.reportType)}). Favorable: ${esc(c.favorableTypes.join(", "))}.${pdfNote}',
            'System'
          )
        `),
        );

        imported.push({ clientId, name: `${c.lastName}, ${c.firstName}` });
      } catch (err) {
        errors.push({
          name: `${c.lastName}, ${c.firstName}`,
          error: (err as Error).message,
        });
      }
    }

    return NextResponse.json({
      status: "ok",
      imported: imported.length,
      errors: errors.length,
      details: { imported, errors },
    });
  } catch (error) {
    console.error("POST /api/chronicle/import error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
};

// Escape single quotes for raw SQL
function esc(val: string): string {
  return val.replace(/'/g, "''");
}

// Build the PDF values portion of the INSERT SQL
function buildPdfValuesSql(pf: PdfFields): string {
  const parts: string[] = [];
  if (pf.fullSsn !== undefined)
    parts.push(pf.fullSsn ? `'${esc(pf.fullSsn)}'` : "NULL");
  if (pf.dob !== undefined) parts.push(pf.dob ? `'${esc(pf.dob)}'` : "NULL");
  if (pf.email !== undefined)
    parts.push(pf.email ? `'${esc(pf.email)}'` : "NULL");
  if (pf.phone !== undefined)
    parts.push(pf.phone ? `'${esc(pf.phone)}'` : "NULL");
  if (pf.primaryDiagnosis !== undefined)
    parts.push(pf.primaryDiagnosis ? `'${esc(pf.primaryDiagnosis)}'` : "NULL");
  if (pf.primaryDiagnosisCode !== undefined)
    parts.push(
      pf.primaryDiagnosisCode ? `'${esc(pf.primaryDiagnosisCode)}'` : "NULL",
    );
  if (pf.secondaryDiagnosis !== undefined)
    parts.push(
      pf.secondaryDiagnosis ? `'${esc(pf.secondaryDiagnosis)}'` : "NULL",
    );
  if (pf.secondaryDiagnosisCode !== undefined)
    parts.push(
      pf.secondaryDiagnosisCode
        ? `'${esc(pf.secondaryDiagnosisCode)}'`
        : "NULL",
    );
  if (pf.allegations !== undefined)
    parts.push(pf.allegations ? `'${esc(pf.allegations)}'` : "NULL");
  if (pf.dateLastInsured !== undefined)
    parts.push(pf.dateLastInsured ? `'${esc(pf.dateLastInsured)}'` : "NULL");
  if (pf.blindDli !== undefined)
    parts.push(pf.blindDli ? `'${esc(pf.blindDli)}'` : "NULL");
  if (pf.firmName !== undefined)
    parts.push(pf.firmName ? `'${esc(pf.firmName)}'` : "NULL");
  if (pf.firmEin !== undefined)
    parts.push(pf.firmEin ? `'${esc(pf.firmEin)}'` : "NULL");
  if (pf.hearingOffice !== undefined)
    parts.push(pf.hearingOffice ? `'${esc(pf.hearingOffice)}'` : "NULL");
  return parts.length > 0 ? ", " + parts.join(", ") : "";
}
