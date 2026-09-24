// @vitest-environment jsdom
//
// "Add to Fee Petitions" replaces the old behaviour where picking "Fee
// Petition" in the Level dropdown silently put a case on the Fee Petitions
// page. Two things make it different from every other action in the batch
// pill, and both are easy to regress:
//
//   1. It is open to all authenticated staff on the active table — not gated
//      on a capability. Members see the add button (and the pill); only
//      Fees Closed mode suppresses it.
//   2. It only sends the cases that aren't in the section yet, and disables
//      itself when the whole selection is already there.

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, fireEvent, screen, cleanup, within, waitFor } from "@testing-library/react";

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
  // Mirror the real contract: the action reports which ids it actually
  // updated. Resolving a bare { ok: true } lets the component throw on
  // result.updated and the try/catch swallow it — green tests over a
  // TypeError.
  bulkAddToFeePetitionsMock.mockImplementation(
    ({ caseIds }: { caseIds: number[] }) => Promise.resolve({ ok: true, updated: caseIds }),
  );
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

function mockRole(role: "admin" | "lead" | "member") {
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

// The pill button opens a confirm dialog; the dialog's own button is what
// fires the action. Both carry the same label, so scope to the dialog.
const addButton = () =>
  screen.queryAllByRole("button", { name: /Add to Fee Petitions/ })[0] ?? null;

const confirmAdd = () => {
  fireEvent.click(addButton()!);
  const dialog = screen.getByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: /Add to Fee Petitions/ }));
};

