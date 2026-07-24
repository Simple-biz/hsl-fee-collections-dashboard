#!/usr/bin/env python3
"""Generate HSL Fee Collections Dashboard — Sprint / Epic Task Report PDF."""

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether,
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
import os

OUTPUT = os.path.join(os.path.dirname(__file__), "..", "HSL_Fee_Dashboard_Sprint_Report.pdf")

# ── colours ──────────────────────────────────────────────────────────────────
SIMPLE_BLUE   = HexColor("#1E40AF")
SIMPLE_LIGHT  = HexColor("#EFF6FF")
EPIC_BG       = HexColor("#FEF3C7")   # amber-100
EPIC_BADGE    = HexColor("#D97706")   # amber-600
SPRINT_BG     = HexColor("#F0FDF4")   # green-50
SPRINT_BADGE  = HexColor("#16A34A")   # green-600
HEADER_BG     = HexColor("#1E3A5F")
ROW_ALT       = HexColor("#F8FAFC")
BORDER        = HexColor("#CBD5E1")
GRAY_TEXT     = HexColor("#64748B")
DARK          = HexColor("#0F172A")
RED_BADGE     = HexColor("#DC2626")

# ── story-point reference (fibonacci — standard agile) ────────────────────────
# SP ≥ 8 → Epic   |   SP < 8 → Sprint Task
SP_SCALE = {
    1: "Trivial — a label, colour, or one-line tweak",
    2: "Very small — simple UI change, rename, or minor fix",
    3: "Small — single focused feature or targeted fix",
    5: "Medium — moderate feature with clear scope",
    8: "Complex — significant feature, multiple components (EPIC threshold)",
    13: "Large — major system feature spanning several files/routes",
}

