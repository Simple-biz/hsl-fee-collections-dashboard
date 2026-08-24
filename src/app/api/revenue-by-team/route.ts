import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

const WINDOWS = ["today", "week", "month"] as const;
type Window = (typeof WINDOWS)[number];

const pad = (n: number) => String(n).padStart(2, "0");
const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// GET /api/revenue-by-team?window=today|week|month
// Fees collected per staff team within the given window — the windowed
// counterpart to Overview's "Revenue by Team" chart, which otherwise only
// shows an all-time Expected/Collected total (see /api/cases + /api/team-members,
// computed client-side). Only Collected has a window here: "Expected" (the
// total fee owed) has no time dimension, so callers drop it outside "All
// Time" rather than divide a day's collections by the full lifetime total owed.
//
// Grouped by staff team (T2/T16/Concurrent — same restriction as Reports'
// TEAM_ORDER in /api/scoreboard), not by case claim type, so this matches
// Reports' By Team card exactly rather than the case-level claim taxonomy.
export const GET = async (req: NextRequest) => {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const windowParam = searchParams.get("window");
  if (!WINDOWS.includes(windowParam as Window)) {
    return NextResponse.json({ error: "Invalid window" }, { status: 400 });
  }
  const w = windowParam as Window;

  try {
    // Local getters, not toISOString() — matches the convention in
    // /api/scoreboard so "today"/"this week"/"this month" agree with the
    // Reports page regardless of the server's own timezone.
    const now = new Date();
    let startDate: string;
    let endExclusive: string;
    if (w === "today") {
      startDate = toISO(now);
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      endExclusive = toISO(tomorrow);
    } else if (w === "week") {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(now);
      monday.setDate(diff);
      startDate = toISO(monday);
      const nextMonday = new Date(monday);
      nextMonday.setDate(nextMonday.getDate() + 7);
      endExclusive = toISO(nextMonday);
    } else {
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      startDate = toISO(firstOfMonth);
      const firstOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      endExclusive = toISO(firstOfNextMonth);
    }

    // Same ledger + legacy-remainder split as /api/scoreboard's fees-collected
    // windowing: real fee_payments rows are dated by created_at (the day the
    // payment was entered — matches Notifications' Payments tab and Reports),
    // while pre-ledger "legacy" amounts (bulk Sheets/MyCase sync, CSV import)
    // have no per-payment entry timestamp, so they stay dated by fee_records'
    // own received-date columns. Team leads are included in the team totals
    // here, same as Reports' own team rollup — only its per-agent table
    // excludes them.
    const rows = (await db.execute(sql`
      WITH payment_sums AS (
        SELECT case_id, fee_type, SUM(amount::numeric) AS paid_sum
        FROM fee_payments
        GROUP BY case_id, fee_type
      ),
      legacy_remainder AS (
        SELECT
          fr.case_id,
          tm.team,
          GREATEST(fr.t16_fee_received::numeric - COALESCE(p16.paid_sum, 0), 0) AS t16_remainder,
          fr.t16_fee_received_date,
          GREATEST(fr.t2_fee_received::numeric - COALESCE(p2.paid_sum, 0), 0) AS t2_remainder,
          fr.t2_fee_received_date,
          GREATEST(fr.aux_fee_received::numeric - COALESCE(pa.paid_sum, 0), 0) AS aux_remainder,
          fr.aux_fee_received_date
        FROM fee_records fr
        LEFT JOIN team_members tm ON tm.name = fr.assigned_to
        LEFT JOIN payment_sums p16 ON p16.case_id = fr.case_id AND p16.fee_type = 't16'
        LEFT JOIN payment_sums p2  ON p2.case_id  = fr.case_id AND p2.fee_type  = 't2'
        LEFT JOIN payment_sums pa  ON pa.case_id  = fr.case_id AND pa.fee_type  = 'aux'
      ),
      collected_in_window AS (
        SELECT tm.team AS team, fp.amount::numeric AS amt
        FROM fee_payments fp
        JOIN fee_records fr ON fr.case_id = fp.case_id
        LEFT JOIN team_members tm ON tm.name = fr.assigned_to
        WHERE fp.created_at >= ${startDate}::date AND fp.created_at < ${endExclusive}::date

        UNION ALL

        SELECT team, t16_remainder AS amt FROM legacy_remainder
        WHERE t16_fee_received_date >= ${startDate}::date AND t16_fee_received_date < ${endExclusive}::date
          AND t16_remainder > 0.005

        UNION ALL

        SELECT team, t2_remainder AS amt FROM legacy_remainder
        WHERE t2_fee_received_date >= ${startDate}::date AND t2_fee_received_date < ${endExclusive}::date
          AND t2_remainder > 0.005

        UNION ALL

        SELECT team, aux_remainder AS amt FROM legacy_remainder
        WHERE aux_fee_received_date >= ${startDate}::date AND aux_fee_received_date < ${endExclusive}::date
          AND aux_remainder > 0.005
      )
      SELECT team, SUM(amt)::numeric AS collected
      FROM collected_in_window
      WHERE team IN ('T2', 'T16', 'Concurrent')
      GROUP BY 1
    `)) as unknown as { team: string; collected: string }[];

    const teams = rows.map((r) => ({ team: r.team, collected: Number(r.collected) }));

    return NextResponse.json({ window: w, teams });
  } catch (error) {
    console.error("GET /api/revenue-by-team error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};
