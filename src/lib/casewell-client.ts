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
  id: string;
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
  results: CasewellClientRow[];
  next_cursor: string | null;
}

export interface CasewellClientDetail {
  id: string;
  claimant_name: string;
  ssn_last4: string | null;
  level: string | null;
  status: string | null;
  claim_type: string | null;
  assigned_user_name: string | null;
  legacy_client_id: number | null;
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

/**
 * Resolve up to 200 Chronicle (legacy) client ids into Casewell case ids in
 * one round-trip. Returns a map from legacy_client_id → Casewell id.
 * Ids with no match are absent from the map.
 */
export async function getClientsByLegacyId(
  legacyIds: number[],
  signal?: AbortSignal,
): Promise<Map<number, string>> {
  if (legacyIds.length === 0) return new Map();
  if (legacyIds.length > 200) throw new Error("getClientsByLegacyId: max 200 ids per call");

  const params = new URLSearchParams({ ids: legacyIds.join(",") });
  const list = await request<CasewellClientList>(
    `/api/clients/by-legacy-id?${params}`,
    signal,
  );

  const map = new Map<number, string>();
  for (const row of list.results) {
    if (row.legacy_client_id != null) map.set(row.legacy_client_id, row.id);
  }
  return map;
}
