import "server-only";

/**
 * Calls the n8n webhook that proxies MyCase Open API. MyCase OAuth credentials
 * live in n8n; this app never holds them. The webhook is protected with a
 * static header secret (`Fee-Collections-Docs-App-Token`) so the URL alone isn't enough to call it.
 */

const WEBHOOK_URL = process.env.N8N_MYCASE_DOCS_WEBHOOK_URL;
const WEBHOOK_TOKEN = process.env.N8N_MYCASE_DOCS_WEBHOOK_TOKEN;
const AUTH_HEADER = "Fee-Collections-Docs-App-Token";

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