describe("FeeRecordsTable — Add to Fee Petitions batch action", () => {
  it("is available to a member, who gets the add button but no admin-only actions", () => {
    mockRole("member");
    renderAndSelect([BASE_CASE]);
    expect(addButton()).toBeTruthy();
    expect(screen.getByText("1 selected")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Archive$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Add to Overpaid Cases/ })).toBeNull();
  });

  it("is available to a lead, without the admin-only actions", () => {
    mockRole("lead");
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

  it("confirms before doing anything, then sends the selected case ids", () => {
    mockRole("lead");
    renderAndSelect([BASE_CASE, SECOND_CASE]);

    fireEvent.click(addButton()!);
    // The click must open the dialog, not fire the action.
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(bulkAddToFeePetitionsMock).not.toHaveBeenCalled();

    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /Add to Fee Petitions/ }));
    expect(bulkAddToFeePetitionsMock).toHaveBeenCalledWith({ caseIds: [1, 2] });
  });

  it("does nothing if the confirm is cancelled", () => {
    mockRole("lead");
    renderAndSelect([BASE_CASE]);
    fireEvent.click(addButton()!);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Cancel$/ }));
    expect(bulkAddToFeePetitionsMock).not.toHaveBeenCalled();
  });

  it("skips cases already in the section and reports the remaining count", () => {
    mockRole("lead");
    renderAndSelect([{ ...BASE_CASE, inFeePetition: true }, SECOND_CASE]);
    expect(addButton()!.textContent).toContain("(1)");
    confirmAdd();
    expect(bulkAddToFeePetitionsMock).toHaveBeenCalledWith({ caseIds: [2] });
  });

  // The dialog must read a snapshot taken when it opened, not live selection
  // state. Confirming clears the selection while the dialog is still mounted
  // for its close animation, so a live read re-renders it as "Add 0 cases to
  // Fee Petitions?" on the way out — caught in the browser, invisible to
  // jsdom, which has no animation. Deselecting behind the open dialog
  // reproduces the same read without needing one.
  it("keeps the count it opened with when the selection changes underneath", () => {
    mockRole("lead");
    renderAndSelect([BASE_CASE, SECOND_CASE]);
    fireEvent.click(addButton()!);
    expect(screen.getByRole("dialog").textContent).toMatch(/Add 2 cases/);

    fireEvent.click(screen.getByLabelText(`Select ${SECOND_CASE.name}`));
    expect(screen.getByRole("dialog").textContent).toMatch(/Add 2 cases/);

    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: /Add to Fee Petitions/ }),
    );
    expect(bulkAddToFeePetitionsMock).toHaveBeenCalledWith({ caseIds: [1, 2] });
  });

  // The action is scoped to open cases, so a case closed by someone else
  // between opening the dialog and confirming is silently skipped. The UI must
  // reflect what the database did, not what was asked for.
  it("reports cases the server could not add, and keeps the dialog open", async () => {
    mockRole("lead");
    bulkAddToFeePetitionsMock.mockResolvedValue({ ok: true, updated: [1] });
    renderAndSelect([BASE_CASE, SECOND_CASE]);
    confirmAdd();

    await screen.findByText(/1 of 2 cases could not be added — it was closed by someone else/);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("closes cleanly when the server updated everything asked for", async () => {
    mockRole("lead");
    renderAndSelect([BASE_CASE, SECOND_CASE]);
    confirmAdd();

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByText(/closed by someone else/)).toBeNull();
  });

  it("tells you in the dialog which selected cases are being left alone", () => {
    mockRole("lead");
    renderAndSelect([{ ...BASE_CASE, inFeePetition: true }, SECOND_CASE]);
    fireEvent.click(addButton()!);
    expect(screen.getByRole("dialog").textContent).toMatch(/1 of the 2 selected is already there/);
  });

  it("is disabled when every selected case is already in the section", () => {
    mockRole("lead");
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

  // "Add to Fee Petitions" is the only non-admin batch action. On Fees Closed
  // it is suppressed (the section excludes closed cases), so a member selecting
  // rows there gets no pill at all — not a floating bar saying "1 selected"
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

// The marker has to read the Level through cellValue(), which resolves the
// optimistic `pending` edit, not the raw c.level off the API row. Reading the
// raw field made the marker vanish the moment someone picked "Fee Petition" —
// disagreeing with the dropdown right next to it — and only correct itself on
// the next refresh. Caught in the browser, not by the unit tests on the
// component itself, which can't see this wiring.
describe("FeeRecordsTable — Fee Petitions marker tracks unsaved Level edits", () => {
  const renderTable = (c: CaseRow) => {
    mockRole("admin");
    return render(
      <FeeRecordsTable
        cases={[c]}
        mode="active"
        dropdownOptions={{ case_level: [
          { id: 1, name: "INITIAL", isActive: true, sortOrder: 1 },
          { id: 2, name: "FEE PETITION", isActive: true, sortOrder: 2 },
        ] }}
        teamMembers={[]}
        approvedByOptions={[]}
      />,
    );
  };

  const marker = (re: RegExp) => screen.queryByText(re);
  const ADDED = /On the Fee Petitions page/;
  const NOT_ADDED = /not added to the Fee Petitions page yet/;

  it("shows no marker for a case at another level", () => {
    renderTable(BASE_CASE);
    expect(marker(ADDED)).toBeNull();
    expect(marker(NOT_ADDED)).toBeNull();
  });

  it("shows the not-added marker for a Fee Petition case straight from the API", () => {
    renderTable({ ...BASE_CASE, level: "FEE PETITION" });
    expect(marker(NOT_ADDED)).toBeTruthy();
  });

  it("shows the added marker once the case is in the section", () => {
    renderTable({ ...BASE_CASE, level: "FEE PETITION", inFeePetition: true });
    expect(marker(ADDED)).toBeTruthy();
  });

  it("appears as soon as Level is switched to Fee Petition, before any refresh", () => {
    renderTable(BASE_CASE);
    expect(marker(NOT_ADDED)).toBeNull();

    fireEvent.click(screen.getByLabelText("Case Level"));
    // Scoped to the popup — the toolbar's Level filter is a native <select>
    // carrying its own "FEE PETITION" option.
    const popup = screen.getByRole("listbox");
    // The option renders the formatted label ("Fee Petition"), not the stored
    // value ("FEE PETITION") — matching on the formatted form pins that.
    fireEvent.click(within(popup).getByRole("option", { name: "Fee Petition" }));

    expect(marker(NOT_ADDED)).toBeTruthy();
  });
});
