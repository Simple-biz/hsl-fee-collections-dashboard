import "server-only";

/**
 * Calls the n8n webhook that proxies MyCase Open API. MyCase OAuth credentials
 * live in n8n; this app never holds them. The webhook is protected with a
 * static header secret (`Fee-Collections-Docs-App-Token`) so the URL alone isn't enough to call it.
 */

const WEBHOOK_URL = process.env.N8N_MYCASE_DOCS_WEBHOOK_URL;
const WEBHOOK_TOKEN = process.env.N8N_MYCASE_DOCS_WEBHOOK_TOKEN;
// Separate webhook for single-document downloads; shares the same auth token.
const DOC_FILE_WEBHOOK_URL = process.env.N8N_MYCASE_DOC_FILE_WEBHOOK_URL;
// Separate webhook that returns fully-favorable Notice-of-Decision documents
// added on a given date (across cases); shares the same auth token.
const NEW_DECISIONS_WEBHOOK_URL = process.env.N8N_MYCASE_NEW_DECISIONS_WEBHOOK_URL;
// Separate webhook that fetches a single case's detail (office, practice
// area, case stage) live from MyCase. Used by the new-decisions route to
// verify case eligibility without depending on the mirror DB sync.
const CASE_DETAIL_WEBHOOK_URL = process.env.N8N_MYCASE_CASE_DETAIL_WEBHOOK_URL;
const AUTH_HEADER = "Fee-Collections-Docs-App-Token";

// Shape returned by MyCase's GET /v1/cases/{id}/documents endpoint, plus an
// optional `case.name` that the new-decisions n8n workflow attaches when it
// joins the doc back to its parent case (the source endpoint only has `id`).
export type MyCaseDocument = {
  id: number;
  name: string;
  filename: string | null;
  path: string | null;
  description: string | null;
  assigned_date: string | null;
  case: { id: number; name?: string | null } | null;
  created_at: string | null;
  updated_at: string | null;
  self_url: string | null;
  folder: { id: number } | null;
};

export async function fetchCaseDocuments(
  caseId: number,
): Promise<MyCaseDocument[]> {
  if (!WEBHOOK_URL || !WEBHOOK_TOKEN) {
    throw new Error(
      "MyCase documents webhook is not configured (N8N_MYCASE_DOCS_WEBHOOK_URL / N8N_MYCASE_DOCS_WEBHOOK_TOKEN)",
    );
  }

  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [AUTH_HEADER]: WEBHOOK_TOKEN,
    },
    // The n8n "Get Case Documents" HTTP node references {{ $json.id }}, so
    // pass the case id under `id` in the request body.
    body: JSON.stringify({ id: caseId }),
    // Document lists can change as MyCase syncs; never cache.
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `MyCase documents webhook returned ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
    );
  }

  const json = await res.json();

  // Tolerate three response shapes the n8n workflow might emit:
  //  (a) bare array of docs                        — simplest flat list
  //  (b) { data: [...] } / { items: [...] }        — wrapped flat list
  //  (c) { folders: [...], unfiled_documents: [] } — the full folder-tree
  //      crawl (current workflow). Flatten the tree to a flat doc list; each
  //      doc still carries its `path` so the dialog shows folder context.
  if (Array.isArray(json)) return json as MyCaseDocument[];
  if (Array.isArray(json?.data)) return json.data as MyCaseDocument[];
  if (Array.isArray(json?.items)) return json.items as MyCaseDocument[];
  if (Array.isArray(json?.folders) || Array.isArray(json?.unfiled_documents)) {
    return flattenFolderTree(json);
  }
  return [];
}

/**
 * Pulls fully-favorable Notice-of-Decision documents added on `date`
 * (YYYY-MM-DD) across cases, via the dedicated n8n webhook. The webhook does
 * the MyCase querying + name/date filtering; this just relays the request and
 * normalizes the response to a flat document list.
 */
export async function fetchNewDecisions(
  date: string,
): Promise<MyCaseDocument[]> {
  if (!NEW_DECISIONS_WEBHOOK_URL || !WEBHOOK_TOKEN) {
    throw new Error(
      "MyCase new-decisions webhook is not configured (N8N_MYCASE_NEW_DECISIONS_WEBHOOK_URL / N8N_MYCASE_DOCS_WEBHOOK_TOKEN)",
    );
  }

  const res = await fetch(NEW_DECISIONS_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [AUTH_HEADER]: WEBHOOK_TOKEN,
    },
    // Send the date in two forms:
    //  - `date` (YYYY-MM-DD) for n8n's Filter Code node to compare against
    //    each doc's created_at.
    //  - `updatedAfter` (full ISO timestamp) for the List Documents HTTP
    //    node's `filter[updated_after]` query param. Pre-formatting it here
    //    means the n8n value can be a bare `={{ $json.body.updatedAfter }}`
    //    expression — no `... + 'T00:00:00Z'` concatenation, which n8n
    //    sometimes mishandles and ships malformed (MyCase rejects it as
    //    "filter[updated_after] is invalid").
    body: JSON.stringify({ date, updatedAfter: `${date}T00:00:00Z` }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `MyCase new-decisions webhook returned ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
    );
  }

  const json = await res.json();
  if (Array.isArray(json)) return json as MyCaseDocument[];
  if (Array.isArray(json?.data)) return json.data as MyCaseDocument[];
  if (Array.isArray(json?.items)) return json.items as MyCaseDocument[];
  return [];
}

