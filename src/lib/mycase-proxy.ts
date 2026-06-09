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
// Case detail webhook — no auth header; n8n uses auth: None.
const CASE_DETAIL_WEBHOOK_URL = process.env.N8N_MYCASE_CASE_DETAIL_WEBHOOK_URL;
const AUTH_HEADER = "Fee-Collections-Docs-App-Token";

export type MyCaseCaseDetail = {
  id: number;
  name: string;
  case_stage: string | null;
  status: string;
  opened_date: string | null;
  closed_date: string | null;
  custom_field_values: Array<{
    custom_field: { id: number };
    value: string | number | null;
    created_at: string | null;
    updated_at: string | null;
  }>;
};

export async function fetchCaseDetails(
  caseId: number,
): Promise<MyCaseCaseDetail> {
  if (!CASE_DETAIL_WEBHOOK_URL) {
    throw new Error(
      "MyCase case detail webhook is not configured (N8N_MYCASE_CASE_DETAIL_WEBHOOK_URL)",
    );
  }

  const res = await fetch(CASE_DETAIL_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: caseId }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `MyCase case detail webhook returned ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
    );
  }

  return res.json() as Promise<MyCaseCaseDetail>;
}

// Shape returned by MyCase's GET /v1/cases/{id}/documents endpoint.
export type MyCaseDocument = {
  id: number;
  name: string;
  filename: string | null;
  path: string | null;
  description: string | null;
  assigned_date: string | null;
  case: { id: number } | null;
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
