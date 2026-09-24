// @vitest-environment jsdom
//
// Removing cases from the Fee Petitions page is restricted to admin and lead
// via the feePetition.manage capability. The server enforces it; these cover
// the UI half, which is what staff actually see.
//
// The Completed tab's Clear column is conditional, so its colSpan has to track
// it. That pairing has caused two production bugs in this repo already, so it
// gets its own assertion rather than being assumed.

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";

const mockCan = vi.fn();
vi.mock("@/hooks/useCapabilities", () => ({ useCapabilities: () => ({ can: mockCan }) }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/fee-petitions",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));
vi.mock("@/lib/dropdown-options", () => ({ fetchDropdownOptions: () => Promise.resolve({}) }));
vi.mock("@/app/(dashboard)/fee-petitions/actions", () => ({
  upsertFeePetition: vi.fn(),
  bulkMarkComplete: vi.fn(),
  bulkRestoreChecklists: vi.fn(),
  bulkImportFeePetitions: vi.fn(),
  bulkRemoveFromFeePetitions: vi.fn(),
}));
vi.mock("@/components/modals/CsvImportModal", () => ({ default: () => null }));
vi.mock("@/components/modals/NotesModal", () => ({ default: () => null }));

import { FeePetitions } from "@/components/fee-petitions/FeePetitions";
import { CompletedPetitions } from "@/components/fee-petitions/CompletedPetitions";

const ROW = {
  id: 1,
  claimant: "Burrow, Leah",
  externalId: null,
  caseLink: null,
  approvalDate: "2026-09-17",
  updatedAt: null,
  feeAmount: null,
  feesReceived: 0,
  activeFeeType: "t16",
  assignedTo: null,
  noa: false,
  timeDelineation: false,
  feePetitionDoc: false,
  ltrToClmt: false,
  ltrToClmtWithSignature: false,
  ltrToAlj: false,
  faxConfFeePet: false,
  feePetitionApproved: false,
  updateNote: "",
  nextFollowUpDate: null,
  logCount: 0,
  recentUpdate: null,
};

beforeAll(() => {
  global.fetch = vi.fn().mockImplementation(() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [ROW],
          page: 1,
          limit: 50,
          total: 1,
          completeCount: 0,
          totalFeeRequested: 0,
          totalFeesReceived: 0,
          assignees: [],
          unassignedCount: 0,
        }),
    }),
  ) as unknown as typeof fetch;
});

beforeEach(() => {
  cleanup();
  mockCan.mockReset();
});

/** Grants everything except the capability under test, so only it is varied. */
const grant = (canManage: boolean) =>
  mockCan.mockImplementation((cap: string) => (cap === "feePetition.manage" ? canManage : true));

describe("Fee Petitions — remove is gated on feePetition.manage", () => {
  it("offers Remove to a user who can manage the section", async () => {
    grant(true);
    render(<FeePetitions />);
    const box = await screen.findByLabelText("Select Burrow, Leah");
    box.click();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Remove selected cases from Fee Petitions/ })).toBeTruthy(),
    );
  });

  it("withholds Remove from a user who cannot", async () => {
    grant(false);
    render(<FeePetitions />);
    const box = await screen.findByLabelText("Select Burrow, Leah");
    box.click();
    // The selection toolbar still appears for "All Steps Done"; only Remove goes.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Mark all checklist steps done/ })).toBeTruthy(),
    );
    expect(
      screen.queryByRole("button", { name: /Remove selected cases from Fee Petitions/ }),
    ).toBeNull();
  });
});

describe("Completed Petitions — Clear column is gated, and colSpan follows it", () => {
  const openTable = async () => {
    render(<CompletedPetitions dark={false} />);
    // The section is collapsed until its header is clicked.
    screen.getByText(/Completed Petitions/).click();
    await waitFor(() => expect(screen.getByText("Burrow, Leah")).toBeTruthy());
  };

  it("shows the Clear column to a user who can manage the section", async () => {
    grant(true);
    await openTable();
    expect(screen.getByRole("columnheader", { name: "Clear" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Clear Burrow, Leah from Fee Petitions/ })).toBeTruthy();
  });

  it("hides the Clear column from a user who cannot", async () => {
    grant(false);
    await openTable();
    expect(screen.queryByRole("columnheader", { name: "Clear" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Clear Burrow, Leah/ })).toBeNull();
  });

  // A conditional column with a fixed colSpan makes the loading and empty rows
  // span the wrong width — the drift this repo has hit twice before.
  it("keeps every body row's cell count equal to the header's", async () => {
    for (const canManage of [true, false]) {
      cleanup();
      grant(canManage);
      await openTable();
      const headerCells = screen.getAllByRole("columnheader").length;
      const firstRow = screen.getByText("Burrow, Leah").closest("tr")!;
      expect(firstRow.querySelectorAll("td").length).toBe(headerCells);
    }
  });
});
