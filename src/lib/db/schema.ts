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
  unique,
  uniqueIndex,
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
  "FEE_PETITION",
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
    // Loosened from pg enum to varchar so admins can manage the option list
    // via /settings → Dropdown Options without code changes. Legacy values
    // (T2/T16/T2_T16 and INITIAL/RECON/HEARING/AC/FEDERAL_COURT/FEE_PETITION)
    // are preserved verbatim; new values (CONC, FEE PETITION, DWB, etc.)
    // are accepted as-is. Display helpers in formatters.ts tolerate both.
    claimTypeLabel: varchar("claim_type_label", { length: 50 }),
    levelWon: varchar("level_won", { length: 50 }),
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

    // PDF-extracted fields (from Chronicle all_file parse)
    fullSsn: varchar("full_ssn", { length: 11 }),
    email: varchar("email", { length: 200 }),
    phone: varchar("phone", { length: 30 }),
    primaryDiagnosis: varchar("primary_diagnosis", { length: 200 }),
    primaryDiagnosisCode: varchar("primary_diagnosis_code", { length: 10 }),
    secondaryDiagnosis: varchar("secondary_diagnosis", { length: 200 }),
    secondaryDiagnosisCode: varchar("secondary_diagnosis_code", { length: 10 }),
    allegations: text("allegations"),
    blindDli: date("blind_dli"),
    firmName: varchar("firm_name", { length: 200 }),
    firmEin: varchar("firm_ein", { length: 12 }),
    hearingOffice: varchar("hearing_office", { length: 200 }),
    representatives: jsonb("representatives"),
    decisionHistory: jsonb("decision_history"),

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
    // Encrypted SSN
    ssnEncrypted: text("ssn_encrypted"),

    // Original case title from imported worksheet (e.g. "2026.03.24 Coronel, Angelica v. ALJ ...")
    caseLink: text("case_link"),

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
    // Loosened from pg enum to varchar — see note on claimTypeLabel above.
    winSheetStatus: varchar("win_sheet_status", { length: 50 }).default(
      "not_started",
    ),
    winSheetLink: text("win_sheet_link"),
    winSheetLinkText: varchar("win_sheet_link_text", { length: 200 }),
    caseStatus: varchar("case_status", { length: 100 }),
    feesConfirmation: varchar("fees_confirmation", { length: 50 }),
    feesClosedTrigger: varchar("fees_closed_trigger", { length: 50 }),
    dateAssignedToAgent: date("date_assigned_to_agent"),

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
    // True when an admin acknowledged the case as closed via the dashboard
    // (Approved By dropdown → confirm); these rows leave the active dashboard
    // and appear on /fees-closed.
    isClosed: boolean("is_closed").notNull().default(false),
    markedOverpaid: boolean("marked_overpaid").notNull().default(false),
    closedAt: timestamp("closed_at", { withTimezone: true }),

    // Fee Computation Metadata
    feeMethod: feeMethodEnum("fee_method").default("fee_agreement"),
    applicableFeeCap: decimal("applicable_fee_cap", {
      precision: 12,
      scale: 2,
    }).default("9200"),
    feeCapApplied: boolean("fee_cap_applied").default(false),
    feeComputed: boolean("fee_computed").default(false),
    feeComputedAt: timestamp("fee_computed_at", { withTimezone: true }),

    // Sheet-computed fields (synced from Google Sheets as-is)
    daysAfterApproval: integer("days_after_approval"),
    approvalCategory: varchar("approval_category", { length: 100 }),
    feesStatus: varchar("fees_status", { length: 100 }),
    weekAssignedToAgent: varchar("week_assigned_to_agent", { length: 50 }),
    monthAssignedToAgent: varchar("month_assigned_to_agent", { length: 50 }),

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
    index("idx_fee_records_is_closed").on(table.isClosed),
  ],
);

