import {
  pgTable,
  pgEnum,
  serial,
  integer,
  varchar,
  text,
  date,
  boolean,
  decimal,
  timestamp,
  uuid,
  jsonb,
  index,
  // uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ============================================================================
// ENUMS
// ============================================================================

export const claimTypeEnum = pgEnum("claim_type_enum", ["T2", "T16", "T2_T16"]);
export const levelWonEnum = pgEnum("level_won_enum", [
  "INITIAL",
  "RECON",
  "HEARING",
  "AC",
  "FEDERAL_COURT",
]);
export const decisionOutcomeEnum = pgEnum("decision_outcome_enum", [
  "fully_favorable",
  "partially_favorable",
  "unfavorable",
  "dismissed",
  "remand",
  "unknown",
]);
export const winSheetStatusEnum = pgEnum("win_sheet_status_enum", [
  "not_started",
  "started",
  "in_progress",
  "pending_payment",
  "partially_paid",
  "paid_in_full",
  "closed",
]);
export const syncStatusEnum = pgEnum("sync_status_enum", [
  "not_synced",
  "syncing",
  "synced",
  "error",
]);
export const feeMethodEnum = pgEnum("fee_method_enum", [
  "fee_agreement",
  "fee_petition",
]);

// ============================================================================
// CASES
// ============================================================================

export const cases = pgTable(
  "cases",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id").notNull().unique(),
    externalId: varchar("external_id", { length: 100 }),

    // Claimant info
    firstName: varchar("first_name", { length: 100 }).notNull(),
    lastName: varchar("last_name", { length: 100 }).notNull(),
    dob: date("dob"),
    last4Ssn: varchar("last4_ssn", { length: 4 }),

    // Claim info
    claimType: text("claim_type").array().notNull().default([]),
    claimTypeLabel: claimTypeEnum("claim_type_label"),
    levelWon: levelWonEnum("level_won"),
    t2Decision: decisionOutcomeEnum("t2_decision").default("unknown"),
    t16Decision: decisionOutcomeEnum("t16_decision").default("unknown"),

    // Dates
    applicationDate: date("application_date"),
    allegedOnsetDate: date("alleged_onset_date"),
    approvalDate: date("approval_date"),
    closureDate: date("closure_date"),
    hearingHeldDate: date("hearing_held_date"),
    hearingScheduledDate: date("hearing_scheduled_date"),
    hearingScheduledDatetime: timestamp("hearing_scheduled_datetime", {
      withTimezone: true,
    }),
    hearingTimezone: varchar("hearing_timezone", { length: 50 }),

    // SSA info
    officeWithJurisdiction: varchar("office_with_jurisdiction", {
      length: 200,
    }),
    aljFirstName: varchar("alj_first_name", { length: 100 }),
    aljLastName: varchar("alj_last_name", { length: 100 }),
    claimantLocation: varchar("claimant_location", { length: 200 }),
    representativeLocation: varchar("representative_location", { length: 200 }),
    medicalExpert: varchar("medical_expert", { length: 200 }),
    vocationalExpert: varchar("vocational_expert", { length: 200 }),

    // PDF links
    allFileLink: text("all_file_link"),
    exhibitsFileLink: text("exhibits_file_link"),
    allFileUpdatedAt: timestamp("all_file_updated_at", { withTimezone: true }),
    exhibitsFileUpdatedAt: timestamp("exhibits_file_updated_at", {
      withTimezone: true,
    }),

    // Chronicle Legal metadata
    reportType: varchar("report_type", { length: 100 }),
    expeditedCase: varchar("expedited_case", { length: 50 }),
    statusOfCase: varchar("status_of_case", { length: 100 }),
    statusDate: date("status_date"),
    requestDate: date("request_date"),
    receiptDate: date("receipt_date"),
    firstDateAssigned: date("first_date_assigned"),
    dateFqrStarts: date("date_fqr_starts"),
    lastInsured: date("last_insured"),
    ownerUserId: varchar("owner_user_id", { length: 100 }),
    createdByUserId: varchar("created_by_user_id", { length: 100 }),
    sourceCreatedAt: timestamp("source_created_at", { withTimezone: true }),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    lastEreSessionDate: timestamp("last_ere_session_date", {
      withTimezone: true,
    }),
    lastStatusReportDate: timestamp("last_status_report_date", {
      withTimezone: true,
    }),
    documentsLastAddedAt: timestamp("documents_last_added_at", {
      withTimezone: true,
    }),
    invalidSsn: boolean("invalid_ssn").default(false),

    // Internal timestamps
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastPulledAt: timestamp("last_pulled_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_cases_client_id").on(table.clientId),
    index("idx_cases_external_id").on(table.externalId),
    index("idx_cases_claim_type_label").on(table.claimTypeLabel),
    index("idx_cases_approval_date").on(table.approvalDate),
    index("idx_cases_last_name").on(table.lastName),
  ],
);