# ── task data ─────────────────────────────────────────────────────────────────
# Format: (id, title, pr_refs, sp, ship_date, monday_linked)
# monday_linked = True only for the 2 tasks formally tracked on Monday.com
TASKS = [
    # ── Phase 1: Foundation (Feb–Apr 2026) ──
    ("EP-01", "Project Foundation & Core Infrastructure",
     "#1, #2 + initial commit",
     13, "2026-04-30",
     "Next.js 16 / App Router bootstrap, Neon PostgreSQL, Drizzle ORM schema, NextAuth v5 skeleton, "
     "first deployment to Vercel."),

    # ── Phase 2: Core Pages (May 2026) ──
    ("ST-01", "Case Import Modal",
     "#3, #4",
     5, "2026-05-05",
     "Drag-and-drop CSV/XLSX import flow with column-mapping and validation."),

    ("ST-02", "Google Sheets Sync Modal",
     "#6, #7",
     5, "2026-05-07",
     "Sheet-range picker + live preview sync modal to pull case data from Google Sheets."),

    ("ST-03", "Fee Petitions Page (initial)",
     "#8",
     5, "2026-05-21",
     "First version of the Fee Petitions page: table, status badges, and basic filter."),

    ("ST-04", "Overpaid Cases Page (initial)",
     "#9",
     3, "2026-05-21",
     "Initial Overpaid Cases list with manual flag and clear actions."),

    ("EP-02", "Authentication System & Admin Panel",
     "#10, #13",
     8, "2026-05-21",
     "NextAuth Credentials provider, JWT sessions, bcrypt, role-gated route middleware, "
     "and the first Admin panel for user management."),

    ("ST-05", "Dashboard Table Load-Time Optimisation",
     "#14",
     3, "2026-05-22",
     "Pagination, debounced search, and query-key narrowing to cut initial load time."),

    ("EP-03", "MyCase View + Fees Closed Workflow + Worksheet Dropdowns",
     "#17, #18",
     8, "2026-05-27",
     "MyCase iframe/link panel, Fees Closed status workflow, and editable worksheet dropdowns "
     "sourced from the Settings page."),

    ("ST-06", "Mobile Responsiveness & Header Fix",
     "#19, #20",
     3, "2026-05-27",
     "Responsive sidebar, header z-index fix, and touch-target sizing pass."),

    ("EP-04", "Sheets Sync/Push + Full Auth + Fee Petitions + Admin Panel (v2)",
     "#16",
     13, "2026-06-01",
     "Batch upsert sync from Sheets, push-to-sheets (later removed in PR #92), "
     "role defaults (member/lead/admin/system_admin), fee petitions pipeline, and admin CRUD."),

    # ── Phase 3: Integrations (Jun 2026) ──
    ("ST-07", "Welcome Email on New User Creation",
     "#27",
     5, "2026-06-09",
     "n8n webhook trigger that sends a personalised welcome email when an admin creates a new user."),

    ("ST-08", "Overpaid Cases v2 — Columns, Manual Flag, Batch Actions",
     "#30",
     5, "2026-06-09",
     "Added overpaid-amount, notice-sent, and checks-cleared columns; batch Mark/Clear actions."),

    ("ST-09", "Table Pagination",
     "#38",
     3, "2026-06-09",
     "Server-side pagination across all major tables; page-size selector."),

    ("EP-05", "MyCase Sync + Win Sheet Quick Look + Case Tagging",
     "#37",
     8, "2026-06-11",
     "Bidirectional MyCase mirror sync (MYCASE_DB_URL read-only), Win Sheet slide-out panel, "
     "and case-level tagging."),

    ("EP-06", "Admin Panel v3 — RBAC, Role Access Overrides, Add Case",
     "#44, #45",
     8, "2026-06-12",
     "Per-user page-access overrides persisted in JWT, add-case admin action, "
     "and role-default page registry."),

    ("ST-10", "Notes Modal — Edit & Create",
     "#50",
     3, "2026-06-16",
     "Rich-text notes modal with optimistic UI, timestamps, and author attribution."),

    ("ST-11", "Case-Name MyCase Link + Chronicle Sub-line",
     "#51",
     2, "2026-06-16",
     "Case name cells now open MyCase; a secondary line shows claim type and Chronicle ID."),

    ("ST-12", "Case Detail Text Selection",
     "#54",
     1, "2026-06-16",
     "Made all text in the case detail slide-over user-selectable for copy-paste."),

    ("ST-13", "Admin Activity Logs — Audit & Case Activity Feed",
     "#59, #61",
     5, "2026-06-16",
     "Admin-only audit log table (user actions) + per-case activity feed with user/date filters."),

    ("EP-07", "Case Archive Table & Archive Flow",
     "#56",
     8, "2026-06-17",
     "Migration 0020: archive table with JSONB snapshots; archive flow for cases missing from "
     "the active sheet sync; admin-only archive page."),

    ("ST-14", "Scoreboard — Month/Range Date Views & Monitoring Filters",
     "#64",
     3, "2026-06-17",
     "Extended the scoreboard date picker with month and custom-range modes, plus a team filter."),

    ("EP-08", "Team Daily Tracking — Scoreboard Team Cards & Win Sheets",
     "#67",
     8, "2026-06-25",
     "Per-team win-sheet tracker, daily metrics table, team-card scorecards, "
     "and the team-assignment UI in Admin settings."),

    ("ST-15", "Fee Petitions — Bulk Close to Fees Closed",
     "#69",
     5, "2026-06-25",
     "Multi-select checkboxes + Bulk Close action that marks petitions complete "
     "and moves them to Fees Closed."),

    ("ST-16", "Fees Closed — Editable Worksheet Fields",
     "#70",
     3, "2026-06-25",
     "Inline editing for Closed On, Remarks, and Win-Sheet status directly in the Fees Closed table."),

    ("ST-17", "Settings — Dropdown Option Reordering",
     "#72",
     3, "2026-06-25",
     "Drag-to-reorder for all admin-managed dropdown lists (Remarks, Win-Sheet Status, etc.)."),

    ("EP-09", "Master Fees Page",
     "#75",
     8, "2026-06-25",
     "New Master Fees page: grouped T16/T2/AUX column headers, frozen Case Name column, "
     "inline fee editing, Fees Confirmation badge, and PIF workflow (renamed to PIF in PR #170)."),

    ("ST-18", "Overview Restructure — Scoreboard Summary + Recent Activity",
     "#77, #78",
     5, "2026-06-25",
     "Moved agent tracking to Reports; overview shows a scoreboard summary and recent-activity feed."),

    ("EP-10", "Reports Page Overhaul — Tracker, Agent Tracking, Activity",
     "#79, #87, #88",
     13, "2026-06-26",
     "Full rewrite of the Reports page: tracker table with 60/90-day toggle, daily agent-tracking "
     "rows, per-agent fee stats, recent-activity tab, and inbound-call counts."),

    ("EP-11", "Inbound Calls Page + Sidebar Reorganisation + Nav Overhaul",
     "#84",
     8, "2026-06-26",
     "Brand-new Inbound Calls page (log, history, search) integrated with the daily call-log "
     "workflow; sidebar reordered; breadcrumb nav introduced."),

    ("ST-19", "Fee Petitions — Filters, Fee Amount Column, Aging Filter",
     "#80, #82, #83",
     5, "2026-06-26",
     "Added fee-amount column, unpaid-aging filter, and audit-logs tab to fee petitions."),

    ("ST-20", "Scoreboard Week Navigation",
     "#86",
     3, "2026-06-26",
     "Previous/next week arrows so team leads can review past weekly scoreboards."),

    ("ST-21", "Fees Closed — Checkbox, Win-Sheet Link Editing, Nav Fixes",
     "#94",
     3, "2026-06-28",
     "Fees-closed checkbox on the master list, editable Win-Sheet URL in case detail, "
     "and sidebar link ordering fixes."),

    ("EP-12", "CSV Import — Fee Petitions, Overpaid Cases, Scoreboard, Inbound Calls",
     "#96",
     13, "2026-06-28",
     "Universal CSV/XLSX bulk-import flow with column-mapper, validation, duplicate detection, "
     "and support for all four data types. Gotchas handled: markedOverpaid flag, MyCase title "
     "resolver, blank/footer-row skipping, defaultHeaderRow=2 for inbound calls."),

    ("EP-13", "Fee Payment History + MTD Stats",
     "#98",
     8, "2026-06-29",
     "Per-case payment-history log, month-to-date fees-collected stat card on the overview, "
     "and fee-source breakdown in Reports."),

    ("ST-22", "MyCase Sync — URL Inputs for Missing Links",
     "#100",
     3, "2026-06-29",
     "Sync modal now surfaces cases missing a MyCase URL and lets the admin paste them inline."),

    ("EP-14", "Agent Tracking Overhaul — Fax Sent, Open/Closed Case Counts, Fees Status",
     "#107, #108, #109, #110",
     13, "2026-06-30",
     "Fax Sent column, per-agent open/closed case counts, fees-status breakdown pie in the "
     "agent-tracking table, and approver-dropdown toolbar filter on Master Fees."),

    ("ST-23", "Fees.edit Capability + Inline Fee Editing + Fees Conf Badge",
     "#104",
     5, "2026-06-30",
     "New fees.edit JWT capability; inline T16/T2/AUX amount editing in Master Fees; "
     "Fees Confirmation dropdown badge."),

    ("ST-24", "Completed Petitions — Fee Requested/Received Columns",
     "#103",
     2, "2026-06-30",
     "Added Fees Requested and Fees Received columns to the Completed Petitions sub-table."),

    # ── Phase 4: Feature Depth (Jul 2026) ──
    ("EP-15", "No Fees Cases Tab + New Cases Tab + Fee Petition Totals",
     "#112",
     13, "2026-07-01",
     "Two new Report sub-tabs: No Fees Cases (cases with fee due but $0 received) "
     "and New Cases (cases added in the current week). Fee petition aggregate totals "
     "bar and manual add-case on Overpaid Cases."),

    ("ST-25", "Team Lead Role — Scoreboard & Agent Tracking Exclusion",
     "#115",
     5, "2026-07-01",
     "New team_lead role (Georgia, DeeAnn): excluded from per-agent scoreboard rows "
     "but still counted in team financial rollups."),

    ("ST-26", "Overpaid Cases — Pending / Cleared Split",
     "#120",
     5, "2026-07-01",
     "Split the Overpaid Cases page into two sections: Pending and Cleared, "
     "each with its own stat card and sort."),

    ("ST-27", "Expandable Note Fields",
     "#118",
     3, "2026-07-01",
     "Shared NoteField component: click to expand to a multi-line textarea, "
     "replacing three duplicate single-line inputs across Fee Petitions, "
     "Completed Petitions, and Overpaid Cases."),

    ("ST-28", "Dashboard Colour Coding — Teams, Agents, Dropdowns",
     "#130",
     5, "2026-07-02",
     "Deterministic colour palette for agent badges and team labels across "
     "all tables and dropdowns for at-a-glance identification."),

    ("EP-16", "Fee Due / Pending Auto-Calculation + Overpaid Automation",
     "#136, #140",
     8, "2026-07-02",
     "Fee Due and Pending become auto-calculated from received amounts but remain "
     "manually overridable; Fees Confirmation = Overpaid automatically flags the case."),

    ("ST-29", "Leader-Only Notes Thread + Remarks Quick-Filter",
     "#152, #154",
     5, "2026-07-03",
     "Separate leader-only notes thread (hidden from member view) in case detail; "
     "Remarks quick-filter dropdown in Master Fees toolbar."),

    ("ST-30", "App-Wide Text Size Increase for Readability",
     "#168",
     2, "2026-07-04",
     "Global Tailwind font-size bump across all tables and form controls."),

    ("EP-17", "PIF System — Auto-Set, Fees Conf Rename, Claim-Type Logic",
     "#170, #172, #174, #176",
     13, "2026-07-06",
     "Full PIF (Paid-in-Full) overhaul: renamed Fees Confirmation → PIF; "
     "DB trigger auto-sets PIF from T16/T2/AUX amounts per claim type; "
     "normalized CONCURRENT → CONC claim type to fix 22-case filter breakage; "
     "scrollable access-overrides modal; backfill dry-run on 715 cases."),

    ("ST-31", "Notes — Agent Edit/Delete Own Notes",
     "#180",
     3, "2026-07-06",
     "Agents can now edit or soft-delete their own case log entries within a session."),

    ("ST-32", "Fee Petitions — Assigned To Column + Filter",
     "#182, #183, #188",
     5, "2026-07-07",
     "Assigned To column on Fee Petitions and Completed Petitions; "
     "Assigned To filter in the toolbar; PIF auto-calculation via Fee Due vs Received."),

    ("ST-33", "Overpaid Cases — Dismiss, Remove, Add Case, Clear Fee Due",
     "#186, #187, #194",
     5, "2026-07-08",
     "Dismiss without touching PIF; restore manual Add Case; allow clearing Fee Due → null."),

    ("ST-34", "Master Fees — Per-Row Refresh Button",
     "#192",
     3, "2026-07-07",
     "Individual refresh icon per row in Master Fees that re-fetches only that case."),

    ("ST-35", "Master Fees — Next Follow-Up Call Date with Due-Today Alerts",
     "#205",
     5, "2026-07-08",
     "Date-picker column for scheduling the next follow-up call; "
     "rows due today are highlighted; date is cleared when a case goes Fees Closed."),

    ("ST-36", "Master Fees — T16/T2/AUX Column-Group Minimize/Expand",
     "#209",
     5, "2026-07-09",
     "Toggle to collapse each fee-type column group, keeping the payment panel mounted."),

    ("ST-37", "Agent Tracking — Fees Collected Window (Day/Week/Month/Range)",
     "#213",
     5, "2026-07-09",
     "Date-range selector on Agent Tracking that windows the Fees Collected figure "
     "by day, week, month, or a custom range."),

    ("ST-38", "Scoreboard — Top-Scorer Trophy Indicator",
     "#215",
     2, "2026-07-09",
     "🏆 trophy next to the top scorer in each week column on the Scoreboard."),

    ("ST-39", "Reports — Daily Call Log Autosave",
     "#216",
     3, "2026-07-09",
     "Daily call log edits flush automatically on blur or unmount instead of requiring a manual save."),

    ("ST-40", "Fee Petition Approved Column Synced with Master Fees Remarks",
     "#217",
     3, "2026-07-09",
     "Fee Petitions table now shows a Fee Petition Approved column derived from the "
     "Remarks field in Master Fees (bidirectional sync)."),

    ("EP-18", "Admin Data Backup Export & Restore",
     "#223",
     13, "2026-07-10",
     "Admin-only page: full-database JSON export (all tables), DR-mirror split download, "
     "and point-in-time restore with confirmation guard. "
     "Two audit-fix rounds before merge."),

    ("EP-19", "Full Security Audit — Auth Gaps, PII Leak, SQL Injection",
     "#229, #231, #235, #239, #241, #242, #243, #254, #258",
     13, "2026-07-10 – 2026-07-13",
     "Closed auth gaps on 8 API routes; eliminated raw SQL interpolation in chronicle/import; "
     "fixed PII-read leak in case-detail endpoint; Zod body validation on team-members POST/PATCH; "
     "AbortController cleanup on case-detail handlers; admin/archive/settings pages now "
     "non-overridable for non-admin roles."),

    ("ST-41", "Overpaid Cases — Manual Marking + Batch Mark Action",
     "#246, #248",
     5, "2026-07-11",
     "Removed auto-flag on PIF change; added manual Mark as Overpaid per-case and "
     "a Batch Mark action for multi-select."),

    ("ST-42", "Master Fees — Win Sheet Link Replaces Chronicle Link",
     "#261",
     3, "2026-07-13",
     "Case-name cell now links to the Win Sheet; Approved By and Remarks columns "
     "relocated adjacent to Win Sheet for logical grouping."),

    ("ST-43", "Master Fees — Bulk Fees Closed Batch Action",
     "#263",
     5, "2026-07-14",
     "Multi-select + Bulk Close action moves cases from Master Fees to Fees Closed "
     "in one operation with throttled concurrent PATCHes."),

    ("ST-44", "Master Fees — Case Status Collapsible Column Group",
     "#265",
     3, "2026-07-14",
     "Case Status columns (Win Sheet, Remarks, Approved By) grouped under a "
     "collapsible header with a left border spanning the full table height."),

    ("ST-45", "Reports — No Fees Case Level Column + Fee Petition Level Highlight",
     "#267, #269, #302",
     5, "2026-07-14 – 2026-07-17",
     "Case Level column added to No Fees Cases sub-table; Fee Petition level cells "
     "highlighted red in the No Fees Cases view."),

    ("ST-46", "Fee Petitions — Refresh Button + Per-Row Refresh",
     "#270, #272",
     3, "2026-07-14",
     "Global refresh button in the Fee Petitions toolbar; per-row refresh icon "
     "scoped to Fee Petition cases with unsaved-draft preservation."),

    ("ST-47", "Fee Petition Approved — Gates Completed Petitions",
     "#278",
     5, "2026-07-15",
     "Completion logic changed: status=complete now requires Fee Petition Approved "
     "rather than just checklist + fees received."),

    ("ST-48", "Fee Petitions — Notes/Logs Panel + Next Follow-Up Date",
     "#283",
     5, "2026-07-15",
     "Slide-out notes/logs panel on Fee Petitions rows; next follow-up date picker "
     "matching the Master Fees pattern."),

    ("EP-20", "Notifications Overhaul — Payments Tab, Missed Calls Rename, Closed Cases Tab",
     "#285, #289, #296, #312, #314, #343",
     8, "2026-07-15 – 2026-07-23",
     "New Payments tab (agent-scoped fee payments); renamed Missed Calls; "
     "Closed Cases notifications tab; Fee Petition Approved tab; "
     "Calls Backlog tab with per-day inbound call counts."),

    ("ST-49", "Reports — Fee Petition Agents + Inbound Call History Enhancements",
     "#294, #296",
     5, "2026-07-16",
     "Per-agent fee petition counts in Reports; inbound call history column renames, "
     "MyCase link column, and sort options."),

    ("EP-21", "Copy-Paste Suite — Selectable Amounts, Scoreboard/Reports Rows, Format Buttons",
     "#306, #308, #310, #336, #338, #340",
     8, "2026-07-17 – 2026-07-23",
     "Fee amount cells user-selectable; scoreboard and reports numbers selectable; "
     "copy-row button per agent row; one-click export as Google Sheets (TSV), "
     "Chat (monospace block), or Teams (HTML table) for all notification tabs."),

    ("ST-50", "URL-Persistent Filters + Clickable Stat Cards",
     "#328, #329",
     5, "2026-07-21",
     "Filters, sort, and search state persisted in URL query-params on Master Fees "
     "and Fees Closed; Total Cases and Cases Closed (MTD) stat cards are clickable drill-downs."),

    ("EP-22", "Bulk Reassign Cases + Saved Filter Presets",
     "#332",
     8, "2026-07-21",
     "Multi-select bulk-reassign workflow with confirmation dialog; "
     "named filter presets that persist per-user across sessions."),

    ("ST-51", "Sync Modal — Empty State Guidance + Step Progress",
     "#334",
     3, "2026-07-21",
     "Empty-state help text when no cases are loaded; a step-progress indicator "
     "during the sync operation."),

    ("ST-52", "Resources Page — Admin-Managed Important Links",
     "#347",
     5, "2026-07-22",
     "New Resources page accessible by all roles; admins can add/edit/remove "
     "links (title + URL) from the Admin panel."),

    ("ST-53", "Admin Users — Last Activity Column",
     "#345",
     2, "2026-07-22",
     "Last-seen timestamp column on the Admin Users table showing the most "
     "recent session for each user."),

    ("ST-54", "App Rename — Fee Collections → Collections Dashboard",
     "#348",
     1, "2026-07-22",
     "Updated the app title, tab title, and sidebar branding string."),

    ("EP-23", "Capability-Gated Feature Access — PIF & Fees.edit Restrictions",
     "#351, #352",
     8, "2026-07-23",
     "fees.edit capability restricted to a single admin via per-user JWT override; "
     "feesConfirmation.edit (PIF) restricted to per-user override only (no role default). "
     "Capability-test assertions updated."),

    ("ST-55", "Overpaid Cases — Notice Sent Sort + Total Stat Accuracy Fixes",
     "#356, #357, #358, #359",
     5, "2026-07-23 – 2026-07-24",
     "Sort by Notice Sent date; cleared cases excluded from total overpaid stat; "
     "page subtotal excludes cleared; manually entered overpaidAmount used for stat card total."),

    ("ST-56", "Export Open Cases to CSV",
     "#353",
     3, "2026-07-23",
     "One-click Export CSV button on the Open Cases reconciliation view; "
     "correct total-field formatting and AbortController cleanup."),

    ("ST-57", "Agent Tracking — Default to Day View + Refresh Button",
     "#360, #361",
     3, "2026-07-24",
     "Agent Tracking tab now defaults to the Day view on load; "
     "a Refresh button in the header reloads the data without a full page reload."),

    # Monday.com formally tracked tasks
    ("ST-M1", "Case List Puller",
     "#24 [Monday Sprint Task]",
     3, "2026-06-01",
     "Formally tracked on Monday.com (Sprint Tasks board, task #12504474453). "
     "Owned by Cob Bautista. Scheduled for backlog. "
     "Pulls an up-to-date case list for downstream sync workflows."),

    ("ST-M2", "Case Type Bar Chart",
     "#23 [Monday Sprint Task]",
     2, "2026-06-01",
     "Formally tracked on Monday.com (Sprint Tasks board, task #12504548920). "
     "Owned by Kentshin. Scheduled for backlog. "
     "Bar chart breaking down open cases by claim type on the Reports page."),
]

