import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { cases, feeRecords, activityLog } from "@/lib/db/schema";
import { requirePageAccess, guardStatus } from "@/lib/auth-helpers";
import {
  resolveDecisionOutcome,
  resolveLevelWon,
  buildClaimTypeArray,
  countPdfFields,
} from "@/lib/import/chronicle-import-mapper";

const pdfFieldsSchema = z.object({
  fullSsn: z.string().nullable().optional(),
  dob: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  primaryDiagnosis: z.string().nullable().optional(),
  primaryDiagnosisCode: z.string().nullable().optional(),
  secondaryDiagnosis: z.string().nullable().optional(),
  secondaryDiagnosisCode: z.string().nullable().optional(),
  allegations: z.string().nullable().optional(),
  dateLastInsured: z.string().nullable().optional(),
  blindDli: z.string().nullable().optional(),
  feeMethod: z.enum(["fee_agreement", "fee_petition"]).nullable().optional(),
  feeCapAtSigning: z.number().nullable().optional(),
  // Selectable in the UI, but there is no fee_records.fee_agreement_date
  // column — accepted and validated, never written (see the POST handler).
  feeAgreementDate: z.string().nullable().optional(),
  firmName: z.string().nullable().optional(),
  firmEin: z.string().nullable().optional(),
  hearingOffice: z.string().nullable().optional(),
  representatives: z
    .array(z.object({ name: z.string(), repId: z.string().nullable() }))
    .nullable()
    .optional(),
  decisionHistory: z
    .array(
      z.object({
        level: z.string(),
        claimType: z.string(),
        result: z.string(),
        date: z.string().nullable(),
      }),
    )
    .nullable()
    .optional(),
});

const importCaseSchema = z.object({
  chronicleClientId: z.number().int().positive(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  last4Ssn: z.string(),
  claimType: z.enum(["T2", "T16", "T2_T16"]),
  officeWithJurisdiction: z.string(),
  caseLevel: z.string(),
  statusDate: z.string().nullable(),
  t2Decision: z.string().nullable(),
  t16Decision: z.string().nullable(),
  // The client never actually sets this — kept optional rather than required
  // to match the real request shape instead of an aspirational one.
  feePetition: z.boolean().optional(),
  reportType: z.string(),
  favorableTypes: z.array(z.string()),
});

const bodySchema = z.object({
  cases: z.array(importCaseSchema).min(1),
  pdfFields: pdfFieldsSchema.nullable().optional(),
});

type PdfFields = z.infer<typeof pdfFieldsSchema>;

// POST /api/chronicle/import — Import selected cases into DB with optional PDF-extracted fields
export const POST = async (req: NextRequest) => {
  try {
    const guard = await requirePageAccess("chronicle");
    if (!guard.ok) {
      return NextResponse.json(
        { error: guard.error },
        { status: guardStatus(guard.error) },
      );
    }

    const rawBody = await req.json().catch(() => null);
    const parsedBody = bodySchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Invalid request body", issues: parsedBody.error.issues },
        { status: 400 },
      );
    }
    const importCases = parsedBody.data.cases;
    const pdfFields: PdfFields | null = parsedBody.data.pdfFields ?? null;

    const imported: { clientId: number; name: string }[] = [];
    const errors: { name: string; error: string }[] = [];

    for (const c of importCases) {
      try {
        const clientId = c.chronicleClientId;

        const t2Dec = resolveDecisionOutcome(c.t2Decision);
        const t16Dec = resolveDecisionOutcome(c.t16Decision);
        const levelWon = resolveLevelWon(c.caseLevel);
        const claimTypeArray = buildClaimTypeArray(c.claimType);

        const caseInsert: typeof cases.$inferInsert = {
          clientId,
          firstName: c.firstName,
          lastName: c.lastName,
          last4Ssn: c.last4Ssn.replace(/\D/g, "").slice(-4),
          claimType: claimTypeArray,
          claimTypeLabel: c.claimType,
          levelWon,
          t2Decision: t2Dec,
          t16Decision: t16Dec,
          approvalDate: c.statusDate || null,
          officeWithJurisdiction: c.officeWithJurisdiction,
        };

        if (pdfFields) {
          if (pdfFields.fullSsn !== undefined) caseInsert.fullSsn = pdfFields.fullSsn;
          if (pdfFields.dob !== undefined) caseInsert.dob = pdfFields.dob;
          if (pdfFields.email !== undefined) caseInsert.email = pdfFields.email;
          if (pdfFields.phone !== undefined) caseInsert.phone = pdfFields.phone;
          if (pdfFields.primaryDiagnosis !== undefined)
            caseInsert.primaryDiagnosis = pdfFields.primaryDiagnosis;
          if (pdfFields.primaryDiagnosisCode !== undefined)
            caseInsert.primaryDiagnosisCode = pdfFields.primaryDiagnosisCode;
          if (pdfFields.secondaryDiagnosis !== undefined)
            caseInsert.secondaryDiagnosis = pdfFields.secondaryDiagnosis;
          if (pdfFields.secondaryDiagnosisCode !== undefined)
            caseInsert.secondaryDiagnosisCode = pdfFields.secondaryDiagnosisCode;
          if (pdfFields.allegations !== undefined)
            caseInsert.allegations = pdfFields.allegations;
          if (pdfFields.dateLastInsured !== undefined)
            caseInsert.lastInsured = pdfFields.dateLastInsured;
          if (pdfFields.blindDli !== undefined) caseInsert.blindDli = pdfFields.blindDli;
          if (pdfFields.firmName !== undefined) caseInsert.firmName = pdfFields.firmName;
          if (pdfFields.firmEin !== undefined) caseInsert.firmEin = pdfFields.firmEin;
          if (pdfFields.hearingOffice !== undefined)
            caseInsert.hearingOffice = pdfFields.hearingOffice;
          if (pdfFields.representatives != null)
            caseInsert.representatives = pdfFields.representatives;
          if (pdfFields.decisionHistory != null)
            caseInsert.decisionHistory = pdfFields.decisionHistory;
        }

        const feeMethod =
          pdfFields?.feeMethod || (c.feePetition ? "fee_petition" : "fee_agreement");
        const feeCap = pdfFields?.feeCapAtSigning ?? 9200;

        const pdfFieldNames = countPdfFields(pdfFields);
        const pdfNote =
          pdfFieldNames.length > 0
            ? ` PDF fields imported: ${pdfFieldNames.length}.`
            : "";

        // One transaction per case: the cases/fee_records/activity_log rows
        // for a single import must land together or not at all, instead of
        // leaving an orphaned cases row if a later insert in the sequence
        // fails (as the previous raw-SQL version could).
        await db.transaction(async (tx) => {
          await tx.insert(cases).values(caseInsert);

          await tx.insert(feeRecords).values({
            caseId: clientId,
            assignedTo: null,
            winSheetStatus: "not_started",
            feeMethod,
            applicableFeeCap: String(feeCap),
            feeComputed: false,
          });

          await tx.insert(activityLog).values({
            caseId: clientId,
            message: `Imported from Chronicle Legal (${c.reportType}). Favorable: ${c.favorableTypes.join(", ")}.${pdfNote}`,
            createdBy: "System",
          });
        });

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
