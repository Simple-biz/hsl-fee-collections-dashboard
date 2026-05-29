import { myCaseDb } from "@/lib/db/mycase";
import { MyCaseTabs } from "@/components/mycase/MyCaseTabs";
import { type MyCaseRow } from "@/components/mycase/MyCaseCases";

// Reads cookies via the auth layout → always dynamic.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "MyCase · SSA Fee Collections",
};

// Filter values verified by introspecting the MyCase mirror DB:
//  - case_stage is stored uppercase: "10 FULLY FAVORABLE ALJ HRG DECISION"
//  - practice_area is "SOCIAL SECURITY " (uppercase + trailing space) — matched via TRIM/UPPER
//  - office_id 381685 = Hogan Smith (708 of 725 of this app's cases map to it; none to other offices)
const CASE_STAGE = "10 FULLY FAVORABLE ALJ HRG DECISION";
const HOGAN_SMITH_OFFICE_ID = 381685;

export default async function MyCasePage() {
  let cases: MyCaseRow[] = [];
  let error: string | null = null;

  try {
    const rows = await myCaseDb`
      SELECT id::text                  AS id,
             name,
             case_number,
             status,
             opened_date::text         AS opened_date,
             closed_date::text         AS closed_date,
             outstanding_balance::text AS outstanding_balance,
             updated_at::text          AS updated_at
      FROM cases
      WHERE case_stage = ${CASE_STAGE}
        AND TRIM(UPPER(practice_area)) = 'SOCIAL SECURITY'
        AND office_id = ${HOGAN_SMITH_OFFICE_ID}
      ORDER BY opened_date DESC NULLS LAST
    `;

    cases = rows.map((r) => ({
      id: Number(r.id),
      name: r.name ?? "—",
      caseNumber: r.case_number ?? null,
      status: r.status ?? null,
      openedDate: r.opened_date ?? null,
      closedDate: r.closed_date ?? null,
      outstandingBalance:
        r.outstanding_balance != null ? Number(r.outstanding_balance) : null,
      updatedAt: r.updated_at ?? null,
    }));
  } catch (err) {
    console.error("MyCase page query error:", err);
    error = "Could not load cases from the MyCase database.";
  }

  return <MyCaseTabs cases={cases} error={error} />;
}
