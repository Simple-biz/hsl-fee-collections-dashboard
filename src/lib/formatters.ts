import type { WinSheetStatus, SyncStatus } from "@/types";

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

export const fmtDate = (d: string | null | undefined): string => {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${m}/${day}/${y}`;
};

// Claim type display: T2_T16 → CONC, T2/T16 → CONC
export const fmtClaim = (claim: string): string => {
  if (claim === "T2_T16" || claim === "T2/T16") return "CONC";
  return claim;
};

// Win sheet status labels matching the spreadsheet
// DB has granular statuses → sheet shows simplified labels
export const STATUS_LABELS: Record<string, string> = {
  not_started: "Not Started",
  started: "Started",
  in_progress: "Started", // sheet groups these as "Started"
  pending_payment: "Finished", // fee computed, waiting on SSA = Finished in sheet
  partially_paid: "Finished", // some fees received = Finished in sheet
  paid_in_full: "Finished", // all fees received = Finished
  closed: "Closed",
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

// Level display
export const LEVEL_LABELS: Record<string, string> = {
  INITIAL: "Initial",
  RECON: "Recon",
  HEARING: "Hearing",
  AC: "AC",
  FEDERAL_COURT: "Fed Court",
  FEE_PETITION: "Fee Petition",
};

const STATUS_FALLBACK: [string, string] = [
  "bg-neutral-100 text-neutral-500",
  "bg-neutral-800 text-neutral-400",
];

export const getStatusColor = (
  status: WinSheetStatus | string,
  dark: boolean,
): string => {
  const map: Record<string, [string, string]> = {
    paid_in_full: [
      "bg-emerald-100 text-emerald-700",
      "bg-emerald-900/40 text-emerald-400",
    ],
    partially_paid: [
      "bg-amber-100 text-amber-700",
      "bg-amber-900/40 text-amber-400",
    ],
    started: ["bg-blue-100 text-blue-700", "bg-blue-900/40 text-blue-400"],
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
