// Chronicle Legal API Client
// Single-client lookup via https://api.chroniclelegal.com/api/clients/{id}

export interface ChronicleApiResponse {
  client_id: number;
  first_name: string;
  last_name: string;
  external_id: string;
  last4_ssn: string;
  ssn: string;
  dob: string | null;

  // Claim info
  claim_type: string[]; // ["T2"], ["T16"], ["T2", "T16"]
  report_type: string;
  status_of_case: string;
  status_date: string | null;
  office_with_jurisdiction: string;

  // Dates
  last_change: string | null;
  last_insured: string | null;
  alleged_onset: string | null;
  application: string | null;
  receipt_date: string | null;
  first_date_assigned: string | null;
  closure_date: string | null;
  date_fqr_starts: string | null;
  request_date: string | null;
  expedited_case: string;

  // Hearing-specific
  hearing_request_date: string | null;
  hearing_scheduled_date: string | null;
  hearing_scheduled_datetime: string | null;
  hearing_timezone: string;
  hearing_timezone_long: string;
  hearing_held_date: string | null;
  claimant_location: string;
  representative_location: string;
  alj_location: string;
  alj_first_name: string;
  alj_last_name: string;
  medical_expert: string;
  vocational_expert: string;

  // Decisions
  t2_decision: string;
  t16_decision: string;

  // Metadata
  owner_user_id: string;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
  ssn_added_by_user_id: string;
  ssn_added_at: string;
  last_ere_session_date: string | null;
  last_status_report_date: string | null;
  documents_last_added_at: string | null;
  invalid_ssn: boolean;

  // Files
  all_file_link: string;
  exhibits_file_link: string;
  all_file_updated_at: string | null;
  exhibits_file_updated_at: string | null;
}

export interface ChronicleParsedCase {
  // Identity
  chronicleClientId: number;
  externalId: string;
  firstName: string;
  lastName: string;
  last4Ssn: string;
  dob: string | null;

  // Claim
  claimType: "T2" | "T16" | "T2_T16";
  claimTypeRaw: string[];
  reportType: string;
  officeWithJurisdiction: string;
  statusOfCase: string;
  statusDate: string | null;

  // Dates
  applicationDate: string | null;
  allegedOnset: string | null;
  receiptDate: string | null;
  closureDate: string | null;
  lastChange: string | null;

  // Hearing
  hearingRequestDate: string | null;
  hearingScheduledDate: string | null;
  hearingHeldDate: string | null;
  aljName: string | null;
  hearingTimezone: string | null;

  // Decisions
  t2Decision: string | null;
  t16Decision: string | null;

  // Computed
  isFavorable: boolean;
  favorableTypes: string[]; // ["T2"], ["T16"], ["T2", "T16"]
  isUnfavorable: boolean;
  decisionPending: boolean;

  // Fee
  feeMethod: "fee_agreement" | "fee_petition" | null;

  // Level
  caseLevel: "INITIAL" | "RECON" | "HEARING" | "AC" | "FEDERAL_COURT";

  // PDF links
  allFileLink: string | null;
}

// ============================================================================
// DECISION HELPERS
// ============================================================================

const isFavorable = (decision: string | null | undefined): boolean => {
  if (!decision) return false;
  const d = decision.toLowerCase().trim();
  return d.includes("favorable") && !d.includes("unfavorable");
};

const isUnfavorable = (decision: string | null | undefined): boolean => {
  if (!decision) return false;
  return decision.toLowerCase().trim().includes("unfavorable");
};

const hasDecision = (decision: string | null | undefined): boolean => {
  if (!decision || decision.trim() === "" || decision.trim() === "string")
    return false;
  return true;
};

// ============================================================================
// NORMALIZE CLAIM TYPE
// ============================================================================

const normalizeClaimType = (types: string[]): "T2" | "T16" | "T2_T16" => {
  const hasT2 = types.some((t) => t.toUpperCase().includes("T2"));
  const hasT16 = types.some((t) => t.toUpperCase().includes("T16"));
  if (hasT2 && hasT16) return "T2_T16";
  if (hasT16) return "T16";
  return "T2";
};

// ============================================================================
// INFER CASE LEVEL from report_type or status
// ============================================================================

