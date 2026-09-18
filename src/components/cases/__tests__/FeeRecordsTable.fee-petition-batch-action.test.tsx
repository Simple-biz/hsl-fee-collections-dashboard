// @vitest-environment jsdom
//
// "Add to Fee Petitions" replaces the old behaviour where picking "Fee
// Petition" in the Level dropdown silently put a case on the Fee Petitions
// page. Two things make it different from every other action in the batch
// pill, and both are easy to regress:
//
//   1. It is open to ordinary agents, not just admins. The pill used to carry
//      a single isAdmin gate around everything; that gate now sits on each of
//      the older buttons individually, so a member sees this one and nothing
//      else.
//   2. It only sends the cases that aren't in the section yet, and disables
//      itself when the whole selection is already there.

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
    data: { user: { role: "member", capabilities: [] }, expires: "9999-12-31" },
    status: "authenticated",
    update: vi.fn(),
  })),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

const bulkAddToFeePetitionsMock = vi.fn();
vi.mock("@/app/(dashboard)/master-fees/actions", () => ({
  bulkReassign: vi.fn(),
  bulkAddToFeePetitions: (...args: unknown[]) => bulkAddToFeePetitionsMock(...args),
}));

vi.mock("@/app/(dashboard)/overpaid-cases/actions", () => ({
  bulkMarkOverpaid: vi.fn(),
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
  bulkAddToFeePetitionsMock.mockReset();
  bulkAddToFeePetitionsMock.mockResolvedValue({ ok: true });
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
  inFeePetition: false,
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

const SECOND_CASE: CaseRow = { ...BASE_CASE, id: 2, name: "Alvarez, Marco" };

function mockRole(role: "admin" | "member") {
  vi.mocked(useSession).mockReturnValue({
    data: { user: { role, capabilities: [] }, expires: "9999-12-31" },
    status: "authenticated",
    update: vi.fn(),
  } as unknown as ReturnType<typeof useSession>);
}

function renderAndSelect(
  cases: CaseRow[],
  mode: "active" | "closed" = "active",
) {
  const utils = render(
    <FeeRecordsTable
      cases={cases}
      mode={mode}
      dropdownOptions={{}}
      teamMembers={[]}
      approvedByOptions={[]}
    />,
  );
  for (const c of cases) {
    fireEvent.click(screen.getByLabelText(`Select ${c.name}`));
  }
  return utils;
}

const addButton = () => screen.queryByRole("button", { name: /Add to Fee Petitions/ });

describe("FeeRecordsTable — Add to Fee Petitions batch action", () => {
  it("is available to a member, who gets no other batch action", () => {
    mockRole("member");
    renderAndSelect([BASE_CASE]);
    expect(addButton()).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Archive$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Add to Overpaid Cases/ })).toBeNull();
  });

  it("is available to an admin alongside the admin-only actions", () => {
    mockRole("admin");
    renderAndSelect([BASE_CASE]);
    expect(addButton()).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Archive$/ })).toBeTruthy();
  });

  it("sends the selected case ids when clicked", () => {
    mockRole("member");
    renderAndSelect([BASE_CASE, SECOND_CASE]);
    fireEvent.click(addButton()!);
    expect(bulkAddToFeePetitionsMock).toHaveBeenCalledWith({ caseIds: [1, 2] });
  });

  it("skips cases already in the section and reports the remaining count", () => {
    mockRole("member");
    renderAndSelect([{ ...BASE_CASE, inFeePetition: true }, SECOND_CASE]);
    const btn = addButton()!;
    expect(btn.textContent).toContain("(1)");
    fireEvent.click(btn);
    expect(bulkAddToFeePetitionsMock).toHaveBeenCalledWith({ caseIds: [2] });
  });

  it("is disabled when every selected case is already in the section", () => {
    mockRole("member");
    renderAndSelect([{ ...BASE_CASE, inFeePetition: true }]);
    const btn = addButton() as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(bulkAddToFeePetitionsMock).not.toHaveBeenCalled();
  });

  it("is hidden on the Fees Closed table, which the section excludes anyway", () => {
    mockRole("admin");
    renderAndSelect([BASE_CASE], "closed");
    expect(addButton()).toBeNull();
  });

  // Every button in the pill is independently gated now, so the pill has to
  // check that something survives. A member on Fees Closed clears none of the
  // gates and must get no pill at all — not a floating bar saying "1 selected"
  // with nothing to do.
  it("shows no batch pill at all for a member on the Fees Closed table", () => {
    mockRole("member");
    renderAndSelect([BASE_CASE], "closed");
    expect(screen.queryByText("1 selected")).toBeNull();
  });

  it("still shows the pill for a member on the active table", () => {
    mockRole("member");
    renderAndSelect([BASE_CASE]);
    expect(screen.getByText("1 selected")).toBeTruthy();
  });

  it("still shows the pill for an admin on the Fees Closed table", () => {
    mockRole("admin");
    renderAndSelect([BASE_CASE], "closed");
    expect(screen.getByText("1 selected")).toBeTruthy();
  });
});
