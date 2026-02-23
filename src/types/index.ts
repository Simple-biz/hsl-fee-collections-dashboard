export type ClaimTypeLabel = "T2" | "T16" | "T2_T16";
export type LevelWon = "INITIAL" | "RECON" | "HEARING" | "AC" | "FEDERAL_COURT";
export type DecisionOutcome =
  | "fully_favorable"
  | "partially_favorable"
  | "unfavorable"
  | "dismissed"
  | "remand"
  | "unknown";
export type WinSheetStatus =
  | "not_started"
  | "started"
  | "in_progress"
  | "pending_payment"
  | "partially_paid"
  | "paid_in_full"
  | "closed";
export type SyncStatus = "not_synced" | "syncing" | "synced" | "error";
export type FeeMethod = "fee_agreement" | "fee_petition";
export type PifStatus = "YES" | "NO" | "PENDING" | null;

export interface CaseRow {
  id: number;
  name: string;
  assigned: string;
  level: string;
  claim: string;
  date: string | null;
  status: WinSheetStatus;

  // T16 section
  t16Retro: number;
  t16FeeDue: number;
  t16FeeReceived: number;
  t16Pending: number;
  t16FeeReceivedDate: string | null;

  // T2 section
  t2Retro: number;
  t2FeeDue: number;
  t2FeeReceived: number;
  t2Pending: number;
  t2FeeReceivedDate: string | null;

  // AUX section
  auxRetro: number;
  auxFeeDue: number;
  auxFeeReceived: number;
  auxPending: number;
  auxFeeReceivedDate: string | null;

  // Totals
  totalRetroDue: number;
  expected: number;
  paid: number;

  // Workflow
  pif: PifStatus;
  approvedBy: string | null;
  update: string;
  sync: SyncStatus;

  // Aging
  daysAfterApproval: number | null;
  approvalCategory: string | null;

  // Context
  office: string;
}

export interface DashboardSummary {
  totalCases: number;
  expected: number;
  paid: number;
  outstanding: number;
  pif: number;
  syncErrors: number;
  synced: number;
}

export interface MonthlyData {
  month: string;
  expected: number;
  collected: number;
}

export interface TeamMember {
  name: string;
  role: string;
  cases: number;
  collected: string;
}