const inferCaseLevel = (
  reportType: string,
  statusOfCase: string,
): ChronicleParsedCase["caseLevel"] => {
  const rt = (reportType || "").toLowerCase();
  const st = (statusOfCase || "").toLowerCase();

  if (
    rt.includes("hearing") ||
    st.includes("hearing") ||
    st.includes("alj") ||
    st.includes("post hearing")
  )
    return "HEARING";
  if (
    rt.includes("appeal") ||
    rt.includes("ac") ||
    st.includes("analyst") ||
    st.includes("appeals")
  )
    return "AC";
  if (rt.includes("recon") || st.includes("recon")) return "RECON";
  if (rt.includes("initial") || st.includes("initial")) return "INITIAL";
  if (rt.includes("federal") || st.includes("federal")) return "FEDERAL_COURT";

  return "HEARING"; // Default
};

// ============================================================================
// PARSE API RESPONSE
// ============================================================================

export const parseChronicleResponse = (
  data: ChronicleApiResponse,
): ChronicleParsedCase => {
  const claimType = normalizeClaimType(data.claim_type || []);

  const t2Fav = isFavorable(data.t2_decision);
  const t16Fav = isFavorable(data.t16_decision);
  const t2Unfav = isUnfavorable(data.t2_decision);
  const t16Unfav = isUnfavorable(data.t16_decision);
  const t2HasDec = hasDecision(data.t2_decision);
  const t16HasDec = hasDecision(data.t16_decision);

  const favorableTypes: string[] = [];
  if (t2Fav) favorableTypes.push("T2");
  if (t16Fav) favorableTypes.push("T16");

  const anyFavorable = t2Fav || t16Fav;
  const anyUnfavorable =
    (t2Unfav && !t16Fav) || (t16Unfav && !t2Fav) || (t2Unfav && t16Unfav);
  const pending =
    (!t2HasDec && claimType !== "T16") || (!t16HasDec && claimType !== "T2");

  const aljName =
    data.alj_first_name &&
    data.alj_last_name &&
    data.alj_first_name !== "string" &&
    data.alj_last_name !== "string"
      ? `${data.alj_first_name} ${data.alj_last_name}`
      : null;

  return {
    chronicleClientId: data.client_id,
    externalId: data.external_id || "",
    firstName: data.first_name || "",
    lastName: data.last_name || "",
    last4Ssn: data.last4_ssn || "",
    dob: data.dob && data.dob !== "string" ? data.dob : null,

    claimType,
    claimTypeRaw: data.claim_type || [],
    reportType: data.report_type || "",
    officeWithJurisdiction: data.office_with_jurisdiction || "",
    statusOfCase: data.status_of_case || "",
    statusDate: data.status_date || null,

    applicationDate: data.application || null,
    allegedOnset: data.alleged_onset || null,
    receiptDate: data.receipt_date || null,
    closureDate: data.closure_date || null,
    lastChange: data.last_change || null,

    hearingRequestDate: data.hearing_request_date || null,
    hearingScheduledDate: data.hearing_scheduled_date || null,
    hearingHeldDate: data.hearing_held_date || null,
    aljName,
    hearingTimezone:
      data.hearing_timezone && data.hearing_timezone !== "string"
        ? data.hearing_timezone
        : null,

    t2Decision:
      data.t2_decision && data.t2_decision !== "string"
        ? data.t2_decision
        : null,
    t16Decision:
      data.t16_decision && data.t16_decision !== "string"
        ? data.t16_decision
        : null,

    isFavorable: anyFavorable,
    favorableTypes,
    isUnfavorable: anyUnfavorable && !anyFavorable,
    decisionPending: pending && !anyFavorable && !anyUnfavorable,

    feeMethod: null, // Not in API response, will be set during import
    caseLevel: inferCaseLevel(data.report_type, data.status_of_case),
    allFileLink:
      data.all_file_link && data.all_file_link !== "string"
        ? data.all_file_link
        : null,
  };
};

// ============================================================================
// FETCH FROM CHRONICLE API
// ============================================================================

export const fetchChronicleClient = async (
  clientId: string | number,
  apiUrl: string,
  apiKey: string,
): Promise<ChronicleApiResponse> => {
  const res = await fetch(`${apiUrl}/api/clients/${clientId}`, {
    headers: {
      "x-api-key": apiKey,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    if (res.status === 404)
      throw new Error(`Client ${clientId} not found in Chronicle`);
    if (res.status === 401) throw new Error("Invalid Chronicle API key");
    if (res.status === 403)
      throw new Error("Access denied — check API permissions");
    throw new Error(`Chronicle API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
};
