// Casewell SSD Case Management API client — server-side only.
// API key must live in CASEWELL_API_KEY env var and must never reach the browser.

const BASE_URL = "https://ssd-api.simple.biz";

function apiKey(): string {
  const key = process.env.CASEWELL_API_KEY;
  if (!key) throw new Error("CASEWELL_API_KEY is not set");
  return key;
}

function headers(): HeadersInit {
  return { "X-API-KEY": apiKey(), "Content-Type": "application/json" };
}

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { headers: headers(), signal });
  if (!res.ok) {
    throw new Error(`Casewell API error: ${res.status} ${path}`);
  }
  return res.json() as Promise<T>;
}

// ============================================================================
// Types — only the fields the fee collections team needs.
// ============================================================================

export interface CasewellClientRow {
  id: number;
  claimant_name: string;
  ssn_last4: string | null;
  level: string | null;
  status: string | null;
  claim_type: string | null;
  assigned_user_name: string | null;
  /** The Chronicle client id this case was migrated from. */
  legacy_client_id: number | null;
}

export interface CasewellClientList {
  items: CasewellClientRow[];
  next_cursor: string | null;
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  prev_cursor: string | null;
}

// Response shape for /api/clients/by-legacy-id — distinct from the general list.
interface ByLegacyIdRow {
  legacy_client_id: number;
  client_id: number;
  claimant_name: string;
  resolved_via: string;
  merged_at: string | null;
}

interface ByLegacyIdResponse {
  items: ByLegacyIdRow[];
  not_found: number[];
}

/** Full detail shape returned by GET /api/clients/{id}. */
export interface CasewellClientDetail {
  id: number;
  ere_customer_id: number | null;
  legacy_client_id: number | null;
  claimant_name: string;
  first_name: string;
  last_name: string;
  ssn_last4: string | null;
  level: string | null;
  claim_type: string | null;
  status_date: string | null;
  last_change_date: string | null;
  last_insured_date: string | null;
  alleged_onset_date: string | null;
  application_date: string | null;
  dob: string | null;
  case_document_count: number;
  exhibit_count: number;
  multimedia_count: number;
  source: string | null;
  scraped_at: string | null;
  ssa_account_id: number | null;
  ssa_account_name: string | null;
  appointed_accounts: unknown[];
  full_ssn_set: boolean;
  probe_opens_left_today: number | null;
  assigned_user_id: number | null;
  assigned_user_name: string | null;
  on_roster: boolean;
  roster_checked_at: string | null;
  invalid_ssn: boolean;
  ssn_invalid_at: string | null;
  refusal_reason: string | null;
  is_stub: boolean;
  created_at: string;
  updated_at: string;
}

export interface CasewellDocument {
  id: number;
  document_id: string;
  document_name: string;
  section: string | null;
  exhibit_number: string | null;
  decision_date: string | null;
  document_date: string | null;
  source: string | null;
  date_from: string | null;
  date_to: string | null;
  ef_received_date: string | null;
  marked: boolean | null;
  page_count: number;
  download_status: string | null;
  file_status: string | null;
  has_file: boolean;
  ocr_status: string | null;
  extraction_status: string | null;
  download_error: string | null;
  classified_doc_type: string | null;
  filed_by_us: boolean | null;
  created_at: string;
  updated_at: string;
}

interface CasewellDocumentList {
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  case_documents: CasewellDocument[];
  exhibits: CasewellDocument[];
}

/** Normalized shape consumed by the Casewell pull UI and import flow. */
export interface CasewellParsedCase {
  casewellId: number;
  firstName: string;
  lastName: string;
  last4Ssn: string | null;
  dob: string | null;
  claimType: string[];
  claimTypeLabel: string;
  caseLevel: string | null;
  statusDate: string | null;
  lastChangeDate: string | null;
  allegedOnsetDate: string | null;
  applicationDate: string | null;
  lastInsuredDate: string | null;
  assignedUserName: string | null;
  ssaAccountName: string | null;
  invalidSsn: boolean;
  onRoster: boolean;
  rosterCheckedAt: string | null;
  legacyClientId: number | null;
  caseDocumentCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Parse a raw Casewell client detail into the normalized shape. */
export function parseCasewellClient(raw: CasewellClientDetail): CasewellParsedCase {
  const rawCt = raw.claim_type ?? "";
  const claimType = rawCt
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const claimTypeLabel =
    claimType.length === 0 ? "" : claimType.length === 1 ? claimType[0] : claimType.join(", ");

  return {
    casewellId: raw.id,
    firstName: raw.first_name,
    lastName: raw.last_name,
    last4Ssn: raw.ssn_last4,
    dob: raw.dob,
    claimType,
    claimTypeLabel,
    caseLevel: raw.level,
    statusDate: raw.status_date,
    lastChangeDate: raw.last_change_date,
    allegedOnsetDate: raw.alleged_onset_date,
    applicationDate: raw.application_date,
    lastInsuredDate: raw.last_insured_date,
    assignedUserName: raw.assigned_user_name,
    ssaAccountName: raw.ssa_account_name,
    invalidSsn: raw.invalid_ssn,
    onRoster: raw.on_roster,
    rosterCheckedAt: raw.roster_checked_at,
    legacyClientId: raw.legacy_client_id,
    caseDocumentCount: raw.case_document_count,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

// ============================================================================
// API methods
// ============================================================================

/** Search clients by claimant name. Pages through results with cursor. */
export async function searchClients(
  query: string,
  opts: { pageSize?: number; cursor?: string; signal?: AbortSignal } = {},
): Promise<CasewellClientList> {
  const params = new URLSearchParams({ search: query });
  if (opts.pageSize) params.set("page_size", String(opts.pageSize));
  if (opts.cursor) params.set("next_cursor", opts.cursor);
  return request<CasewellClientList>(`/api/clients?${params}`, opts.signal);
}

/** Get full details for one Casewell case. */
export async function getClient(
  id: string,
  signal?: AbortSignal,
): Promise<CasewellClientDetail> {
  return request<CasewellClientDetail>(`/api/clients/${id}`, signal);
}

/** Get the document list for one Casewell case. */
export async function getClientDocuments(
  id: string,
  signal?: AbortSignal,
): Promise<CasewellDocumentList> {
  return request<CasewellDocumentList>(`/api/clients/${id}/documents`, signal);
}

/**
 * Resolve any number of Chronicle (legacy) client ids into Casewell case ids.
 * Automatically chunks into ≤200-id batches (the API's per-call ceiling).
 * Returns a map from legacy_client_id → Casewell id (as string); unmatched ids are absent.
 *
 * The by-legacy-id endpoint returns all matches in a single `items` array with no
 * cursor pagination. If the response shape ever changes, we throw immediately so
 * the assumption surfaces rather than silently dropping results.
 */
export async function getClientsByLegacyId(
  legacyIds: number[],
  signal?: AbortSignal,
): Promise<Map<number, string>> {
  if (legacyIds.length === 0) return new Map();

  const CHUNK_SIZE = 200;
  const map = new Map<number, string>();

  for (let i = 0; i < legacyIds.length; i += CHUNK_SIZE) {
    const chunk = legacyIds.slice(i, i + CHUNK_SIZE);
    const params = new URLSearchParams({ ids: chunk.join(",") });
    const res = await request<ByLegacyIdResponse>(
      `/api/clients/by-legacy-id?${params}`,
      signal,
    );
    if (!Array.isArray(res.items)) {
      throw new Error("Casewell by-legacy-id: unexpected response shape (missing items array)");
    }
    for (const row of res.items) {
      map.set(row.legacy_client_id, String(row.client_id));
    }
  }

  return map;
}
