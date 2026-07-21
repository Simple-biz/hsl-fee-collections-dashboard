import type { WinSheetStatus, SyncStatus } from "@/types";

// Trim/case-insensitive comparison for matching a session's display name
// against an admin-managed roster name (team_members.name, agent_name on
// daily_metrics, etc). These are two independently-edited free-text fields
// that are supposed to mirror each other exactly — a stray space or
// capitalization difference between them silently locks someone out of
// editing their own row, so tolerate that class of drift rather than
// requiring byte-for-byte equality.
export const namesMatch = (
  a: string | null | undefined,
  b: string | null | undefined,
): boolean =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

export const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);

export const fmtFull = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    n,
  );

// Drop-in replacement for parseFloat on user-typed fee fields. Strips a
// leading "$" and thousands commas so staff can paste values like "$1,234.56"
// copied from MyCase documents without retyping them.
export const parseCurrencyInput = (raw: string): number =>
  parseFloat(raw.trim().replace(/^\$/, "").replace(/,/g, ""));

export const fmtDate = (d: string | null | undefined): string => {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${m}/${day}/${y}`;
};

// Monday (YYYY-MM-DD) of the current week, shifted by `offset` weeks.
// Shared by the week-nav tabs on Notifications and Reports.
//
// Builds the string from local Y/M/D getters rather than toISOString()
// (which converts to UTC) — for anyone east of UTC (e.g. Philippines,
// UTC+8), toISOString() rolls back to the previous calendar day for any
// local time before 8am, making this return Sunday's date on a Monday
// morning. Local getters always reflect the calendar date setDate() above
// actually produced, regardless of timezone.
export const getMonday = (offset = 0): string => {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1) + offset * 7);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

// Monday (YYYY-MM-DD) of the week that contains `dateStr`. Accepts an ISO
// date string (YYYY-MM-DD). Uses numeric-part construction so the Date is
// always local midnight — avoids UTC-shift issues for timezones east of UTC.
export const getMondayOfDate = (dateStr: string): string => {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const dow = date.getDay();
  date.setDate(date.getDate() + (dow === 0 ? -6 : 1 - dow));
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
};

// "Jun 29 – Jul 3, 2026"-style label for the week starting at `monday`.
// `spanDays` is the offset to the END of the displayed week — 4 for a
// Mon-Fri business week (Audit Log, Recent Activity), 6 for a full Mon-Sun
// week (New Cases, which counts cases added every day, not just weekdays).
export const formatWeekLabel = (monday: string, spanDays = 4): string => {
  const start = new Date(monday + "T00:00:00");
  const end = new Date(monday + "T00:00:00");
  end.setDate(end.getDate() + spanDays);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${start.toLocaleDateString("en-US", opts)} – ${end.toLocaleDateString("en-US", { ...opts, year: "numeric" })}`;
};

// Mon-Sun (spanDays=6) variant — used by all notification tabs that count
// events across a full calendar week rather than just the business week.
export const formatWeekLabelShort = (monday: string): string =>
  formatWeekLabel(monday, 6);

// Timestamp for notes/activity — e.g. "May 3, 8:00 PM". Takes a full ISO
// timestamp (with time), unlike fmtDate which takes a date-only string.
export const fmtDateTime = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

// Date with year for ISO timestamps — e.g. "Jul 1, 2026". Takes a full ISO
// timestamp like fmtDateTime, but omits the time (used where only the day
// matters, e.g. "Cleared On"/"Notice Received" columns).
export const fmtDateLong = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

// MS Teams pastes rich text from clipboard — an HTML table renders with visible borders and alignment.
export const toTeamsHtml = (
  title: string,
  headers: string[],
  rows: (string | number)[][],
): string => {
  const th = `padding:4px 8px;border:1px solid #d0d0d0;background:#f5f5f5;font-weight:600;text-align:left`;
  const td = `padding:4px 8px;border:1px solid #d0d0d0`;
  const headRow = headers.map((h) => `<th style="${th}">${h}</th>`).join("");
  const bodyRows = rows
    .map(
      (r) =>
        `<tr>${headers.map((_, ci) => `<td style="${td}">${r[ci] ?? ""}</td>`).join("")}</tr>`,
    )
    .join("");
  return (
    `<p><strong>${title}</strong></p>` +
    `<table style="border-collapse:collapse">` +
    `<thead><tr>${headRow}</tr></thead>` +
    `<tbody>${bodyRows}</tbody>` +
    `</table>`
  );
};

// Google Chat renders ``` blocks in a fixed-width font — padding aligns columns.
export const toChatBlock = (
  title: string,
  headers: string[],
  rows: (string | number)[][],
): string => {
  const all: string[][] = [headers.map(String), ...rows.map((r) => r.map(String))];
  const widths = headers.map((_, ci) =>
    Math.max(...all.map((row) => (row[ci] ?? "").length)),
  );
  const table = all
    .map((row) =>
      widths.map((w, ci) => (row[ci] ?? "").padEnd(w)).join("  ").trimEnd(),
    )
    .join("\n");
  return "```\n" + title + "\n" + table + "\n```";
};

