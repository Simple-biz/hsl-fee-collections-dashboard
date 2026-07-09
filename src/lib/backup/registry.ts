import "server-only";
import type { PgTable } from "drizzle-orm/pg-core";
import {
  cases,
  feeRecords,
  feePetitions,
  feePayments,
  overpaidCases,
  userDetails,
  teamMembers,
  dropdownOptions,
  dailyMetrics,
  inboundCallRecords,
  inboundCallPoc,
  leaderNotes,
  caseArchive,
  chronicleDocuments,
  mycaseNoticeDocuments,
} from "@/lib/db/schema";

// The tables covered by the full-data backup/restore feature — deliberately
// excludes config/audit tables (activity_log, sync_logs, pull_logs,
// admin_activity_log, notifications, app_settings, approved_by_options,
// fee_cap_history, mycase_sync_tags) and auth/security tables (users,
// user_access_overrides). Adding a table here is the whole change needed for
// export/restore to pick it up — every route iterates this array.
export interface BackupTableConfig {
  /** Excel sheet tab name — keep under 31 chars (Excel's own limit). */
  key: string;
  label: string;
  table: PgTable;
  /**
   * Column(s) — TS property names, not DB column names — that identify "the
   * same row" across an export/restore round-trip. Must be backed by a real
   * unique constraint/index so onConflictDoUpdate can target it. Defaults to
   * the table's own primary key; caseId is used instead for tables that are
   * 1:1 children of cases (feeRecords, feePetitions, userDetails,
   * overpaidCases all have a unique caseId) so a restore still finds the
   * right row even if the case itself was deleted and re-created in between,
   * which would change its surrogate id but not its caseId.
   */
  reconcileBy: string[];
  /** Columns excluded from the export entirely (e.g. plaintext SSNs). */
  excludeColumns?: string[];
}

export const BACKUP_TABLES: BackupTableConfig[] = [
  { key: "Cases", label: "Cases", table: cases, reconcileBy: ["clientId"], excludeColumns: ["fullSsn", "ssnEncrypted"] },
  { key: "FeeRecords", label: "Fee Records", table: feeRecords, reconcileBy: ["caseId"] },
  { key: "FeePetitions", label: "Fee Petitions", table: feePetitions, reconcileBy: ["caseId"] },
  { key: "FeePayments", label: "Fee Payments", table: feePayments, reconcileBy: ["id"] },
  { key: "OverpaidCases", label: "Overpaid Cases", table: overpaidCases, reconcileBy: ["caseId"] },
  { key: "UserDetails", label: "User Details", table: userDetails, reconcileBy: ["caseId"], excludeColumns: ["ssn"] },
  { key: "TeamMembers", label: "Team Members", table: teamMembers, reconcileBy: ["name"] },
  { key: "DropdownOptions", label: "Dropdown Options", table: dropdownOptions, reconcileBy: ["category", "name"] },
  { key: "DailyMetrics", label: "Daily Metrics", table: dailyMetrics, reconcileBy: ["id"] },
  { key: "InboundCallRecords", label: "Inbound Calls", table: inboundCallRecords, reconcileBy: ["id"] },
  { key: "InboundCallPoc", label: "Inbound Call POC", table: inboundCallPoc, reconcileBy: ["weekStart", "dayOfWeek", "pocName"] },
  { key: "LeaderNotes", label: "Leader Notes", table: leaderNotes, reconcileBy: ["id"] },
  { key: "CaseArchive", label: "Case Archive", table: caseArchive, reconcileBy: ["id"] },
  { key: "ChronicleDocuments", label: "Chronicle Documents", table: chronicleDocuments, reconcileBy: ["caseId", "chronicleDocumentId"] },
  { key: "MyCaseNoticeDocuments", label: "MyCase Notice Docs", table: mycaseNoticeDocuments, reconcileBy: ["caseId", "mycaseDocumentId"] },
];

// Bumped whenever a change to BACKUP_TABLES or the exported row shape would
// make an older backup file unsafe to restore without review (a table
// renamed/removed, a reconcileBy key changed). Written to the _Manifest
// sheet on export and checked before a restore preview runs.
export const BACKUP_SCHEMA_VERSION = 1;
