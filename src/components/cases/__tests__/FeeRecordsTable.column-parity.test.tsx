// @vitest-environment jsdom
//
// Structural guard for FeeRecordsTable column groups (T16 / T2 / AUX / Case Status).
//
// Each group duplicates colSpan/border values across 4+ JSX locations (row-1
// super-header, row-2 column headers, and body cells — each for both the
// expanded and collapsed states). That duplication has caused two independent
// bugs already (colSpan drift on Case Info, missing groupBorder on Case Status).
//
// This test renders the table and asserts two invariants for every combination
// of mode (active/closed) × role (admin/member) × collapse state:
//
//   1. sum of colSpan across row-1 <th>s  === body row <td> count
//   2. row-2 <th> count + rowSpan-2 cells from row-1 === body row <td> count
//
// Both invariants would have caught the prior bugs before they reached prod.

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";

// ── module mocks (must appear before component import) ────────────────────────

vi.mock("next-auth/react", () => ({
  useSession: vi.fn(() => ({
    data: { user: { role: "admin", capabilities: [] } },
    status: "authenticated",
    update: vi.fn(),
  })),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

// Server action — imports DB client with "use server"; must be mocked in tests.
vi.mock("@/app/(dashboard)/overpaid-cases/actions", () => ({
  bulkMarkOverpaid: vi.fn(),
}));

// Modals/dialogs are conditionally rendered and have complex deps not relevant
// to column structure.
vi.mock("@/components/cases/CaseDetailSheet", () => ({ default: () => null }));
vi.mock("@/components/modals/ImportCasesModal", () => ({ default: () => null }));
vi.mock("@/components/modals/AddCaseModal", () => ({ default: () => null }));
vi.mock("@/components/modals/SheetSyncModal", () => ({ default: () => null }));
vi.mock("@/components/modals/MyCaseSyncModal", () => ({ default: () => null }));
vi.mock("@/components/modals/NotesModal", () => ({ default: () => null }));
vi.mock("@/components/cases/ArchiveConfirmDialog", () => ({ ArchiveConfirmDialog: () => null }));
vi.mock("@/components/cases/FeesClosedConfirmDialog", () => ({ FeesClosedConfirmDialog: () => null }));
vi.mock("@/components/cases/BulkFeesClosedConfirmDialog", () => ({ BulkFeesClosedConfirmDialog: () => null }));

// Inline cell components — mocked to avoid pulling in heavy deps; their
// presence/absence doesn't affect <td> count since wrappers live in FeeRecordsTable.
vi.mock("@/components/cases/FeePaymentPanel", () => ({ FeePaymentPanel: () => null }));
vi.mock("@/components/cases/FeeAmountCell", () => ({ FeeAmountCell: () => null }));
vi.mock("@/components/cases/FeesConfBadge", () => ({ FeesConfBadge: () => null }));

import { FeeRecordsTable } from "@/components/cases/FeeRecordsTable";
import type { CaseRow } from "@/types";
import { useSession } from "next-auth/react";

// ── jsdom environment setup ───────────────────────────────────────────────────

beforeAll(() => {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    writable: true,
  });
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  })) as unknown as typeof ResizeObserver;
  global.IntersectionObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  })) as unknown as typeof IntersectionObserver;
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve([]),
  }) as unknown as typeof fetch;
});

// ── fixture ───────────────────────────────────────────────────────────────────

const BASE_CASE: CaseRow = {
  id: 1,
  name: "Watson, Katrina",
  externalId: null,
  chronicleId: null,
  assigned: "Test Agent",
  level: "HEARING",
  claim: "T16",
  date: "2026-01-15",
  status: "not_started",
  createdAt: "2026-01-15T00:00:00.000Z",
  t16Retro: 10000, t16FeeDue: 2500, t16FeeReceived: 0, t16Pending: 2500, t16FeeReceivedDate: null,
  t2Retro: 0,    t2FeeDue: null,   t2FeeReceived: 0,  t2Pending: 0,    t2FeeReceivedDate: null,
  auxRetro: 0,   auxFeeDue: null,  auxFeeReceived: 0, auxPending: 0,   auxFeeReceivedDate: null,
  totalRetroDue: 10000,
  expected: 2500,
  paid: 0,
  pif: null,
  approvedBy: null,
  feesConfirmation: null,
  feesClosedTrigger: null,
  caseStatus: null,
  nextFollowUpDate: null,
  isClosed: false,
  markedOverpaid: false,
  closedAt: null,
  update: "",
  sync: "synced",
  daysAfterApproval: 30,
  approvalCategory: null,
  feesStatus: null,
  weekAssignedToAgent: null,
  monthAssignedToAgent: null,
  office: "Test Office",
  notesCount: 0,
  leaderNotesCount: 0,
  winSheetLink: null,
  winSheetLinkText: null,
};

