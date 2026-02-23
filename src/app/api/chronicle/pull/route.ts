import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cases } from "@/lib/db/schema";
import {
  fetchChronicleClient,
  parseChronicleResponse,
  type ChronicleApiResponse,
} from "@/lib/chronicle-client";

// ============================================================================
// MOCK DATA — 4 sample clients for development
// ============================================================================
// comment uo mock if needed

const MOCK: Record<string, ChronicleApiResponse> = {
  "112221": {
    client_id: 112221,
    first_name: "Maria",
    last_name: "Torres",
    external_id: "2025.11.05",
    last4_ssn: "3201",
    ssn: "XXX-XX-3201",
    dob: "1978-05-14",
    claim_type: ["T2"],
    report_type: "Hearing",
    status_of_case: "CASE CLOSED",
    status_date: "2026-03-15",
    office_with_jurisdiction: "MIAMI FL",
    last_change: "2026-03-15",
    last_insured: "2027-06-30",
    alleged_onset: "2024-08-01",
    application: "2025-01-15",
    receipt_date: "2025-02-01",
    first_date_assigned: "2025-02-10",
    closure_date: "2026-03-15",
    date_fqr_starts: "",
    request_date: "2025-06-10",
    expedited_case: "No",
    hearing_request_date: "2025-06-10",
    hearing_scheduled_date: "2026-02-28",
    hearing_held_date: "2026-02-28",
    hearing_scheduled_datetime: "2026-02-28T15:00:00.000Z",
    hearing_timezone: "EST",
    hearing_timezone_long: "Eastern Standard Time",
    claimant_location: "ODAR MIAMI, Room 3",
    representative_location: "ODAR MIAMI, Room 3",
    alj_location: "ODAR MIAMI, Room 3",
    alj_first_name: "Lisa",
    alj_last_name: "Chen",
    medical_expert: "Reyes, Carmen",
    vocational_expert: "Vasquez, P",
    t2_decision: "Favorable",
    t16_decision: "",
    owner_user_id: "",
    created_by_user_id: "",
    created_at: "2025-01-20T10:00:00.000Z",
    updated_at: "2026-03-15T14:00:00.000Z",
    ssn_added_by_user_id: "",
    ssn_added_at: "2025-01-20T10:05:00.000Z",
    last_ere_session_date: "2026-03-15T12:00:00.000Z",
    last_status_report_date: "2026-03-15T12:00:00.000Z",
    documents_last_added_at: "2026-03-10T09:00:00.000Z",
    invalid_ssn: false,
    all_file_link: "",
    exhibits_file_link: "",
    all_file_updated_at: null,
    exhibits_file_updated_at: null,
  },
  "112222": {
    client_id: 112222,
    first_name: "Raj",
    last_name: "Patel",
    external_id: "2025.09.22",
    last4_ssn: "3202",
    ssn: "XXX-XX-3202",
    dob: "1985-11-02",
    claim_type: ["T16"],
    report_type: "Hearing",
    status_of_case: "CASE CLOSED",
    status_date: "2026-03-10",
    office_with_jurisdiction: "JACKSONVILLE FL",
    last_change: "2026-03-10",
    last_insured: null,
    alleged_onset: "2024-03-15",
    application: "2024-09-01",
    receipt_date: "2024-09-15",
    first_date_assigned: "2024-09-20",
    closure_date: "2026-03-10",
    date_fqr_starts: "",
    request_date: "2025-05-20",
    expedited_case: "No",
    hearing_request_date: "2025-05-20",
    hearing_scheduled_date: "2026-02-20",
    hearing_held_date: "2026-02-20",
    hearing_scheduled_datetime: "2026-02-20T14:00:00.000Z",
    hearing_timezone: "EST",
    hearing_timezone_long: "Eastern Standard Time",
    claimant_location: "ODAR JACKSONVILLE",
    representative_location: "ODAR JACKSONVILLE",
    alj_location: "ODAR JACKSONVILLE",
    alj_first_name: "Robert",
    alj_last_name: "Williams",
    medical_expert: "Smith, John",
    vocational_expert: "Adams, R",
    t2_decision: "",
    t16_decision: "Favorable",
    owner_user_id: "",
    created_by_user_id: "",
    created_at: "2024-09-05T10:00:00.000Z",
    updated_at: "2026-03-10T16:00:00.000Z",
    ssn_added_by_user_id: "",
    ssn_added_at: "",
    last_ere_session_date: null,
    last_status_report_date: null,
    documents_last_added_at: null,
    invalid_ssn: false,
    all_file_link: "",
    exhibits_file_link: "",
    all_file_updated_at: null,
    exhibits_file_updated_at: null,
  },
  "112223": {
    client_id: 112223,
    first_name: "David",
    last_name: "Nguyen",
    external_id: "2025.07.30",
    last4_ssn: "3203",
    ssn: "XXX-XX-3203",
    dob: "1972-08-20",
    claim_type: ["T2", "T16"],
    report_type: "Hearing",
    status_of_case: "CASE CLOSED",
    status_date: "2026-03-08",
    office_with_jurisdiction: "FORT LAUDERDALE FL",
    last_change: "2026-03-08",
    last_insured: "2028-03-31",
    alleged_onset: "2023-12-01",
    application: "2024-06-15",
    receipt_date: "2024-07-01",
    first_date_assigned: "2024-07-10",
    closure_date: "2026-03-08",
    date_fqr_starts: "",
    request_date: "2025-04-15",
    expedited_case: "No",
    hearing_request_date: "2025-04-15",
    hearing_scheduled_date: "2026-02-15",
    hearing_held_date: "2026-02-15",
    hearing_scheduled_datetime: "2026-02-15T16:00:00.000Z",
    hearing_timezone: "EST",
    hearing_timezone_long: "Eastern Standard Time",
    claimant_location: "ODAR FT LAUDERDALE",
    representative_location: "ODAR FT LAUDERDALE",
    alj_location: "ODAR FT LAUDERDALE",
    alj_first_name: "Michael",
    alj_last_name: "Johnson",
    medical_expert: "Garcia, Ana",
    vocational_expert: "Thomas, M",
    t2_decision: "Favorable",
    t16_decision: "Favorable",
    owner_user_id: "",
    created_by_user_id: "",
    created_at: "2024-06-20T10:00:00.000Z",
    updated_at: "2026-03-08T15:00:00.000Z",
    ssn_added_by_user_id: "",
    ssn_added_at: "",
    last_ere_session_date: null,
    last_status_report_date: null,
    documents_last_added_at: null,
    invalid_ssn: false,
    all_file_link: "",
    exhibits_file_link: "",
    all_file_updated_at: null,
    exhibits_file_updated_at: null,
  },
  "112224": {
    client_id: 112224,
    first_name: "Sandra",
    last_name: "Campbell",
    external_id: "2025.12.01",
    last4_ssn: "3204",
    ssn: "XXX-XX-3204",
    dob: "1990-03-25",
    claim_type: ["T2"],
    report_type: "Hearing",
    status_of_case: "POST HEARING REVIEW",
    status_date: "2026-03-01",
    office_with_jurisdiction: "ORLANDO FL",
    last_change: "2026-03-01",
    last_insured: "2027-12-31",
    alleged_onset: "2025-01-10",
    application: "2025-05-01",
    receipt_date: "2025-05-15",
    first_date_assigned: "2025-05-20",
    closure_date: null,
    date_fqr_starts: "",
    request_date: "2025-07-01",
    expedited_case: "No",
    hearing_request_date: "2025-07-01",
    hearing_scheduled_date: "2026-02-25",
    hearing_held_date: "2026-02-25",
    hearing_scheduled_datetime: "2026-02-25T19:00:00.000Z",
    hearing_timezone: "EST",
    hearing_timezone_long: "Eastern Standard Time",
    claimant_location: "ODAR ORLANDO",
    representative_location: "ODAR ORLANDO",
    alj_location: "ODAR ORLANDO",
    alj_first_name: "Sarah",
    alj_last_name: "Davis",
    medical_expert: "Lee, David",
    vocational_expert: "Brown, K",
    t2_decision: "Unfavorable",
    t16_decision: "",
    owner_user_id: "",
    created_by_user_id: "",
    created_at: "2025-05-05T10:00:00.000Z",
    updated_at: "2026-03-01T14:00:00.000Z",
    ssn_added_by_user_id: "",
    ssn_added_at: "",
    last_ere_session_date: null,
    last_status_report_date: null,
    documents_last_added_at: null,
    invalid_ssn: false,
    all_file_link: "",
    exhibits_file_link: "",
    all_file_updated_at: null,
    exhibits_file_updated_at: null,
  },
};

