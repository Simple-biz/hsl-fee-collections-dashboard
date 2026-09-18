// @vitest-environment jsdom
//
// Each Pending row carries eight checkboxes: the row selector, six filing
// steps, and the approval flag. Only the selector and the approval flag were
// labelled, so a screen reader met six identical unlabelled controls per row —
// 300 on a full page — with no way to tell Time Delineation from Ltr to ALJ.
//
// Found when a scripted click during a review landed on a filing step instead
// of the row selector, because nothing distinguished them.
//
// Renders the real component: the bug was in how the table wired labels to its
// rows, which a stand-in for the row markup could not have caught.

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/fee-petitions",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));
vi.mock("@/hooks/useCapabilities", () => ({ useCapabilities: () => ({ can: () => true }) }));
vi.mock("@/lib/dropdown-options", () => ({ fetchDropdownOptions: () => Promise.resolve({}) }));
vi.mock("@/app/(dashboard)/fee-petitions/actions", () => ({
  upsertFeePetition: vi.fn(),
  bulkMarkComplete: vi.fn(),
  bulkRestoreChecklists: vi.fn(),
  bulkImportFeePetitions: vi.fn(),
  bulkRemoveFromFeePetitions: vi.fn(),
}));
// Rendered separately below; stubbed here so it doesn't fire its own fetches.
vi.mock("../CompletedPetitions", () => ({ CompletedPetitions: () => null }));
vi.mock("@/components/modals/CsvImportModal", () => ({ default: () => null }));
vi.mock("@/components/modals/NotesModal", () => ({ default: () => null }));

import { FeePetitions } from "@/components/fee-petitions/FeePetitions";

// The Pending tab tracks six steps. Completed Petitions shows seven — it also
// lists NOA — so the two components' CHECKBOX_COLUMNS genuinely differ; don't
// "fix" one to match the other.
const STEPS = [
  "Time Delineation",
  "Fee Petition Doc",
  "Ltr to Clmt",
  "Ltr to Clmt w/ Signature",
  "Ltr to ALJ",
  "Fax Conf Fee Pet",
];

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
  timeDelineation: true,
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

beforeEach(cleanup);

describe("Fee Petitions checklist accessibility", () => {
  it("names every filing step and the case it belongs to", async () => {
    render(<FeePetitions />);
    await waitFor(() => expect(screen.getByLabelText("Select Burrow, Leah")).toBeTruthy());

    for (const label of STEPS) {
      expect(
        screen.getByRole("checkbox", { name: `${label} for Burrow, Leah` }),
      ).toBeTruthy();
    }
  });

  it("leaves no checkbox in the row without a name", async () => {
    render(<FeePetitions />);
    await waitFor(() => expect(screen.getByLabelText("Select Burrow, Leah")).toBeTruthy());

    const unnamed = screen
      .getAllByRole("checkbox")
      .filter((el) => !el.getAttribute("aria-label")?.trim());
    expect(unnamed).toHaveLength(0);
  });

  it("gives every checkbox in the row a distinct name", async () => {
    render(<FeePetitions />);
    await waitFor(() => expect(screen.getByLabelText("Select Burrow, Leah")).toBeTruthy());

    const names = screen
      .getAllByRole("checkbox")
      .map((el) => el.getAttribute("aria-label"));
    expect(new Set(names).size).toBe(names.length);
  });
});