// ── column-count helpers ──────────────────────────────────────────────────────

function row1ColSpanSum(table: Element): number {
  const row1 = table.querySelector("thead tr:first-child");
  if (!row1) return 0;
  return Array.from(row1.querySelectorAll("th")).reduce(
    (sum, th) => sum + (Number(th.getAttribute("colspan")) || 1),
    0,
  );
}

function bodyTdCount(table: Element): number {
  return table.querySelector("tbody tr")?.querySelectorAll("td").length ?? 0;
}

function row2LogicalThCount(table: Element): number {
  const thead = table.querySelector("thead");
  if (!thead) return 0;
  const rows = thead.querySelectorAll("tr");
  if (rows.length < 2) return 0;
  const rowSpan2 = Array.from(rows[0].querySelectorAll('th[rowspan="2"]')).length;
  return rows[1].querySelectorAll("th").length + rowSpan2;
}

function assertColumnParity(container: HTMLElement, label: string) {
  const table = container.querySelector("table");
  expect(table, `${label}: no <table> found`).toBeTruthy();
  const tdCount = bodyTdCount(table!);
  expect(tdCount, `${label}: no body rows — table may have failed to render`).toBeGreaterThan(0);
  expect(row1ColSpanSum(table!), `${label}: row-1 colSpan sum ≠ body td count`).toBe(tdCount);
  expect(row2LogicalThCount(table!), `${label}: row-2 th count ≠ body td count`).toBe(tdCount);
}

// ── test helpers ──────────────────────────────────────────────────────────────

type Role = "admin" | "member";
type Mode = "active" | "closed";
type GroupKey = "caseStatus" | "t16" | "t2" | "aux";

const GROUP_LABEL: Record<GroupKey, string> = {
  caseStatus: "Case Status",
  t16: "T16",
  t2: "T2",
  aux: "AUX",
};

function mockRole(role: Role) {
  vi.mocked(useSession).mockReturnValue({
    data: { user: { role, capabilities: [] } },
    status: "authenticated",
    update: vi.fn(),
  } as ReturnType<typeof useSession>);
}

function renderTable(mode: Mode = "active") {
  return render(
    <FeeRecordsTable
      cases={[BASE_CASE]}
      mode={mode}
      dropdownOptions={{}}
      teamMembers={[]}
      approvedByOptions={[]}
    />,
  );
}

function collapseGroup(container: HTMLElement, group: GroupKey) {
  const label = `Minimize ${GROUP_LABEL[group]} columns`;
  const btn = container.querySelector(`[aria-label="${label}"]`) as HTMLElement | null;
  expect(btn, `collapse button for "${group}" not found`).toBeTruthy();
  fireEvent.click(btn!);
}

// ── tests ─────────────────────────────────────────────────────────────────────

const MODES: Mode[] = ["active", "closed"];
const ROLES: Role[] = ["admin", "member"];
const GROUPS: GroupKey[] = ["caseStatus", "t16", "t2", "aux"];

describe("FeeRecordsTable — header/body column parity", () => {
  beforeEach(() => {
    mockRole("admin");
  });

  describe("all groups expanded (default state)", () => {
    for (const mode of MODES) {
      for (const role of ROLES) {
        it(`${mode} / ${role}`, () => {
          mockRole(role);
          const { container } = renderTable(mode);
          assertColumnParity(container, `all-expanded / ${mode} / ${role}`);
        });
      }
    }
  });

  describe("single group collapsed", () => {
    for (const group of GROUPS) {
      for (const mode of MODES) {
        it(`${group} collapsed / ${mode}`, () => {
          const { container } = renderTable(mode);
          collapseGroup(container, group);
          assertColumnParity(container, `${group}-collapsed / ${mode}`);
        });
      }
    }
  });

  it("all groups collapsed / active", () => {
    const { container } = renderTable("active");
    for (const group of GROUPS) collapseGroup(container, group);
    assertColumnParity(container, "all-collapsed / active");
  });

  it("all groups collapsed / closed", () => {
    const { container } = renderTable("closed");
    for (const group of GROUPS) collapseGroup(container, group);
    assertColumnParity(container, "all-collapsed / closed");
  });
});