// Claim type display: T2_T16 → CONC, T2/T16 → CONC, CONCURRENT → CONC.
// CONCURRENT was a dropdown-option spelling briefly live in Settings that
// wrote straight into claim_type_label — same "the dropdown drifted" class
// of bug as the fees_confirmation rename, kept here defensively in case it
// recurs. Worksheet-style values (CONC, DWB, DAC, AUX) pass through
// unchanged so rows saved directly via the dashboard dropdowns render
// verbatim.
export const fmtClaim = (claim: string): string => {
  if (claim === "T2_T16" || claim === "T2/T16" || claim === "CONCURRENT") return "CONC";
  return claim;
};

// Long-form claim labels for the case-name sub-line:
//   T2 → Title II, T16 → Title XVI, T2_T16/CONC/CONCURRENT → Concurrent.
// Anything else (DWB, DAC, AUX, "—", …) passes through unchanged.
export const fmtClaimLong = (claim: string): string => {
  switch (claim) {
    case "T2":
      return "Title II";
    case "T16":
      return "Title XVI";
    case "T2_T16":
    case "T2/T16":
    case "CONC":
    case "CONCURRENT":
      return "Concurrent";
    default:
      return claim;
  }
};

// Win sheet status labels matching the spreadsheet.
// The DB used to enforce a 7-state enum; it's now varchar so the dropdown
// values from /settings can be saved directly. The lookup covers BOTH the
// legacy enum keys (`not_started`, `paid_in_full`, …) and the
// worksheet-friendly labels (`Started`, `Finished`) — anything else falls
// back to the raw string in the cell.
export const STATUS_LABELS: Record<string, string> = {
  // Legacy enum values
  not_started: "Not Started",
  started: "Started",
  in_progress: "Started", // sheet groups these as "Started"
  pending_payment: "Finished", // fee computed, waiting on SSA = Finished in sheet
  partially_paid: "Finished", // some fees received = Finished in sheet
  paid_in_full: "Finished", // all fees received = Finished
  closed: "Closed",
  // Worksheet-direct values (pass-through)
  Started: "Started",
  Finished: "Finished",
  Closed: "Closed",
};

// Detailed status for case detail page (keeps granularity)
export const STATUS_LABELS_DETAIL: Record<string, string> = {
  not_started: "Not Started",
  started: "Started",
  in_progress: "In Progress",
  pending_payment: "Pending Payment",
  partially_paid: "Partially Paid",
  paid_in_full: "Paid in Full",
  closed: "Closed",
};

export const SYNC_LABELS: Record<string, string> = {
  not_synced: "Pending",
  syncing: "Syncing",
  synced: "Synced",
  error: "Error",
};

// Level display. Accepts both the legacy enum values (FEE_PETITION,
// FEDERAL_COURT, …) and the worksheet-style label ("FEE PETITION") so
// dropdown saves and historical rows both render cleanly.
export const LEVEL_LABELS: Record<string, string> = {
  INITIAL: "Initial",
  RECON: "Recon",
  HEARING: "Hearing",
  AC: "AC",
  FEDERAL_COURT: "Fed Court",
  FEE_PETITION: "Fee Petition",
  "FEE PETITION": "Fee Petition",
};

const STATUS_FALLBACK: [string, string] = [
  "bg-neutral-100 text-neutral-500",
  "bg-neutral-800 text-neutral-400",
];

export const getStatusColor = (
  status: WinSheetStatus | string,
  dark: boolean,
): string => {
  const FINISHED_COLORS: [string, string] = [
    "bg-emerald-100 text-emerald-700",
    "bg-emerald-900/40 text-emerald-400",
  ];
  const STARTED_COLORS: [string, string] = [
    "bg-blue-100 text-blue-700",
    "bg-blue-900/40 text-blue-400",
  ];
  const map: Record<string, [string, string]> = {
    // Legacy enum values
    paid_in_full: FINISHED_COLORS,
    partially_paid: [
      "bg-amber-100 text-amber-700",
      "bg-amber-900/40 text-amber-400",
    ],
    started: STARTED_COLORS,
    in_progress: [
      "bg-orange-100 text-orange-700",
      "bg-orange-900/40 text-orange-400",
    ],
    pending_payment: [
      "bg-violet-100 text-violet-700",
      "bg-violet-900/40 text-violet-400",
    ],
    closed: [
      "bg-neutral-100 text-neutral-500",
      "bg-neutral-800 text-neutral-400",
    ],
    not_started: [
      "bg-neutral-100 text-neutral-500",
      "bg-neutral-800 text-neutral-400",
    ],
    // Worksheet-direct values
    Started: STARTED_COLORS,
    Finished: FINISHED_COLORS,
    Closed: [
      "bg-neutral-100 text-neutral-500",
      "bg-neutral-800 text-neutral-400",
    ],
  };
  const colors = map[status] || STATUS_FALLBACK;
  return dark ? colors[1] : colors[0];
};

export const getSyncColor = (
  status: SyncStatus | string,
  dark: boolean,
): string => {
  const map: Record<string, [string, string]> = {
    synced: [
      "bg-emerald-100 text-emerald-700",
      "bg-emerald-900/40 text-emerald-400",
    ],
    not_synced: [
      "bg-neutral-100 text-neutral-500",
      "bg-neutral-800 text-neutral-400",
    ],
    error: ["bg-red-100 text-red-700", "bg-red-900/40 text-red-400"],
    syncing: ["bg-blue-100 text-blue-700", "bg-blue-900/40 text-blue-400"],
  };
  const colors = map[status] || STATUS_FALLBACK;
  return dark ? colors[1] : colors[0];
};
