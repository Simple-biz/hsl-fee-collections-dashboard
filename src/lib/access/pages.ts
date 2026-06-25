// ============================================================================
// Page registry — the catalog of access-controlled pages.
//
// Pure data + helpers ONLY (no DB, no Node APIs) so this is safe to import
// from the edge `auth.config.ts`. The keys are stable identifiers used by the
// role defaults, the per-user overrides, and the admin UI.
// ============================================================================

export const PAGES = [
  { key: "overview", label: "Overview", path: "/" },
  { key: "master_fees", label: "Master Fees", path: "/master-fees" },
  { key: "fees_closed", label: "Fees Closed", path: "/fees-closed" },
  { key: "scoreboard", label: "Scoreboard", path: "/scoreboard" },
  { key: "chronicle", label: "Chronicle Sync", path: "/chronicle" },
  { key: "fee_petitions", label: "Fee Petitions", path: "/fee-petitions" },
  { key: "overpaid_cases", label: "Overpaid Cases", path: "/overpaid-cases" },
  { key: "mycase", label: "MyCase", path: "/mycase" },
  { key: "reports", label: "Reports", path: "/reports" },
  { key: "notifications", label: "Notifications", path: "/notifications" },
  { key: "team", label: "Team", path: "/team" },
  { key: "admin", label: "Admin", path: "/admin" },
  { key: "settings", label: "Settings", path: "/settings" },
  { key: "archive", label: "Archive", path: "/archive" },
] as const;

export type PageKey = (typeof PAGES)[number]["key"];

export const PAGE_KEYS: PageKey[] = PAGES.map((p) => p.key);

/**
 * Resolve a request pathname to a page key. Uses longest-path-prefix matching
 * so nested routes (e.g. /overpaid-cases/123) map to their parent page.
 * Returns null for non-page paths (api routes, assets, etc.) — callers should
 * skip access checks when null.
 */
export const pageKeyForPath = (pathname: string): PageKey | null => {
  if (pathname === "/") return "overview";
  let best: { key: PageKey; len: number } | null = null;
  for (const p of PAGES) {
    if (p.path === "/") continue; // handled above; never prefix-match root
    if (pathname === p.path || pathname.startsWith(p.path + "/")) {
      if (!best || p.path.length > best.len) {
        best = { key: p.key, len: p.path.length };
      }
    }
  }
  return best?.key ?? null;
};
