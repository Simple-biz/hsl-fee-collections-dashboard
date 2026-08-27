// @vitest-environment jsdom
//
// Sorting by "Next Follow-Up" (requested by DeeAnne, via Jazz, so staff can
// see scheduled follow-up calls in date order). Verifies: click-to-sort wires
// up like every other date column, and cases with no follow-up date scheduled
// always sort to the end — regardless of ascending/descending — rather than
// jumping to the top when the direction is reversed.

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
  caseWith(1, "Charlie, Zed", "2026-03-10"),   // latest real date
  caseWith(2, "Alpha, Amy", null),              // no follow-up scheduled
  caseWith(3, "Bravo, Bea", "2026-02-01"),      // earliest real date
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

// The name cell is `<td title={c.name}>` (FeeRecordsTable.tsx:2025) — reading
// the title attribute avoids ambiguous text-matching against other
// comma-containing cells (e.g. formatted dates) in the same row.
function bodyRowNames(container: HTMLElement): string[] {
  const table = container.querySelector("table")!;
  return Array.from(table.querySelectorAll("tbody tr")).map(
    (row) => row.querySelector("td[title]")?.getAttribute("title") ?? "",
  );
}

describe("FeeRecordsTable — sort by Next Follow-Up", () => {
  afterEach(cleanup);

  it("clicking the header sorts ascending (soonest-due-first) by default, with no-date cases last", () => {
    const { container } = renderTable();
    const header = within(container).getByRole("button", { name: /Next Follow-Up/i });
    fireEvent.click(header);

    const names = bodyRowNames(container);
    expect(names).toEqual(["Bravo, Bea", "Charlie, Zed", "Alpha, Amy"]);
  });

  it("clicking again reverses to descending (latest-due-first), but no-date cases still sort last", () => {
    const { container } = renderTable();
    const header = within(container).getByRole("button", { name: /Next Follow-Up/i });
    fireEvent.click(header); // asc
    fireEvent.click(header); // desc

    const names = bodyRowNames(container);
    expect(names).toEqual(["Charlie, Zed", "Bravo, Bea", "Alpha, Amy"]);
  });

  it("marks aria-sort on the header once active", () => {
    const { container } = renderTable();
    const header = within(container).getByRole("button", { name: /Next Follow-Up/i });
    fireEvent.click(header);

    const th = header.closest("th");
    expect(th?.getAttribute("aria-sort")).toBe("ascending");
  });
});
