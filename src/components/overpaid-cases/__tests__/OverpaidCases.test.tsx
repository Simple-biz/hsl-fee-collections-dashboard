// @vitest-environment jsdom
//
// Targets the three bug shapes that have caused regressions (per #458):
//
//   1. Wiring — claimant name and totals must come from the API row, not
//      stale local state or hard-coded fallbacks.
//   2. Optimistic UI vs server — bulk-mark-cleared removes the row from
//      the list immediately on success; a server error surfaces the error
//      banner without mutating any rows.
//   3. Confirm/abort paths — cancelling either confirm state makes no API
//      call; confirming does.

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useSearchParams: vi.fn(() => new URLSearchParams()),
  usePathname: vi.fn(() => "/overpaid-cases"),
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
        capabilities: ["case.update", "overpaidCase.manage"],
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

vi.mock("@/components/overpaid-cases/ClearedCases", () => ({ ClearedCases: () => null }));
vi.mock("@/components/modals/AddCaseModal", () => ({ default: () => null }));
vi.mock("@/components/shared/NoteField", () => ({ NoteField: () => null }));
vi.mock("@/lib/dropdown-options", () => ({
  fetchDropdownOptions: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/hooks/useCapabilities", () => ({
  useCapabilities: vi.fn(() => ({
    can: () => true,
    capabilities: ["case.update", "overpaidCase.manage"],
  })),
}));

const mockBulkMarkCleared = vi.fn();
const mockBulkRestoreCleared = vi.fn();
const mockBulkRemoveFromOverpaid = vi.fn();
const mockMarkCaseOverpaid = vi.fn();
const mockUpsertOverpaidCase = vi.fn();
const mockUpdateFeesConfirmation = vi.fn();

vi.mock("@/app/(dashboard)/overpaid-cases/actions", () => ({
  bulkMarkCleared: (...args: unknown[]) => mockBulkMarkCleared(...args),
  bulkRestoreCleared: (...args: unknown[]) => mockBulkRestoreCleared(...args),
  bulkRemoveFromOverpaid: (...args: unknown[]) => mockBulkRemoveFromOverpaid(...args),
  markCaseOverpaid: (...args: unknown[]) => mockMarkCaseOverpaid(...args),
  upsertOverpaidCase: (...args: unknown[]) => mockUpsertOverpaidCase(...args),
  updateFeesConfirmation: (...args: unknown[]) => mockUpdateFeesConfirmation(...args),
}));

import { OverpaidCases } from "@/components/overpaid-cases/OverpaidCases";

// ---------------------------------------------------------------------------
// Shared fixture
// ---------------------------------------------------------------------------

const BASE_ROW = {
  id: 1,
  claimant: "Nguyen, Linda",
  externalId: null,
  caseLink: null,
  assignedTo: "Agent Smith",
  region: null,
  feesReceived: 6000,
  overpaidAmount: 1500,
  feesConfirmation: null,
  opLtrDate: null,
  opLtrReceived: null,
  checksCleared: false,
  checksClearedAt: null,
  updateNote: "",
  updatedAt: null,
};

const SECOND_ROW = { ...BASE_ROW, id: 2, claimant: "Torres, Miguel" };

function makeApiResponse(rows = [BASE_ROW], overrides: Record<string, unknown> = {}) {
  return {
    data: rows,
    total: rows.length,
    totalOverpaid: 1500,
    ltrCount: 0,
    pageFeesReceived: 6000,
    pageOverpaid: 1500,
    agents: [],
    unassignedCount: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Browser-global stubs
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
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(makeApiResponse()),
  }) as unknown as typeof fetch;

  mockBulkMarkCleared.mockReset();
  mockBulkRestoreCleared.mockReset();
  mockBulkRemoveFromOverpaid.mockReset();
  mockMarkCaseOverpaid.mockReset();
  mockUpsertOverpaidCase.mockReset();
  mockUpdateFeesConfirmation.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Wiring — rendered values come from the API row
// ---------------------------------------------------------------------------

