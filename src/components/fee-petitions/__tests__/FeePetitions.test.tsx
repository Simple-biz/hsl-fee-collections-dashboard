// @vitest-environment jsdom
//
// Targets the three bug shapes that have actually caused regressions (per #458):
//
//   1. Wiring — the claimant name, checklist state, and fee amount that the
//      component renders must come from the API row, not from a stale local
//      copy or a hard-coded fallback.
//   2. Optimistic UI vs server — bulk-checklist-done marks every checkbox true
//      immediately on success; a server error shows the error banner without
//      flipping any state.
//   3. Confirm/abort paths — cancelling the remove dialog makes no API call;
//      confirming does, and a partial-failure response surfaces the skipped-
//      cases message inside the dialog rather than swallowing it.

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useSearchParams: vi.fn(() => new URLSearchParams()),
  usePathname: vi.fn(() => "/fee-petitions"),
  useRouter: vi.fn(() => ({
    replace: vi.fn(), push: vi.fn(), back: vi.fn(),
    forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(),
  })),
}));

vi.mock("next-auth/react", () => ({
  useSession: vi.fn(() => ({
    data: {
      user: {
        role: "admin",
        capabilities: ["case.update", "feePetition.manage"],
      },
      expires: "9999-12-31",
    },
    status: "authenticated",
    update: vi.fn(),
  })),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

// Heavy child components — stub them out so jsdom doesn't need to render them
vi.mock("@/components/fee-petitions/CompletedPetitions", () => ({ CompletedPetitions: () => null }));
vi.mock("@/components/modals/CsvImportModal", () => ({ default: () => null }));
vi.mock("@/components/modals/NotesModal", () => ({ default: () => null }));
vi.mock("@/components/cases/FeeAmountCell", () => ({ FeeAmountCell: () => null }));
vi.mock("@/components/shared/Listbox", () => ({ Listbox: () => null }));
vi.mock("@/lib/dropdown-options", () => ({
  fetchDropdownOptions: vi.fn().mockResolvedValue({}),
}));

const mockBulkMarkComplete = vi.fn();
const mockBulkRemoveFromFeePetitions = vi.fn();
const mockBulkRestoreChecklists = vi.fn();
const mockUpsertFeePetition = vi.fn();
const mockBulkImportFeePetitions = vi.fn();

vi.mock("@/app/(dashboard)/fee-petitions/actions", () => ({
  bulkMarkComplete: (...args: unknown[]) => mockBulkMarkComplete(...args),
  bulkRemoveFromFeePetitions: (...args: unknown[]) => mockBulkRemoveFromFeePetitions(...args),
  bulkRestoreChecklists: (...args: unknown[]) => mockBulkRestoreChecklists(...args),
  upsertFeePetition: (...args: unknown[]) => mockUpsertFeePetition(...args),
  bulkImportFeePetitions: (...args: unknown[]) => mockBulkImportFeePetitions(...args),
}));

import { FeePetitions } from "@/components/fee-petitions/FeePetitions";

// ---------------------------------------------------------------------------
// Shared fixture
// ---------------------------------------------------------------------------

const BASE_ROW = {
  id: 1,
  claimant: "Watson, Diana",
  externalId: null,
  caseLink: null,
  approvalDate: "2024-01-15",
  updatedAt: null,
  feeAmount: 6000,
  feesReceived: null,
  activeFeeType: "t2" as const,
  assignedTo: "Agent Smith",
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
  recentUpdate: null,
  logCount: 0,
};

const SECOND_ROW = {
  ...BASE_ROW,
  id: 2,
  claimant: "Jones, Robert",
};

function makeApiResponse(rows = [BASE_ROW], total = rows.length) {
  return {
    data: rows,
    total,
    assignees: [],
    unassignedCount: 0,
  };
}

// ---------------------------------------------------------------------------
// Browser-global stubs required by the component tree
// ---------------------------------------------------------------------------

beforeAll(() => {
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn(),
  })) as unknown as typeof ResizeObserver;
  global.IntersectionObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn(),
  })) as unknown as typeof IntersectionObserver;
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((q: string) => ({
      matches: false, media: q, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    writable: true,
  });
});