// ============================================================================
// FEE_RECORDS
// ============================================================================

export const feeRecords = pgTable(
  "fee_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: integer("case_id")
      .notNull()
      .references(() => cases.clientId, { onDelete: "cascade" })
      .unique(),

    // Assignment & Workflow
    assignedTo: varchar("assigned_to", { length: 100 }),
    winSheetStatus:
      winSheetStatusEnum("win_sheet_status").default("not_started"),

    // T16
    t16Retro: decimal("t16_retro", { precision: 12, scale: 2 }).default("0"),
    t16FeeDue: decimal("t16_fee_due", { precision: 12, scale: 2 }).default("0"),
    t16FeeReceived: decimal("t16_fee_received", {
      precision: 12,
      scale: 2,
    }).default("0"),
    t16Pending: decimal("t16_pending", { precision: 12, scale: 2 }).default(
      "0",
    ),
    t16FeeReceivedDate: date("t16_fee_received_date"),

    // T2
    t2Retro: decimal("t2_retro", { precision: 12, scale: 2 }).default("0"),
    t2FeeDue: decimal("t2_fee_due", { precision: 12, scale: 2 }).default("0"),
    t2FeeReceived: decimal("t2_fee_received", {
      precision: 12,
      scale: 2,
    }).default("0"),
    t2Pending: decimal("t2_pending", { precision: 12, scale: 2 }).default("0"),
    t2FeeReceivedDate: date("t2_fee_received_date"),

    // AUX
    auxRetro: decimal("aux_retro", { precision: 12, scale: 2 }).default("0"),
    auxFeeDue: decimal("aux_fee_due", { precision: 12, scale: 2 }).default("0"),
    auxFeeReceived: decimal("aux_fee_received", {
      precision: 12,
      scale: 2,
    }).default("0"),
    auxPending: decimal("aux_pending", { precision: 12, scale: 2 }).default(
      "0",
    ),
    auxFeeReceivedDate: date("aux_fee_received_date"),

    // Totals (auto-computed by DB trigger)
    totalRetroDue: decimal("total_retro_due", {
      precision: 12,
      scale: 2,
    }).default("0"),
    totalFeesExpected: decimal("total_fees_expected", {
      precision: 12,
      scale: 2,
    }).default("0"),
    totalFeesPaid: decimal("total_fees_paid", {
      precision: 12,
      scale: 2,
    }).default("0"),

    // Closure Workflow
    pifReadyToClose: boolean("pif_ready_to_close").default(false),
    approvedBy: varchar("approved_by", { length: 100 }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),

    // Fee Computation Metadata
    feeMethod: feeMethodEnum("fee_method").default("fee_agreement"),
    applicableFeeCap: decimal("applicable_fee_cap", {
      precision: 12,
      scale: 2,
    }).default("9200"),
    feeCapApplied: boolean("fee_cap_applied").default(false),
    feeComputed: boolean("fee_computed").default(false),
    feeComputedAt: timestamp("fee_computed_at", { withTimezone: true }),

    // Sync
    syncStatus: syncStatusEnum("sync_status").default("not_synced"),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
    mycaseRecordId: varchar("mycase_record_id", { length: 100 }),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_fee_records_case_id").on(table.caseId),
    index("idx_fee_records_assigned_to").on(table.assignedTo),
    index("idx_fee_records_win_sheet_status").on(table.winSheetStatus),
    index("idx_fee_records_sync_status").on(table.syncStatus),
    index("idx_fee_records_pif").on(table.pifReadyToClose),
  ],
);

// ============================================================================
// ACTIVITY_LOG
// ============================================================================

