// Shared types for FeeRecordsTable and its extracted hooks.
// Kept in the same directory so they're co-located with the component they serve.

export type SortKey =
  | "name"
  | "assigned"
  | "date"
  | "expected"
  | "paid"
  | "daysAfterApproval"
  | "nextFollowUpDate"
  | "closedAt"
  | "createdAt";

export type SortDir = "asc" | "desc";

export type FilterPreset = { id: string; name: string; params: string };

// Field keys written by handleVarcharChange for cases vs fee_records tables.
export type CaseField = "claimTypeLabel" | "levelWon";
export type FeeField =
  | "assignedTo"
  | "approvedBy"
  | "feesConfirmation"
  | "caseStatus"
  | "winSheetStatus"
  | "nextFollowUpDate";

// Keys used by cellValue() to read optimistic-pending overrides.
export type DropdownRowKey =
  | "assigned"
  | "approvedBy"
  | "feesConfirmation"
  | "caseStatus"
  | "nextFollowUpDate"
  | "level"
  | "claim"
  | "status";
