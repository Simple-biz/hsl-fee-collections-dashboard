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