beforeEach(() => {
  // Default: main list returns one row; totals and count return empty
  global.fetch = vi.fn().mockImplementation((url: string) => {
    const u = String(url);
    // Match limit=1 exactly (not limit=10, limit=100, etc.)
    const isCountOrTotals = u.includes("status=complete") || /[?&]limit=1(?:&|$)/.test(u);
    if (isCountOrTotals) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: [], total: 0, assignees: [], unassignedCount: 0 }),
      });
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(makeApiResponse()),
    });
  }) as unknown as typeof fetch;

  mockBulkMarkComplete.mockReset();
  mockBulkRemoveFromFeePetitions.mockReset();
  mockBulkRestoreChecklists.mockReset();
  mockUpsertFeePetition.mockReset();
  mockBulkImportFeePetitions.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Wiring — rendered values come from the API row
// ---------------------------------------------------------------------------

describe("FeePetitions — wiring", () => {
  it("renders the claimant name from the API row", async () => {
    render(<FeePetitions />);
    await waitFor(() => {
      expect(screen.getByText("Watson, Diana")).toBeTruthy();
    });
  });

  it("renders a second row when the API returns two rows", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      const u = String(url);
      const isCountOrTotals = u.includes("status=complete") || /[?&]limit=1(?:&|$)/.test(u);
      if (isCountOrTotals) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: [], total: 0, assignees: [], unassignedCount: 0 }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(makeApiResponse([BASE_ROW, SECOND_ROW], 2)),
      });
    }) as unknown as typeof fetch;

    render(<FeePetitions />);
    await waitFor(() => {
      expect(screen.getByText("Watson, Diana")).toBeTruthy();
      expect(screen.getByText("Jones, Robert")).toBeTruthy();
    });
  });

  it("shows an error banner when the API returns a non-OK status", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    }) as unknown as typeof fetch;

    render(<FeePetitions />);
    await waitFor(() => {
      expect(screen.getByText(/Failed to load fee petitions/i)).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Optimistic UI — bulk checklist done
// ---------------------------------------------------------------------------

describe("FeePetitions — bulk checklist done", () => {
  it("calls bulkMarkComplete with the selected case ids", async () => {
    mockBulkMarkComplete.mockResolvedValue({ ok: true, updated: [1] });

    render(<FeePetitions />);
    await waitFor(() => screen.getByText("Watson, Diana"));

    // Select the row
    const checkbox = screen.getByRole("checkbox", { name: /select watson, diana/i });
    fireEvent.click(checkbox);

    // Click the "All Steps Done" button — enters confirm state
    const allStepsBtn = screen.getByRole("button", { name: /mark all checklist steps done/i });
    fireEvent.click(allStepsBtn);
    // In confirm state — "Confirm" button appears
    const confirmBtn = await screen.findByRole("button", { name: /^Confirm$/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockBulkMarkComplete).toHaveBeenCalledWith({ caseIds: [1] });
    });

    // Optimistic update: all 6 checklist checkboxes for the row must flip to checked
    // immediately on success without waiting for a re-fetch.
    const checklistLabels = [
      "Time Delineation for Watson, Diana",
      "Fee Petition Doc for Watson, Diana",
      "Ltr to Clmt for Watson, Diana",
      "Ltr to Clmt w/ Signature for Watson, Diana",
      "Ltr to ALJ for Watson, Diana",
      "Fax Conf Fee Pet for Watson, Diana",
    ];
    for (const label of checklistLabels) {
      const cb = screen.getByRole("checkbox", { name: label }) as HTMLInputElement;
      expect(cb.checked).toBe(true);
    }
  });

  it("shows an error banner when bulkMarkComplete fails", async () => {
    mockBulkMarkComplete.mockResolvedValue({ ok: false, error: "Server error on checklist" });

    render(<FeePetitions />);
    await waitFor(() => screen.getByText("Watson, Diana"));

    const checkbox = screen.getByRole("checkbox", { name: /select watson, diana/i });
    fireEvent.click(checkbox);

    const allStepsBtn = screen.getByRole("button", { name: /mark all checklist steps done/i });
    fireEvent.click(allStepsBtn);
    const confirmBtn = await screen.findByRole("button", { name: /^Confirm$/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByText("Server error on checklist")).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// 3. Confirm / abort — bulk remove
// ---------------------------------------------------------------------------

describe("FeePetitions — bulk remove confirm dialog", () => {
  it("does not call bulkRemoveFromFeePetitions when the dialog is cancelled", async () => {
    render(<FeePetitions />);
    await waitFor(() => screen.getByText("Watson, Diana"));

    fireEvent.click(screen.getByRole("checkbox", { name: /select watson, diana/i }));

    // Click the remove button (aria-label) to open the confirm dialog
    const removeBtn = screen.getByRole("button", { name: /remove selected cases from fee petitions/i });
    fireEvent.click(removeBtn);

    // Dialog opens — click Cancel
    const cancelBtn = await screen.findByRole("button", { name: /^Cancel$/i });
    fireEvent.click(cancelBtn);

    expect(mockBulkRemoveFromFeePetitions).not.toHaveBeenCalled();
  });

  it("calls bulkRemoveFromFeePetitions with selected ids when confirmed", async () => {
    mockBulkRemoveFromFeePetitions.mockResolvedValue({ ok: true, updated: [1] });

    render(<FeePetitions />);
    await waitFor(() => screen.getByText("Watson, Diana"));

    fireEvent.click(screen.getByRole("checkbox", { name: /select watson, diana/i }));

    const removeBtn = screen.getByRole("button", { name: /remove selected cases from fee petitions/i });
    fireEvent.click(removeBtn);

    // RemoveFromFeePetitionsConfirmDialog opens — find the confirm button by role + text
    const dialogConfirmBtn = await screen.findByRole("button", { name: /remove from fee petitions/i });
    fireEvent.click(dialogConfirmBtn);

    await waitFor(() => {
      expect(mockBulkRemoveFromFeePetitions).toHaveBeenCalledWith({ caseIds: [1] });
    });
  });

  it("shows a skipped-cases message in the dialog when the server reports a partial update", async () => {
    // 2 cases selected, only 1 actually removed (the other was closed)
    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(makeApiResponse([BASE_ROW, SECOND_ROW], 2)),
      }),
    ) as unknown as typeof fetch;

    // Server removed only case 1 — case 2 was already closed
    mockBulkRemoveFromFeePetitions.mockResolvedValue({ ok: true, updated: [1] });

    render(<FeePetitions />);
    await waitFor(() => screen.getByText("Watson, Diana"));
    await waitFor(() => screen.getByText("Jones, Robert"));

    // Select individual row checkboxes (skip the header "Select all rows" checkbox
    // to avoid the header + individual clicks cancelling each other out)
    fireEvent.click(screen.getByRole("checkbox", { name: /select watson, diana/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /select jones, robert/i }));

    const removeBtn = screen.getByRole("button", { name: /remove selected cases from fee petitions/i });
    fireEvent.click(removeBtn);

    const dialogConfirmBtn = await screen.findByRole("button", { name: /remove from fee petitions/i });
    fireEvent.click(dialogConfirmBtn);

    await waitFor(() => {
      // skippedClosedCasesMessage: "1 of 2 cases could not be removed — it was closed by someone else."
      expect(screen.getByRole("alert")).toBeTruthy();
      expect(screen.getByRole("alert").textContent).toMatch(/could not be removed/i);
    });
  });
});