// ============================================================================
// FEE_PETITIONS — Workflow checklist for cases at FEE_PETITION level
// ============================================================================

export const feePetitions = pgTable(
  "fee_petitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: integer("case_id")
      .notNull()
      .references(() => cases.clientId, { onDelete: "cascade" })
      .unique(),

    // Filing checklist
    noa: boolean("noa").notNull().default(false),
    timeDelineation: boolean("time_delineation").notNull().default(false),
    feePetitionDoc: boolean("fee_petition_doc").notNull().default(false),
    ltrToClmt: boolean("ltr_to_clmt").notNull().default(false),
    ltrToClmtWithSignature: boolean("ltr_to_clmt_with_signature")
      .notNull()
      .default(false),
    ltrToAlj: boolean("ltr_to_alj").notNull().default(false),
    faxConfFeePet: boolean("fax_conf_fee_pet").notNull().default(false),

    // Inline note
    updateNote: text("update_note").notNull().default(""),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_fee_petitions_case_id").on(table.caseId)],
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
  team: varchar("team", { length: 20 }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ============================================================================
// DROPDOWN_OPTIONS — Admin-managed option lists for the worksheet's dropdown
// columns (Assigned To, Case Level, Claim Type, Win Sheet Status, Fees
// Confirmation, Case Status, Approved By). Managed in /settings → Dropdown
// Options. `category` keys the list; `name` is the displayed option.
// ============================================================================

export const dropdownOptions = pgTable(
  "dropdown_options",
  {
    id: serial("id").primaryKey(),
    category: varchar("category", { length: 50 }).notNull(),
    name: varchar("name", { length: 150 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_dropdown_options_category_name").on(
      table.category,
      table.name,
    ),
    index("idx_dropdown_options_category").on(table.category),
  ],
);

// Superseded by dropdown_options (category = 'approved_by'). Kept as an
// unused table so the migration is a clean create (no rename prompt); safe to
// drop in a later migration once confirmed empty.
export const approvedByOptions = pgTable("approved_by_options", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
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
    winSheetsCreated: integer("win_sheets_created").notNull().default(0),
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
// APP_SETTINGS — Key-value configuration store
// ============================================================================

export const appSettings = pgTable("app_settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: text("value").notNull(),
  label: varchar("label", { length: 200 }),
  category: varchar("category", { length: 50 }).notNull().default("general"),
  isSecret: boolean("is_secret").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

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
// USER_DETAILS
// ============================================================================

export const userDetails = pgTable(
  "user_details",
  {
    id: serial("id").primaryKey(),
    caseId: integer("case_id")
      .notNull()
      .unique()
      .references(() => cases.clientId, { onDelete: "cascade" }),
    chronicleId: integer("chronicle_id").unique(),

    fullName: varchar("full_name", { length: 255 }),
    addressLine1: varchar("address_line_1", { length: 255 }),
    addressLine2: varchar("address_line_2", { length: 255 }),
    city: varchar("city", { length: 255 }),
    state: varchar("state", { length: 100 }),
    zipCode: varchar("zip_code", { length: 50 }),
    country: varchar("country", { length: 100 }),

    cellPhone: varchar("cell_phone", { length: 100 }),
    email: varchar("email", { length: 255 }),
    ssn: varchar("ssn", { length: 50 }),
    ssnLast4: varchar("ssn_last4", { length: 4 }),

    dateOfBirth: date("date_of_birth"),
    ageAtApproval: integer("age_at_approval"),
    placeOfBirth: varchar("place_of_birth", { length: 255 }),
    mothersFirstNameAndMaidenName: varchar("mothers_first_name_and_maiden_name", { length: 255 }),
    fathersFirstAndLastName: varchar("fathers_first_and_last_name", { length: 255 }),

    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_user_details_case_id").on(table.caseId),
  ],
);

export const chronicleDocuments = pgTable(
  "chronicle_documents",
  {
    id: serial("id").primaryKey(),
    caseId: integer("case_id")
      .notNull()
      .references(() => cases.clientId, { onDelete: "cascade" }),
    mycaseClientId: integer("mycase_client_id"),
    chronicleClientId: integer("chronicle_client_id"),
    chronicleDocumentId: integer("chronicle_document_id").notNull(),
    documentName: varchar("document_name", { length: 500 }),
    documentType: varchar("document_type", { length: 255 }),
    documentCategory: varchar("document_category", { length: 255 }),
    rawDocument: jsonb("raw_document"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    unique("chronicle_documents_case_id_chronicle_document_id_unique").on(
      table.caseId,
      table.chronicleDocumentId,
    ),
    index("idx_chronicle_documents_case_id").on(table.caseId),
  ],
);

export const mycaseNoticeDocuments = pgTable(
  "mycase_notice_documents",
  {
    id: serial("id").primaryKey(),
    caseId: integer("case_id")
      .notNull()
      .references(() => cases.clientId, { onDelete: "cascade" }),
    mycaseClientId: integer("mycase_client_id"),
    mycaseDocumentId: integer("mycase_document_id").notNull(),
    documentName: varchar("document_name", { length: 500 }),
    matchedPattern: varchar("matched_pattern", { length: 255 }),
    rawDocument: jsonb("raw_document"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    unique("mycase_notice_documents_case_id_mycase_document_id_unique").on(
      table.caseId,
      table.mycaseDocumentId,
    ),
    index("idx_mycase_notice_documents_case_id").on(table.caseId),
  ],
);

// ============================================================================
// OVERPAID_CASES — Workflow tracking for cases where fees paid > fees expected
// ============================================================================

export const overpaidCases = pgTable(
  "overpaid_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: integer("case_id")
      .notNull()
      .references(() => cases.clientId, { onDelete: "cascade" })
      .unique(),
    opLtrDate: date("op_ltr_date"),
    opLtrReceived: date("op_ltr_received"),
    overpaidAmount: decimal("overpaid_amount", { precision: 12, scale: 2 }),
    checksCleared: boolean("checks_cleared").notNull().default(false),
    checksClearedAt: timestamp("checks_cleared_at", { withTimezone: true }),
    updateNote: text("update_note").notNull().default(""),
    region: varchar("region", { length: 100 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_overpaid_cases_case_id").on(table.caseId)],
);

// ============================================================================
// USERS — Authentication (Auth.js credentials)
// ============================================================================

export const userRoleEnum = pgEnum("user_role_enum", [
  "admin",
  "lead",
  "member",
  "system_admin",
]);

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    name: varchar("name", { length: 255 }),
    passwordHash: text("password_hash").notNull(),
    role: userRoleEnum("role").notNull().default("member"),
    isActive: boolean("is_active").notNull().default(true),
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_users_email").on(table.email)],
);

// Per-user access overrides — stores ONLY deviations from the user's role
// default (see src/lib/access). `overrides` is { pages?: { [pageKey]: bool } }
// today; a `fields` map will be added in Phase 2.
export const userAccessOverrides = pgTable("user_access_overrides", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  overrides: jsonb("overrides").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Audit trail of admin actions (user create, role/active changes, password
// resets, access-override edits). Actor/target ids use ON DELETE SET NULL and
// we snapshot emails so the log stays readable even after an account is
// removed. `metadata` holds optional structured detail (e.g. role from→to).
export const adminActivityLog = pgTable(
  "admin_activity_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: integer("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    actorEmail: varchar("actor_email", { length: 255 }),
    action: varchar("action", { length: 50 }).notNull(),
    targetUserId: integer("target_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    targetEmail: varchar("target_email", { length: 255 }),
    summary: text("summary").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_admin_activity_created_at").on(table.createdAt)],
);

// ============================================================================
// RELATIONS
// ============================================================================

export const casesRelations = relations(cases, ({ one, many }) => ({
  feeRecord: one(feeRecords, {
    fields: [cases.clientId],
    references: [feeRecords.caseId],
  }),
  feePetition: one(feePetitions, {
    fields: [cases.clientId],
    references: [feePetitions.caseId],
  }),
  activityLogs: many(activityLog),
  userDetails: one(userDetails, {
    fields: [cases.clientId],
    references: [userDetails.caseId],
  }),
}));

export const userDetailsRelations = relations(userDetails, ({ one }) => ({
  case: one(cases, {
    fields: [userDetails.caseId],
    references: [cases.clientId],
  }),
}));

export const feePetitionsRelations = relations(feePetitions, ({ one }) => ({
  case: one(cases, {
    fields: [feePetitions.caseId],
    references: [cases.clientId],
  }),
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

// ============================================================================
// MyCase sync tags — tracks cases that have been reviewed but not synced
// ============================================================================
export const myCaseSyncTags = pgTable("mycase_sync_tags", {
  myCaseCaseId: integer("mycase_case_id").primaryKey(),
  tag: varchar("tag", { length: 50 }).notNull().default("viewed"),
  taggedAt: timestamp("tagged_at", { withTimezone: true }).notNull().defaultNow(),
  taggedBy: varchar("tagged_by", { length: 255 }),
});

// ============================================================================
// INBOUND_CALL_POC — Weekly point-of-contact assignments per day (Mon–Fri)
// ============================================================================

export const inboundCallPoc = pgTable(
  "inbound_call_poc",
  {
    id: serial("id").primaryKey(),
    weekStart: date("week_start").notNull(), // Monday of the week (YYYY-MM-DD)
    dayOfWeek: integer("day_of_week").notNull(), // 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri
    pocName: varchar("poc_name", { length: 200 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("uq_inbound_call_poc_week_day_name").on(
      table.weekStart,
      table.dayOfWeek,
      table.pocName,
    ),
    index("idx_inbound_call_poc_week").on(table.weekStart),
  ],
);

// ============================================================================
// INBOUND_CALL_RECORDS — Call history log
// ============================================================================

export const inboundCallRecords = pgTable(
  "inbound_call_records",
  {
    id: serial("id").primaryKey(),
    weekStart: date("week_start").notNull(), // for week-based filtering
    callDate: date("call_date").notNull(),
    number: varchar("number", { length: 50 }),
    transcript: text("transcript"),
    caseLink: varchar("case_link", { length: 500 }),
    specialistAssigned: varchar("specialist_assigned", { length: 200 }),
    calledBackResolved: boolean("called_back_resolved").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_inbound_call_records_week").on(table.weekStart),
    index("idx_inbound_call_records_date").on(table.callDate),
  ],
);

// ============================================================================
// Case archive — records moved out of cases/fee_records when they are missing
// from the sheet reconciliation (active or fees-closed).
// No FK on originalClientId — the source row is deleted on archive.
// ============================================================================
export const archivedSourceEnum = pgEnum("archived_source_enum", [
  "active_sheet",
  "fees_closed_sheet",
]);

export const caseArchive = pgTable(
  "case_archive",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    originalClientId: integer("original_client_id").notNull(),
    caseName: varchar("case_name", { length: 200 }),
    caseLink: text("case_link"),
    approvalDate: date("approval_date"),
    archivedSource: archivedSourceEnum("archived_source").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }).notNull().defaultNow(),
    archivedBy: varchar("archived_by", { length: 100 }),
    caseSnapshot: jsonb("case_snapshot").notNull(),
    feeRecordSnapshot: jsonb("fee_record_snapshot"),
    relatedSnapshots: jsonb("related_snapshots"),
  },
  (t) => [
    index("idx_case_archive_client_id").on(t.originalClientId),
    index("idx_case_archive_source").on(t.archivedSource),
    index("idx_case_archive_archived_at").on(t.archivedAt),
  ],
);
