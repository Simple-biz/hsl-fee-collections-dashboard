// @vitest-environment jsdom
//
// Follow-up date filter (requested by DeeAnne, via Jazz, alongside the
// follow-up sort) — a "Specific Day" or "Date Range" mode that narrows Master
// Fee Records down to cases with a Next Follow-Up date matching the picked
// criteria. Verifies: both modes filter correctly, a range bound is
// inclusive, and switching the mode alone (before picking a date) doesn't
// prematurely hide cases with no follow-up scheduled.

import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, fireEvent, cleanup, within } from "@testing-library/react";

// ── module mocks (must appear before component import) ────────────────────────

vi.mock("next/navigation", () => ({
  useSearchParams: vi.fn(() => new URLSearchParams()),
  useRouter: vi.fn(() => ({
    replace: vi.fn(),
    push: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  })),
}));

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

vi.mock("@/app/(dashboard)/overpaid-cases/actions", () => ({
  bulkMarkOverpaid: vi.fn(),
}));

vi.mock("@/app/(dashboard)/master-fees/actions", () => ({
  bulkReassign: vi.fn(),
}));

vi.mock("@/components/cases/CaseDetailSheet", () => ({ default: () => null }));
vi.mock("@/components/modals/ImportCasesModal", () => ({ default: () => null }));
vi.mock("@/components/modals/AddCaseModal", () => ({ default: () => null }));
vi.mock("@/components/modals/SheetSyncModal", () => ({ default: () => null }));
vi.mock("@/components/modals/MyCaseSyncModal", () => ({ default: () => null }));
vi.mock("@/components/modals/NotesModal", () => ({ default: () => null }));
vi.mock("@/components/cases/ArchiveConfirmDialog", () => ({ ArchiveConfirmDialog: () => null }));
vi.mock("@/components/cases/FeesClosedConfirmDialog", () => ({ FeesClosedConfirmDialog: () => null }));
vi.mock("@/components/cases/BulkFeesClosedConfirmDialog", () => ({ BulkFeesClosedConfirmDialog: () => null }));
vi.mock("@/components/cases/FeePaymentPanel", () => ({ FeePaymentPanel: () => null }));
vi.mock("@/components/cases/FeeAmountCell", () => ({ FeeAmountCell: () => null }));
vi.mock("@/components/cases/FeesConfBadge", () => ({ FeesConfBadge: () => null }));

import { FeeRecordsTable } from "@/components/cases/FeeRecordsTable";
import type { CaseRow } from "@/types";

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

const caseWith = (id: number, name: string, nextFollowUpDate: string | null): CaseRow => ({
  id,
  name,
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
  nextFollowUpDate,
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
  caseLink: null,
  winSheetLink: null,
  winSheetLinkText: null,
});

const CASES: CaseRow[] = [
  caseWith(1, "Charlie, Zed", "2026-03-10"),
  caseWith(2, "Alpha, Amy", null),
  caseWith(3, "Bravo, Bea", "2026-02-01"),
];

function renderTable() {
  return render(
    <FeeRecordsTable
      cases={CASES}
      mode="active"
      dropdownOptions={{}}
      teamMembers={[]}
      approvedByOptions={[]}
    />,
  );
}

function bodyRowNames(container: HTMLElement): string[] {
  const table = container.querySelector("table")!;
  return Array.from(table.querySelectorAll("tbody tr")).map(
    (row) => row.querySelector("td[title]")?.getAttribute("title") ?? "",
  );
}

describe("FeeRecordsTable — filter by Next Follow-Up", () => {
  afterEach(cleanup);

  it("selecting Specific Day mode alone (no date yet) doesn't hide any rows", () => {
    const { container } = renderTable();
    const modeSelect = within(container).getByLabelText("Follow-up date filter mode");
    fireEvent.change(modeSelect, { target: { value: "day" } });

    expect(bodyRowNames(container)).toHaveLength(3);
  });

  it("Specific Day mode narrows to the exact date, excluding no-follow-up cases", () => {
    const { container } = renderTable();
    const modeSelect = within(container).getByLabelText("Follow-up date filter mode");
    fireEvent.change(modeSelect, { target: { value: "day" } });
    const dayInput = within(container).getByLabelText("Follow-up day");
    fireEvent.change(dayInput, { target: { value: "2026-02-01" } });

    expect(bodyRowNames(container)).toEqual(["Bravo, Bea"]);
  });

  it("Date Range mode includes both range bounds and excludes no-follow-up cases", () => {
    const { container } = renderTable();
    const modeSelect = within(container).getByLabelText("Follow-up date filter mode");
    fireEvent.change(modeSelect, { target: { value: "range" } });
    fireEvent.change(within(container).getByLabelText("Follow-up from date"), {
      target: { value: "2026-02-01" },
    });
    fireEvent.change(within(container).getByLabelText("Follow-up to date"), {
      target: { value: "2026-03-10" },
    });

    const names = bodyRowNames(container).sort();
    expect(names).toEqual(["Bravo, Bea", "Charlie, Zed"]);
  });

  it("a range with only a From bound still excludes no-follow-up cases", () => {
    const { container } = renderTable();
    const modeSelect = within(container).getByLabelText("Follow-up date filter mode");
    fireEvent.change(modeSelect, { target: { value: "range" } });
    fireEvent.change(within(container).getByLabelText("Follow-up from date"), {
      target: { value: "2026-03-01" },
    });

    expect(bodyRowNames(container)).toEqual(["Charlie, Zed"]);
  });
});