describe("OverpaidCases — wiring", () => {
  it("renders the claimant name from the API row", async () => {
    render(<OverpaidCases />);
    await waitFor(() => {
      expect(screen.getByText("Nguyen, Linda")).toBeTruthy();
    });
  });

  it("renders a second row when the API returns two rows", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeApiResponse([BASE_ROW, SECOND_ROW])),
    }) as unknown as typeof fetch;

    render(<OverpaidCases />);
    await waitFor(() => {
      expect(screen.getByText("Nguyen, Linda")).toBeTruthy();
      expect(screen.getByText("Torres, Miguel")).toBeTruthy();
    });
  });

  it("shows an error banner when the API returns a non-OK status", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    }) as unknown as typeof fetch;

    render(<OverpaidCases />);
    await waitFor(() => {
      expect(screen.getByText(/Failed to load overpaid cases/i)).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Optimistic UI — bulk mark cleared
// ---------------------------------------------------------------------------

describe("OverpaidCases — bulk mark cleared", () => {
  it("calls bulkMarkCleared with selected case ids", async () => {
    mockBulkMarkCleared.mockResolvedValue({ ok: true });

    render(<OverpaidCases />);
    await waitFor(() => screen.getByText("Nguyen, Linda"));

    fireEvent.click(screen.getByRole("checkbox", { name: /select nguyen, linda/i }));

    // Click "Mark Cleared" to enter confirm state
    fireEvent.click(screen.getByRole("button", { name: /mark selected cases as cleared/i }));
    // Confirm button appears inline
    const confirmBtn = await screen.findByRole("button", { name: /^Confirm$/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockBulkMarkCleared).toHaveBeenCalledWith({ caseIds: [1] });
    });
  });

  it("removes the row from the list immediately after a successful clear", async () => {
    mockBulkMarkCleared.mockResolvedValue({ ok: true });

    render(<OverpaidCases />);
    await waitFor(() => screen.getByText("Nguyen, Linda"));

    fireEvent.click(screen.getByRole("checkbox", { name: /select nguyen, linda/i }));
    fireEvent.click(screen.getByRole("button", { name: /mark selected cases as cleared/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^Confirm$/i }));

    // Row must disappear from the pending list without a re-fetch
    await waitFor(() => {
      expect(screen.queryByText("Nguyen, Linda")).toBeNull();
    });
  });

  it("shows an error banner when bulkMarkCleared fails", async () => {
    mockBulkMarkCleared.mockResolvedValue({ ok: false, error: "Database error on clear" });

    render(<OverpaidCases />);
    await waitFor(() => screen.getByText("Nguyen, Linda"));

    fireEvent.click(screen.getByRole("checkbox", { name: /select nguyen, linda/i }));
    fireEvent.click(screen.getByRole("button", { name: /mark selected cases as cleared/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^Confirm$/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
      expect(screen.getByRole("alert").textContent).toMatch(/database error on clear/i);
    });
  });
});

// ---------------------------------------------------------------------------
// 3. Confirm / abort — bulk remove
// ---------------------------------------------------------------------------

describe("OverpaidCases — bulk remove confirm", () => {
  it("does not call bulkRemoveFromOverpaid when the confirm is cancelled", async () => {
    render(<OverpaidCases />);
    await waitFor(() => screen.getByText("Nguyen, Linda"));

    fireEvent.click(screen.getByRole("checkbox", { name: /select nguyen, linda/i }));
    fireEvent.click(screen.getByRole("button", { name: /remove selected cases from overpaid cases/i }));

    // Cancel button appears inline
    const cancelBtn = await screen.findByRole("button", { name: /^Cancel$/i });
    fireEvent.click(cancelBtn);

    expect(mockBulkRemoveFromOverpaid).not.toHaveBeenCalled();
  });

  it("calls bulkRemoveFromOverpaid and removes the row on confirm", async () => {
    mockBulkRemoveFromOverpaid.mockResolvedValue({ ok: true });

    render(<OverpaidCases />);
    await waitFor(() => screen.getByText("Nguyen, Linda"));

    fireEvent.click(screen.getByRole("checkbox", { name: /select nguyen, linda/i }));
    fireEvent.click(screen.getByRole("button", { name: /remove selected cases from overpaid cases/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^Confirm$/i }));

    await waitFor(() => {
      expect(mockBulkRemoveFromOverpaid).toHaveBeenCalledWith({ caseIds: [1] });
    });

    // Row removed optimistically
    await waitFor(() => {
      expect(screen.queryByText("Nguyen, Linda")).toBeNull();
    });
  });

  it("shows an error banner when bulkRemoveFromOverpaid fails", async () => {
    mockBulkRemoveFromOverpaid.mockResolvedValue({ ok: false, error: "Remove failed" });

    render(<OverpaidCases />);
    await waitFor(() => screen.getByText("Nguyen, Linda"));

    fireEvent.click(screen.getByRole("checkbox", { name: /select nguyen, linda/i }));
    fireEvent.click(screen.getByRole("button", { name: /remove selected cases from overpaid cases/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^Confirm$/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
      expect(screen.getByRole("alert").textContent).toMatch(/remove failed/i);
    });
  });
});
