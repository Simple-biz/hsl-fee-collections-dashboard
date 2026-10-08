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
