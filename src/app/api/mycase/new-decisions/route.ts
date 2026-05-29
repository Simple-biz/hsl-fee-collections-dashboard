import { NextRequest, NextResponse } from "next/server";
import { fetchCaseDocuments } from "@/lib/mycase-proxy";
import { myCaseDb } from "@/lib/db/mycase";

// "Today" in the firm's timezone (Hogan Smith is US Eastern). created_at on
// MyCase docs is UTC; resolving "today" in Eastern avoids a late-evening
// upload landing on the wrong calendar day. Change the zone here if needed.
const FIRM_TZ = "America/New_York";
const todayInFirmTz = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: FIRM_TZ }).format(new Date());
// Default target is yesterday (firm tz): the mirror syncs overnight (~4am ET)
// with the prior day's updates, so "yesterday" is the freshest fully-loaded
// day. Matches the UI's default. Noon-UTC math keeps the subtraction DST-safe.
const yesterdayInFirmTz = () => {
  const d = new Date(`${todayInFirmTz()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return new Intl.DateTimeFormat("en-CA", { timeZone: FIRM_TZ }).format(d);
};

// The YYYY-MM-DD calendar date (firm tz) for a UTC `created_at` timestamp, so
// doc date comparisons match the firm's day boundaries rather than UTC's.
const firmDate = (iso: string | null): string | null =>
  iso
    ? new Intl.DateTimeFormat("en-CA", { timeZone: FIRM_TZ }).format(
        new Date(iso),
      )
    : null;

// Case-eligibility criteria — same as the /mycase Cases tab and the mirror
// query elsewhere. Eligibility is resolved entirely from the synced mirror
// DB; documents are then pulled live per case from MyCase.
const CASE_STAGE = "10 FULLY FAVORABLE ALJ HRG DECISION";
const HOGAN_SMITH_OFFICE_ID = 381685;
const SOCIAL_SECURITY = "SOCIAL SECURITY";

// Matches a "Notice of Decision – Fully Favorable" document by name, in either
// word order, tolerant of spaces / underscores / hyphens between tokens.
const NAME_RE =
  /notice[\s_-]*of[\s_-]*decision.*fully[\s_-]*favorable|fully[\s_-]*favorable.*notice[\s_-]*of[\s_-]*decision/i;

const matchesDecisionName = (d: {
  name?: string | null;
  filename?: string | null;
  path?: string | null;
  description?: string | null;
}): boolean => {
  const text = [d.name, d.filename, d.path, d.description]
    .filter(Boolean)
    .join(" ");
  return NAME_RE.test(text);
};

// Eligible cases that *changed on `date`* (firm tz), straight from the mirror.
// Scoping to updated_at keeps this set tiny — only cases that moved into the
// fully-favorable stage that day — so we fetch documents for a handful of
// cases per pull, not the whole FF backlog.
const eligibleCasesForDate = async (
  date: string,
): Promise<{ id: number; name: string }[]> => {
  const rows = await myCaseDb<{ id: string; name: string | null }[]>`
    SELECT id::text AS id, name
    FROM cases
    WHERE case_stage = ${CASE_STAGE}
      AND TRIM(UPPER(practice_area)) = ${SOCIAL_SECURITY}
      AND office_id = ${HOGAN_SMITH_OFFICE_ID}
      AND (updated_at AT TIME ZONE ${FIRM_TZ})::date = ${date}::date
  `;
  return rows.map((r) => ({ id: Number(r.id), name: r.name ?? "—" }));
};

// GET /api/mycase/new-decisions?date=YYYY-MM-DD
// Returns fully-favorable Notice-of-Decision docs added on `date` (default:
// today, firm tz) for Hogan Smith / Social Security / Fully-Favorable cases.
// Eligibility comes from the synced mirror DB; documents are pulled live per
// case via the MyCase documents webhook, then filtered by name + date.
export const GET = async (req: NextRequest) => {
  try {
    const url = new URL(req.url);
    const date = url.searchParams.get("date") || yesterdayInFirmTz();

    // 1. Which eligible cases changed on this date (mirror).
    let candidates: { id: number; name: string }[];
    try {
      candidates = await eligibleCasesForDate(date);
    } catch (e) {
      console.error("new-decisions mirror lookup failed:", e);
      return NextResponse.json(
        { error: "Could not query MyCase mirror for eligible cases" },
        { status: 500 },
      );
    }

    // 2. Pull each candidate's documents live, then 3. keep only the
    //    fully-favorable Notice-of-Decision docs added on `date`.
    const perCase = await Promise.all(
      candidates.map(async (c) => {
        try {
          const docs = await fetchCaseDocuments(c.id);
          return docs
            .filter(
              (d) =>
                firmDate(d.created_at) === date && matchesDecisionName(d),
            )
            .map((d) => ({
              id: d.id,
              name: d.name,
              filename: d.filename,
              path: d.path,
              createdAt: d.created_at,
              caseId: c.id,
              caseName: c.name,
            }));
        } catch (err) {
          // One case's document fetch failing shouldn't sink the whole pull.
          console.error(`documents fetch failed for case ${c.id}:`, err);
          return [];
        }
      }),
    );

    const data = perCase.flat();

    // Diagnostic — shows in the dev terminal how the counts shook out, so
    // "no eligible cases that day" is distinguishable from "cases matched but
    // no decision document found".
    console.log(
      `[new-decisions] date=${date} eligibleCases=${candidates.length} docs=${data.length}`,
    );

    return NextResponse.json({ data, date });
  } catch (err) {
    console.error("GET /api/mycase/new-decisions error:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
};
