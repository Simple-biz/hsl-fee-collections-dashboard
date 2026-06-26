export type ClaimTypeLabel = "T2" | "T16" | "T2_T16";
export type LevelWon =
  | "INITIAL"
  | "RECON"
  | "HEARING"
  | "AC"
  | "FEDERAL_COURT"
  | "FEE_PETITION";
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
  // MyCase case URL (from cases.external_id); null when not imported with a link.
  externalId: string | null;
  // Chronicle client id (from user_details); null when not backfilled.
  chronicleId: number | null;
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
  feesConfirmation: string | null;
  feesClosedTrigger: string | null;
  caseStatus: string | null;
  isClosed: boolean;
  markedOverpaid: boolean;
  closedAt: string | null;
  update: string;
  sync: SyncStatus;

  // Aging
  daysAfterApproval: number | null;
  approvalCategory: string | null;

  // Sheet-computed
  feesStatus: string | null;
  weekAssignedToAgent: string | null;
  monthAssignedToAgent: string | null;

  // Context
  office: string;

  // Notes
  notesCount: number;

  // Win Sheet
  winSheetLink: string | null;
  winSheetLinkText: string | null;
}

// Admin-managed option for the dashboard's "Approved By" dropdown (/settings).
export interface ApprovedByOption {
  id: number;
  name: string;
  isActive: boolean;
  sortOrder: number;
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

export interface UserDetails {
  chronicleId: number | null;
  fullName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  country: string | null;
  cellPhone: string | null;
  email: string | null;
  ssn: string | null;
  dateOfBirth: string | null;
  ageAtApproval: number | null;
  placeOfBirth: string | null;
  mothersName: string | null;
  fathersName: string | null;
}

export interface ActivityLogEntry {
  id: string;
  message: string;
  createdBy: string;
  createdAt: string;
}

export interface CaseDetailData {
  id: number;
  externalId: string | null;
  name: string;
  firstName: string;
  lastName: string;
  claim: string;
  level: string;
  t2Decision: string | null;
  t16Decision: string | null;
  approvalDate: string | null;
  office: string;
  assigned: string;
  status: string;

  // PDF-extracted fields
  fullSsn: string | null;
  dob: string | null;
  email: string | null;
  phone: string | null;
  primaryDiagnosis: string | null;
  primaryDiagnosisCode: string | null;
  secondaryDiagnosis: string | null;
  secondaryDiagnosisCode: string | null;
  allegations: string | null;
  blindDli: string | null;
  lastInsured: string | null;
  firmName: string | null;
  firmEin: string | null;
  hearingOffice: string | null;
  representatives: string | null;
  decisionHistory: string | null;

  // Financials
  t16Retro: number;
  t16FeeDue: number;
  t16FeeReceived: number;
  t16Pending: number;
  t16FeeReceivedDate: string | null;
  t2Retro: number;
  t2FeeDue: number;
  t2FeeReceived: number;
  t2Pending: number;
  t2FeeReceivedDate: string | null;
  auxRetro: number;
  auxFeeDue: number;
  auxFeeReceived: number;
  auxPending: number;
  auxFeeReceivedDate: string | null;

  totalRetroDue: number;
  expected: number;
  paid: number;
  outstanding: number;

  // Workflow
  pif: PifStatus;
  approvedBy: string | null;
  feesClosedTrigger: string | null;
  feeMethod: string | null;
  applicableFeeCap: number;
  feeCapApplied: boolean;
  feeComputed: boolean;
  feeComputedAt: string | null;
  syncStatus: string;
  syncedAt: string | null;

  // Aging
  daysAfterApproval: number | null;
  approvalCategory: string | null;

  // Sheet-computed
  feesStatus: string | null;
  weekAssignedToAgent: string | null;
  monthAssignedToAgent: string | null;

  // User details
  userDetails: UserDetails | null;

  // Activity log
  activities: ActivityLogEntry[];
}