// Subset of MyCase's case object that we care about for eligibility checks.
// The case-detail webhook returns the full case but we only read these.
export type MyCaseCase = {
  id: number;
  name?: string | null;
  case_stage?: string | null;
  practice_area?: string | null;
  office?: { id: number; name?: string | null } | null;
};

/**
 * Fetches a single case's detail (office / practice_area / case_stage) live
 * from MyCase via the dedicated n8n webhook. Returns `null` when the case
 * cannot be retrieved — callers treat that as "ineligible" so a transient
 * MyCase failure doesn't leak an unverified case through the filter.
 */
export async function fetchCaseDetail(
  caseId: number,
): Promise<MyCaseCase | null> {
  if (!CASE_DETAIL_WEBHOOK_URL || !WEBHOOK_TOKEN) {
    throw new Error(
      "MyCase case-detail webhook is not configured (N8N_MYCASE_CASE_DETAIL_WEBHOOK_URL / N8N_MYCASE_DOCS_WEBHOOK_TOKEN)",
    );
  }

  const res = await fetch(CASE_DETAIL_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [AUTH_HEADER]: WEBHOOK_TOKEN,
    },
    body: JSON.stringify({ id: caseId }),
    cache: "no-store",
  });

  if (!res.ok) {
    console.error(
      `MyCase case-detail webhook returned ${res.status} for case ${caseId}`,
    );
    return null;
  }

  const json = await res.json();
  // Tolerate the case being returned bare or wrapped in `{data}` / `{case}`.
  if (json && typeof json === "object") {
    if (json.id != null) return json as MyCaseCase;
    if (json.data && typeof json.data === "object" && json.data.id != null) {
      return json.data as MyCaseCase;
    }
    if (json.case && typeof json.case === "object" && json.case.id != null) {
      return json.case as MyCaseCase;
    }
  }
  return null;
}

/**
 * Resolves a single MyCase document to a directly-openable file URL.
 *
 * MyCase's `GET /v1/documents/{id}/data` returns a 302 redirect to a temporary
 * (presigned) file URL. The n8n webhook calls that endpoint with redirects
 * disabled and returns the `Location` header, which we hand back to the browser.
 */
export async function fetchDocumentDownloadUrl(
  documentId: number,
): Promise<string> {
  if (!DOC_FILE_WEBHOOK_URL || !WEBHOOK_TOKEN) {
    throw new Error(
      "MyCase document-file webhook is not configured (N8N_MYCASE_DOC_FILE_WEBHOOK_URL / N8N_MYCASE_DOCS_WEBHOOK_TOKEN)",
    );
  }

  const res = await fetch(DOC_FILE_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [AUTH_HEADER]: WEBHOOK_TOKEN,
    },
    body: JSON.stringify({ id: documentId }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `MyCase document-file webhook returned ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
    );
  }

  const json = await res.json();
  const url = pickUrl(json);

  if (!url) {
    throw new Error(
      `MyCase document-file webhook did not return a file URL. Got: ${JSON.stringify(json).slice(0, 400)}`,
    );
  }
  return url;
}

// Recursively dig an http(s) URL out of whatever shape the webhook returns:
// a bare string, { url } / { location } / { Location }, a wrapped { data } /
// { json } / { headers: { location } }, or an array of any of those.
function pickUrl(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    return value.startsWith("http") ? value : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = pickUrl(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    return (
      pickUrl(o.url) ??
      pickUrl(o.location) ??
      pickUrl(o.Location) ??
      pickUrl(o.headers) ??
      pickUrl(o.data) ??
      pickUrl(o.json) ??
      null
    );
  }
  return null;
}

// ---- helpers ----------------------------------------------------------------

type TreeFolder = {
  id: number;
  name: string | null;
  documents?: MyCaseDocument[];
  subfolders?: TreeFolder[];
};

type TreeResponse = {
  folders?: TreeFolder[];
  unfiled_documents?: MyCaseDocument[];
};

function flattenFolderTree(tree: TreeResponse): MyCaseDocument[] {
  const out: MyCaseDocument[] = [];
  const seen = new Set<number>();

  const push = (d: MyCaseDocument, folder: TreeFolder | null) => {
    if (d?.id == null || seen.has(d.id)) return;
    seen.add(d.id);
    out.push({
      ...d,
      folder: d.folder ?? (folder ? { id: folder.id } : null),
    });
  };

  const walk = (folder: TreeFolder) => {
    for (const d of folder.documents ?? []) push(d, folder);
    for (const sf of folder.subfolders ?? []) walk(sf);
  };

  for (const root of tree.folders ?? []) walk(root);
  for (const d of tree.unfiled_documents ?? []) push(d, null);
  return out;
}