EPICS  = [(t[0], t[1], t[2], t[3], t[4], t[5]) for t in TASKS if t[3] >= 8]
SPRINT = [(t[0], t[1], t[2], t[3], t[4], t[5]) for t in TASKS if t[3] < 8]


def build_pdf(output_path: str) -> None:
    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=18*mm, rightMargin=18*mm,
        topMargin=22*mm, bottomMargin=22*mm,
        title="HSL Fee Collections Dashboard — Sprint / Epic Task Report",
        author="Simple.biz",
    )

    styles = getSampleStyleSheet()
    W = A4[0] - 36*mm   # usable width

    # ── custom styles ─────────────────────────────────────────────────────────
    h1 = ParagraphStyle("h1", parent=styles["Normal"],
                        fontSize=22, textColor=white, leading=28, spaceAfter=4)
    h2 = ParagraphStyle("h2", parent=styles["Normal"],
                        fontSize=14, textColor=SIMPLE_BLUE, leading=20,
                        spaceBefore=14, spaceAfter=6, fontName="Helvetica-Bold")
    h3 = ParagraphStyle("h3", parent=styles["Normal"],
                        fontSize=11, textColor=DARK, leading=15,
                        spaceBefore=6, spaceAfter=3, fontName="Helvetica-Bold")
    body = ParagraphStyle("body", parent=styles["Normal"],
                          fontSize=8.5, textColor=GRAY_TEXT, leading=12, spaceAfter=2)
    meta = ParagraphStyle("meta", parent=styles["Normal"],
                          fontSize=7.5, textColor=GRAY_TEXT, leading=10)
    badge_epic = ParagraphStyle("badge_epic", parent=styles["Normal"],
                                fontSize=8, textColor=white, leading=10,
                                fontName="Helvetica-Bold")
    badge_sprint = ParagraphStyle("badge_sprint", parent=styles["Normal"],
                                  fontSize=8, textColor=white, leading=10,
                                  fontName="Helvetica-Bold")
    small_center = ParagraphStyle("small_center", parent=styles["Normal"],
                                  fontSize=7.5, textColor=GRAY_TEXT,
                                  alignment=TA_CENTER, leading=10)
    toc_style = ParagraphStyle("toc", parent=styles["Normal"],
                               fontSize=8.5, textColor=DARK, leading=13)

    story = []

    # ── Cover Banner ──────────────────────────────────────────────────────────
    cover_data = [[
        Paragraph("<b>HSL Fee Collections Dashboard</b><br/>"
                  "<font size='14'>Sprint &amp; Epic Task Report</font>", h1),
        Paragraph(
            "<font color='#93C5FD'>Project:</font> HSL Collection Team Dashboard<br/>"
            "<font color='#93C5FD'>Client:</font> Hogan Smith Law<br/>"
            "<font color='#93C5FD'>Lead:</font> Kentshin Wagai<br/>"
            "<font color='#93C5FD'>Status:</font> Live — On Track<br/>"
            "<font color='#93C5FD'>Report Date:</font> 2026-07-25",
            ParagraphStyle("cover_right", parent=styles["Normal"],
                           fontSize=9, textColor=white, leading=14,
                           alignment=TA_RIGHT)
        ),
    ]]
    cover_table = Table(cover_data, colWidths=[W * 0.6, W * 0.4])
    cover_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), HEADER_BG),
        ("TOPPADDING",    (0, 0), (-1, -1), 14),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
        ("LEFTPADDING",   (0, 0), (-1, -1), 14),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 14),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROUNDEDCORNERS", [6]),
    ]))
    story.append(cover_table)
    story.append(Spacer(1, 10))

    # ── Summary Stats ─────────────────────────────────────────────────────────
    total_sp = sum(t[3] for t in TASKS)
    stats_data = [
        [Paragraph("<b>Total Tasks</b>", ParagraphStyle("st", parent=styles["Normal"],
                   fontSize=9, fontName="Helvetica-Bold", textColor=DARK, alignment=TA_CENTER)),
         Paragraph("<b>Epics</b><br/><font size='7'>(SP ≥ 8)</font>",
                   ParagraphStyle("st", parent=styles["Normal"],
                                  fontSize=9, fontName="Helvetica-Bold",
                                  textColor=DARK, alignment=TA_CENTER)),
         Paragraph("<b>Sprint Tasks</b><br/><font size='7'>(SP &lt; 8)</font>",
                   ParagraphStyle("st", parent=styles["Normal"],
                                  fontSize=9, fontName="Helvetica-Bold",
                                  textColor=DARK, alignment=TA_CENTER)),
         Paragraph("<b>Total Story Points</b>",
                   ParagraphStyle("st", parent=styles["Normal"],
                                  fontSize=9, fontName="Helvetica-Bold",
                                  textColor=DARK, alignment=TA_CENTER)),
         Paragraph("<b>Monday.com<br/>Tracked</b>",
                   ParagraphStyle("st", parent=styles["Normal"],
                                  fontSize=9, fontName="Helvetica-Bold",
                                  textColor=DARK, alignment=TA_CENTER)),
        ],
        [
            Paragraph(f"<b><font size='18'>{len(TASKS)}</font></b>",
                      ParagraphStyle("sn", parent=styles["Normal"],
                                     fontSize=18, fontName="Helvetica-Bold",
                                     textColor=SIMPLE_BLUE, alignment=TA_CENTER)),
            Paragraph(f"<b><font size='18'>{len(EPICS)}</font></b>",
                      ParagraphStyle("sn", parent=styles["Normal"],
                                     fontSize=18, fontName="Helvetica-Bold",
                                     textColor=EPIC_BADGE, alignment=TA_CENTER)),
            Paragraph(f"<b><font size='18'>{len(SPRINT)}</font></b>",
                      ParagraphStyle("sn", parent=styles["Normal"],
                                     fontSize=18, fontName="Helvetica-Bold",
                                     textColor=SPRINT_BADGE, alignment=TA_CENTER)),
            Paragraph(f"<b><font size='18'>{total_sp}</font></b>",
                      ParagraphStyle("sn", parent=styles["Normal"],
                                     fontSize=18, fontName="Helvetica-Bold",
                                     textColor=SIMPLE_BLUE, alignment=TA_CENTER)),
            Paragraph("<b><font size='18'>2</font></b>",
                      ParagraphStyle("sn", parent=styles["Normal"],
                                     fontSize=18, fontName="Helvetica-Bold",
                                     textColor=SIMPLE_BLUE, alignment=TA_CENTER)),
        ],
    ]
    stats_table = Table(stats_data, colWidths=[W/5]*5)
    stats_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), SIMPLE_LIGHT),
        ("BACKGROUND", (0, 1), (-1, 1), white),
        ("BOX",        (0, 0), (-1, -1), 0.5, BORDER),
        ("INNERGRID",  (0, 0), (-1, -1), 0.5, BORDER),
        ("TOPPADDING",    (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROUNDEDCORNERS", [4]),
    ]))
    story.append(stats_table)
    story.append(Spacer(1, 8))

    # ── Story Points Legend ───────────────────────────────────────────────────
    story.append(Paragraph("Story Point Scale Reference", h2))
    legend_header = [
        Paragraph("<b>SP</b>", ParagraphStyle("lh", parent=styles["Normal"],
                  fontSize=8, fontName="Helvetica-Bold", textColor=white,
                  alignment=TA_CENTER)),
        Paragraph("<b>Classification</b>", ParagraphStyle("lh", parent=styles["Normal"],
                  fontSize=8, fontName="Helvetica-Bold", textColor=white)),
        Paragraph("<b>Description</b>", ParagraphStyle("lh", parent=styles["Normal"],
                  fontSize=8, fontName="Helvetica-Bold", textColor=white)),
    ]
    legend_rows = [legend_header]
    for sp, desc in SP_SCALE.items():
        cat = "EPIC" if sp >= 8 else "Sprint Task"
        cat_col = EPIC_BADGE if sp >= 8 else SPRINT_BADGE
        legend_rows.append([
            Paragraph(f"<b>{sp}</b>", ParagraphStyle("lv", parent=styles["Normal"],
                      fontSize=9, fontName="Helvetica-Bold",
                      textColor=SIMPLE_BLUE, alignment=TA_CENTER)),
            Paragraph(f"<b><font color='{'#D97706' if sp>=8 else '#16A34A'}'>{cat}</font></b>",
                      ParagraphStyle("lv2", parent=styles["Normal"],
                                     fontSize=8, fontName="Helvetica-Bold")),
            Paragraph(desc, body),
        ])
    legend_table = Table(legend_rows, colWidths=[12*mm, 28*mm, W - 40*mm])
    legend_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), HEADER_BG),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [white, ROW_ALT]),
        ("BOX",       (0, 0), (-1, -1), 0.5, BORDER),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, BORDER),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING",   (0, 0), (-1, -1), 6),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(legend_table)
    story.append(Spacer(1, 4))
    story.append(Paragraph(
        "<b>Rule:</b> SP ≥ 8 → classified as an <b>Epic</b>   |   "
        "SP &lt; 8 → classified as a <b>Sprint Task</b>   |   "
        "Source: dev-resources.simple.biz/story-points (Fibonacci scale)",
        ParagraphStyle("note", parent=styles["Normal"],
                       fontSize=7.5, textColor=GRAY_TEXT, leading=10,
                       borderPad=4, borderColor=BORDER, borderWidth=0.5,
                       backColor=SIMPLE_LIGHT),
    ))
    story.append(Spacer(1, 10))

    # ── helper: render one task card ─────────────────────────────────────────
    def task_card(task_id, title, prs, sp, date, description, is_epic):
        bg     = EPIC_BG    if is_epic else SPRINT_BG
        badge  = EPIC_BADGE if is_epic else SPRINT_BADGE
        label  = "EPIC"     if is_epic else "SPRINT TASK"

        header_data = [[
            Paragraph(f"<b>{task_id}</b>",
                      ParagraphStyle("tid", parent=styles["Normal"],
                                     fontSize=8, fontName="Helvetica-Bold",
                                     textColor=GRAY_TEXT)),
            Paragraph(f"<b>{title}</b>",
                      ParagraphStyle("ttl", parent=styles["Normal"],
                                     fontSize=9.5, fontName="Helvetica-Bold",
                                     textColor=DARK, leading=13)),
            Paragraph(f"<b>  {label}  </b>",
                      ParagraphStyle("badge", parent=styles["Normal"],
                                     fontSize=7.5, fontName="Helvetica-Bold",
                                     textColor=white, backColor=badge,
                                     alignment=TA_CENTER, borderPad=3)),
            Paragraph(f"<b>SP: {sp}</b>",
                      ParagraphStyle("sp", parent=styles["Normal"],
                                     fontSize=9, fontName="Helvetica-Bold",
                                     textColor=badge, alignment=TA_CENTER)),
        ]]
        header_t = Table(header_data, colWidths=[18*mm, W - 62*mm, 22*mm, 14*mm])
        header_t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), bg),
            ("TOPPADDING",    (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING",   (0, 0), (-1, -1), 8),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LINEBELOW", (0, 0), (-1, -1), 0.5, badge),
        ]))

        detail_data = [[
            Paragraph(f"<b>PRs:</b> {prs}", meta),
            Paragraph(f"<b>Shipped:</b> {date}", meta),
        ]]
        detail_t = Table(detail_data, colWidths=[W * 0.5, W * 0.5])
        detail_t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), white),
            ("TOPPADDING",    (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING",   (0, 0), (-1, -1), 8),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
        ]))

        desc_data = [[Paragraph(description, body)]]
        desc_t = Table(desc_data, colWidths=[W])
        desc_t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), white),
            ("TOPPADDING",    (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("LEFTPADDING",   (0, 0), (-1, -1), 8),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
            ("LINEBELOW", (0, 0), (-1, -1), 0.5, BORDER),
        ]))

        return KeepTogether([header_t, detail_t, desc_t, Spacer(1, 4)])

    # ── Section: Epics ────────────────────────────────────────────────────────
    story.append(HRFlowable(width=W, thickness=1, color=EPIC_BADGE, spaceAfter=4))
    story.append(Paragraph(f"Epics  ({len(EPICS)} tasks — SP ≥ 8)", h2))
    story.append(Paragraph(
        "Epics represent high-complexity deliverables spanning multiple components, "
        "database migrations, or significant integrations. Each Epic was delivered "
        "across several sequential PRs.",
        body,
    ))
    story.append(Spacer(1, 6))
    for t in EPICS:
        story.append(task_card(t[0], t[1], t[2], t[3], t[4], t[5], is_epic=True))

    story.append(Spacer(1, 10))

    # ── Section: Sprint Tasks ─────────────────────────────────────────────────
    story.append(HRFlowable(width=W, thickness=1, color=SPRINT_BADGE, spaceAfter=4))
    story.append(Paragraph(f"Sprint Tasks  ({len(SPRINT)} tasks — SP < 8)", h2))
    story.append(Paragraph(
        "Sprint Tasks are focused deliverables that were planned, built, reviewed, "
        "and merged within a single sprint cycle.",
        body,
    ))
    story.append(Spacer(1, 6))
    for t in SPRINT:
        story.append(task_card(t[0], t[1], t[2], t[3], t[4], t[5], is_epic=False))

    story.append(Spacer(1, 10))

    # ── Quick-reference table ─────────────────────────────────────────────────
    story.append(HRFlowable(width=W, thickness=1, color=BORDER, spaceAfter=4))
    story.append(Paragraph("Quick Reference — All Tasks", h2))

    ref_header = [
        Paragraph("<b>ID</b>", ParagraphStyle("rh", parent=styles["Normal"],
                  fontSize=7.5, fontName="Helvetica-Bold", textColor=white,
                  alignment=TA_CENTER)),
        Paragraph("<b>Task</b>", ParagraphStyle("rh", parent=styles["Normal"],
                  fontSize=7.5, fontName="Helvetica-Bold", textColor=white)),
        Paragraph("<b>Category</b>", ParagraphStyle("rh", parent=styles["Normal"],
                  fontSize=7.5, fontName="Helvetica-Bold", textColor=white,
                  alignment=TA_CENTER)),
        Paragraph("<b>SP</b>", ParagraphStyle("rh", parent=styles["Normal"],
                  fontSize=7.5, fontName="Helvetica-Bold", textColor=white,
                  alignment=TA_CENTER)),
        Paragraph("<b>Shipped</b>", ParagraphStyle("rh", parent=styles["Normal"],
                  fontSize=7.5, fontName="Helvetica-Bold", textColor=white,
                  alignment=TA_CENTER)),
        Paragraph("<b>PRs</b>", ParagraphStyle("rh", parent=styles["Normal"],
                  fontSize=7.5, fontName="Helvetica-Bold", textColor=white,
                  alignment=TA_CENTER)),
    ]
    ref_rows = [ref_header]
    for idx, t in enumerate(TASKS):
        task_id, title, prs, sp, date, _ = t
        is_epic = sp >= 8
        cat_color = "#D97706" if is_epic else "#16A34A"
        cat_label = "EPIC" if is_epic else "Sprint Task"
        bg = white if idx % 2 == 0 else ROW_ALT
        ref_rows.append([
            Paragraph(f"<b>{task_id}</b>",
                      ParagraphStyle("rv", parent=styles["Normal"],
                                     fontSize=7, fontName="Helvetica-Bold",
                                     textColor=SIMPLE_BLUE, alignment=TA_CENTER)),
            Paragraph(title,
                      ParagraphStyle("rv", parent=styles["Normal"],
                                     fontSize=7, textColor=DARK, leading=9)),
            Paragraph(f"<font color='{cat_color}'><b>{cat_label}</b></font>",
                      ParagraphStyle("rv", parent=styles["Normal"],
                                     fontSize=7, fontName="Helvetica-Bold",
                                     alignment=TA_CENTER)),
            Paragraph(f"<b>{sp}</b>",
                      ParagraphStyle("rv", parent=styles["Normal"],
                                     fontSize=7, fontName="Helvetica-Bold",
                                     textColor=EPIC_BADGE if is_epic else SPRINT_BADGE,
                                     alignment=TA_CENTER)),
            Paragraph(date,
                      ParagraphStyle("rv", parent=styles["Normal"],
                                     fontSize=7, textColor=GRAY_TEXT,
                                     alignment=TA_CENTER)),
            Paragraph(prs,
                      ParagraphStyle("rv", parent=styles["Normal"],
                                     fontSize=6.5, textColor=GRAY_TEXT)),
        ])

    ref_table = Table(
        ref_rows,
        colWidths=[14*mm, W - 96*mm, 22*mm, 10*mm, 24*mm, 26*mm],
        repeatRows=1,
    )
    epic_rows   = [i+1 for i, t in enumerate(TASKS) if t[3] >= 8]
    sprint_rows = [i+1 for i, t in enumerate(TASKS) if t[3] < 8]

    ts_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), HEADER_BG),
        ("BOX",       (0, 0), (-1, -1), 0.5, BORDER),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, BORDER),
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING",   (0, 0), (-1, -1), 5),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 5),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]
    for r in epic_rows:
        ts_cmds.append(("BACKGROUND", (0, r), (-1, r), EPIC_BG))
    for r in sprint_rows:
        ts_cmds.append(("BACKGROUND", (0, r), (-1, r), SPRINT_BG))

    ref_table.setStyle(TableStyle(ts_cmds))
    story.append(ref_table)

    # ── Footer note ───────────────────────────────────────────────────────────
    story.append(Spacer(1, 12))
    story.append(HRFlowable(width=W, thickness=0.5, color=BORDER, spaceAfter=4))
    story.append(Paragraph(
        "Story point assignments are based on the Fibonacci scale (1–13) following the SP guidelines "
        "at dev-resources.simple.biz/story-points. Epics are tasks with SP ≥ 8; Sprint Tasks are SP &lt; 8. "
        "Shipment dates reflect the GitHub merge date to the main branch. "
        "Monday.com formally tracks 2 tasks linked to this project (ST-M1, ST-M2). "
        "All other tasks were derived from git history (PRs #1–361, Feb–Jul 2026). "
        "Generated: 2026-07-25 | Project Lead: Kentshin Wagai | Client: Hogan Smith Law",
        ParagraphStyle("footer", parent=styles["Normal"],
                       fontSize=6.5, textColor=GRAY_TEXT, leading=9, alignment=TA_CENTER),
    ))

    doc.build(story)
    print(f"PDF written → {output_path}")


if __name__ == "__main__":
    build_pdf(os.path.abspath(OUTPUT))