export const activityLog = pgTable(
  "activity_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: integer("case_id")
      .notNull()
      .references(() => cases.clientId, { onDelete: "cascade" }),
    feeRecordId: uuid("fee_record_id").references(() => feeRecords.id, {
      onDelete: "cascade",
    }),
    message: text("message").notNull(),
    createdBy: varchar("created_by", { length: 100 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_activity_log_case_id").on(table.caseId),
    index("idx_activity_log_created_at").on(table.createdAt),
  ],
);

// ============================================================================
// SYNC_LOGS
// ============================================================================

export const syncLogs = pgTable(
  "sync_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    triggeredBy: varchar("triggered_by", { length: 100 }).notNull(),
    totalCases: integer("total_cases").notNull().default(0),
    successCount: integer("success_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    caseIds: integer("case_ids").array(),
    errorDetails: jsonb("error_details"),
    triggeredAt: timestamp("triggered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [index("idx_sync_logs_triggered_at").on(table.triggeredAt)],
);

// ============================================================================
// TEAM_MEMBERS
// ============================================================================

export const teamMembers = pgTable("team_members", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  role: varchar("role", { length: 100 }).default("collections_specialist"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ============================================================================
// FEE_CAP_HISTORY
// ============================================================================

export const feeCapHistory = pgTable("fee_cap_history", {
  id: serial("id").primaryKey(),
  effectiveDate: date("effective_date").notNull().unique(),
  capAmount: decimal("cap_amount", { precision: 12, scale: 2 }).notNull(),
  notes: varchar("notes", { length: 200 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ============================================================================
// PULL_LOGS
// ============================================================================

export const pullLogs = pgTable("pull_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  triggeredBy: varchar("triggered_by", { length: 100 }).notNull(),
  totalRecordsPulled: integer("total_records_pulled").notNull().default(0),
  newCases: integer("new_cases").notNull().default(0),
  updatedCases: integer("updated_cases").notNull().default(0),
  errors: integer("errors").notNull().default(0),
  errorDetails: jsonb("error_details"),
  triggeredAt: timestamp("triggered_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

// ============================================================================
// DAILY_METRICS — Agent call tracking for scoreboard
// ============================================================================

export const dailyMetrics = pgTable(
  "daily_metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentName: varchar("agent_name", { length: 100 })
      .notNull()
      .references(() => teamMembers.name),
    metricDate: date("metric_date").notNull().defaultNow(),
    ssaCalls: integer("ssa_calls").notNull().default(0),
    clientCallsIb: integer("client_calls_ib").notNull().default(0),
    clientCallsOb: integer("client_calls_ob").notNull().default(0),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_daily_metrics_agent").on(table.agentName),
    index("idx_daily_metrics_date").on(table.metricDate),
  ],
);

// ============================================================================
// NOTIFICATIONS
// ============================================================================

export const notificationTypeEnum = pgEnum("notification_type_enum", [
  "case_aging",
  "fee_payment",
  "call_target_missed",
  "case_assigned",
]);

export const notificationSeverityEnum = pgEnum("notification_severity_enum", [
  "info",
  "warning",
  "critical",
]);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: notificationTypeEnum("type").notNull(),
    severity: notificationSeverityEnum("severity").notNull().default("info"),
    title: varchar("title", { length: 300 }).notNull(),
    message: text("message").notNull(),
    caseId: integer("case_id").references(() => cases.clientId, {
      onDelete: "cascade",
    }),
    agentName: varchar("agent_name", { length: 100 }),
    isRead: boolean("is_read").notNull().default(false),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_notifications_type").on(table.type),
    index("idx_notifications_is_read").on(table.isRead),
    index("idx_notifications_created_at").on(table.createdAt),
    index("idx_notifications_agent").on(table.agentName),
  ],
);

// ============================================================================
// RELATIONS
// ============================================================================

export const casesRelations = relations(cases, ({ one, many }) => ({
  feeRecord: one(feeRecords, {
    fields: [cases.clientId],
    references: [feeRecords.caseId],
  }),
  activityLogs: many(activityLog),
}));

export const feeRecordsRelations = relations(feeRecords, ({ one, many }) => ({
  case: one(cases, {
    fields: [feeRecords.caseId],
    references: [cases.clientId],
  }),
  activityLogs: many(activityLog),
}));

export const activityLogRelations = relations(activityLog, ({ one }) => ({
  case: one(cases, {
    fields: [activityLog.caseId],
    references: [cases.clientId],
  }),
  feeRecord: one(feeRecords, {
    fields: [activityLog.feeRecordId],
    references: [feeRecords.id],
  }),
}));
