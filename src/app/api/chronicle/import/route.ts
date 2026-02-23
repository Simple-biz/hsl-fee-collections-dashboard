import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cases, feeRecords, activityLog } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

interface ImportCase {
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

// POST /api/chronicle/import — Import selected cases into DB
export const POST = async (req: NextRequest) => {
  try {
    const { cases: importCases } = (await req.json()) as {
      cases: ImportCase[];
    };

    if (!importCases || importCases.length === 0) {
      return NextResponse.json(
        { error: "No cases to import" },
        { status: 400 },
      );
    }

    // Get next available client_id
    const [maxId] = await db.execute(
      sql`SELECT COALESCE(MAX(client_id), 2999) as max_id FROM cases`,
    );
    let nextId = Number((maxId as Record<string, number>).max_id) + 1;

    const imported: { clientId: number; name: string }[] = [];
    const errors: { name: string; error: string }[] = [];

    for (const c of importCases) {
      try {
        const clientId = nextId++;

        // Normalize decision values
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

        // Insert case
        await db.execute(sql`
          INSERT INTO cases (client_id, first_name, last_name, last4_ssn, claim_type, claim_type_label, level_won, t2_decision, t16_decision, approval_date, office_with_jurisdiction)
          VALUES (
            ${clientId},
            ${c.firstName},
            ${c.lastName},
            ${c.last4Ssn.replace(/\D/g, "").slice(-4)},
            ${c.claimType === "T2_T16" ? sql`ARRAY['T2','T16']` : c.claimType === "T16" ? sql`ARRAY['T16']` : sql`ARRAY['T2']`},
            ${c.claimType},
            ${levelWon},
            ${t2Dec},
            ${t16Dec},
            ${c.statusDate || null},
            ${c.officeWithJurisdiction}
          )
        `);

        // Create fee record
        const feeMethod = c.feePetition ? "fee_petition" : "fee_agreement";
        await db.execute(sql`
          INSERT INTO fee_records (case_id, assigned_to, win_sheet_status, fee_method, fee_computed)
          VALUES (${clientId}, NULL, 'not_started', ${feeMethod}, FALSE)
        `);

        // Create activity log entry
        await db.execute(sql`
          INSERT INTO activity_log (case_id, message, created_by)
          VALUES (${clientId}, ${"Imported from Chronicle Legal (" + c.reportType + "). Favorable: " + c.favorableTypes.join(", ") + "."}, 'System')
        `);

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
