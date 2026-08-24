// @vitest-environment jsdom
//
// "Add to Overpaid Cases" batch action must be available on Fees Closed too,
// not just the active table — the underlying server action has no is_closed
// guard, and the only alternative (unchecking "Reopen") also wipes PIF status
// just to flag a case Overpaid. "Fees Closed" itself stays active-only, since
// closing an already-closed case makes no sense.

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, fireEvent, screen, cleanup } from "@testing-library/react";

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
    data: { user: { role: "admin", capabilities: [] }, expires: "9999-12-31" },
    status: "authenticated",
    update: vi.fn(),
  })),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

const bulkMarkOverpaidMock = vi.fn();
vi.mock("@/app/(dashboard)/overpaid-cases/actions", () => ({
  bulkMarkOverpaid: (...args: unknown[]) => bulkMarkOverpaidMock(...args),
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
import { useSession } from "next-auth/react";

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

beforeEach(() => {
  cleanup();
  bulkMarkOverpaidMock.mockReset();
  bulkMarkOverpaidMock.mockResolvedValue({ ok: true });
});

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
  caseLink: null,
  winSheetLink: null,
  winSheetLinkText: null,
};

function mockRole(role: "admin" | "member") {
  vi.mocked(useSession).mockReturnValue({
    data: { user: { role, capabilities: [] }, expires: "9999-12-31" },
    status: "authenticated",
    update: vi.fn(),
  } as unknown as ReturnType<typeof useSession>);
}

function renderAndSelect(mode: "active" | "closed") {
  const utils = render(
    <FeeRecordsTable
      cases={[BASE_CASE]}
      mode={mode}
      dropdownOptions={{}}
      teamMembers={[]}
      approvedByOptions={[]}
    />,
  );
  fireEvent.click(screen.getByLabelText("Select Watson, Katrina"));
  return utils;
}

describe("FeeRecordsTable — Add to Overpaid Cases batch action", () => {
  beforeEach(() => mockRole("admin"));

  it("is available on the active table for an admin", () => {
    renderAndSelect("active");
    expect(screen.getByRole("button", { name: /Add to Overpaid Cases/ })).toBeTruthy();
  });

  it("is also available on the closed table for an admin", () => {
    renderAndSelect("closed");
    expect(screen.getByRole("button", { name: /Add to Overpaid Cases/ })).toBeTruthy();
  });

  it("hides the redundant Fees Closed action on the closed table", () => {
    renderAndSelect("closed");
    expect(screen.queryByRole("button", { name: /^Fees Closed$/ })).toBeNull();
  });

  it("stays hidden on the closed table for a member (no case.finalize)", () => {
    mockRole("member");
    renderAndSelect("closed");
    expect(screen.queryByRole("button", { name: /Add to Overpaid Cases/ })).toBeNull();
  });

  it("calls bulkMarkOverpaid with the selected case when clicked from the closed table", () => {
    renderAndSelect("closed");
    fireEvent.click(screen.getByRole("button", { name: /Add to Overpaid Cases/ }));
    expect(bulkMarkOverpaidMock).toHaveBeenCalledWith({ caseIds: [1] });
  });
});