// ============================================================================
// POST /api/chronicle/pull — Fetch single client
// Body: { clientId: "112221" }
// ============================================================================

export const POST = async (req: NextRequest) => {
  try {
    const { clientId } = await req.json();
    if (!clientId) {
      return NextResponse.json(
        { error: "Client ID is required" },
        { status: 400 },
      );
    }

    const apiUrl = process.env.CHRONICLE_API_URL || "";
    const apiKey = process.env.CHRONICLE_API_KEY || "";
    let usingMock = false;
    let raw: ChronicleApiResponse;

    if (apiUrl && apiKey) {
      raw = await fetchChronicleClient(String(clientId), apiUrl, apiKey);
    } else {
      usingMock = true;
      const mock = MOCK[String(clientId)];
      if (!mock) {
        return NextResponse.json(
          {
            error: `Mock client ${clientId} not found. Try: 112221, 112222, 112223, 112224`,
          },
          { status: 404 },
        );
      }
      raw = mock;
    }

    const parsed = parseChronicleResponse(raw);

    // Check if already in DB
    const existingCases = await db
      .select({
        clientId: cases.clientId,
        lastName: cases.lastName,
        last4Ssn: cases.last4Ssn,
      })
      .from(cases);

    const ssn4 = (parsed.last4Ssn || "").replace(/\D/g, "").slice(-4);
    const match =
      existingCases.find(
        (e) =>
          (e.last4Ssn || "") === ssn4 &&
          (e.lastName || "").toLowerCase() === parsed.lastName.toLowerCase(),
      ) || existingCases.find((e) => e.clientId === parsed.chronicleClientId);

    return NextResponse.json({
      status: "ok",
      usingMock,
      parsed,
      existsInDb: !!match,
      matchedClientId: match?.clientId || null,
    });
  } catch (error) {
    console.error("POST /api/chronicle/pull error:", error);
    const msg = (error as Error).message;
    const status = msg.includes("not found")
      ? 404
      : msg.includes("API key")
        ? 401
        : 500;
    return NextResponse.json({ error: msg }, { status });
  }
};
