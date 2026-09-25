// @vitest-environment jsdom
//
// Targets the three bug shapes that have caused regressions (per #458):
//
//   1. Wiring — case name must render from the API response, not from a local
//      fallback or stale state.
//   2. Optimistic UI vs server — after a successful save the editing state
//      exits and fetchCase is re-called; a save error surfaces the saveError
//      banner without exiting editing.
//   3. Error handling — a failed case fetch renders the error banner without
//      crashing.

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({
    replace: vi.fn(), push: vi.fn(), back: vi.fn(),
    forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(),
  })),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

vi.mock("@/hooks/useCapabilities", () => ({
  useCapabilities: vi.fn(() => ({
    can: () => true,
    capabilities: ["case.update", "fees.edit"],
  })),
}));

import CaseDetailSheet from "@/components/cases/CaseDetailSheet";

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const CASE_RESPONSE = {
  data: {
    id: 42,
    name: "Holloway, Grant",
    claim: "T2",
    level: "ALJ",
    externalId: "EX-042",
    approvalDate: "2024-04-15",
    t2Decision: "Fully Favorable",
    t16Decision: null,
    assignedTo: "Agent D",
    region: null,
    ssnLast4: "1234",
    t2Retro: 12000,
    t2FeeDue: 3000,
    t2FeeReceived: 0,
    t2FeeReceivedDate: null,
    t16Retro: 0,
    t16FeeDue: null,
    t16FeeReceived: 0,
    t16FeeReceivedDate: null,
    auxRetro: 0,
    auxFeeDue: null,
    auxFeeReceived: 0,
    auxFeeReceivedDate: null,
    feesConfirmation: null,
    status: "open",
    userDetails: {
      chronicleId: null,
      note: "",
      assignedTo: "Agent D",
      approvedBy: null,
      dateAssignedToAgent: null,
    },
  },
};

const MYCASE_RESPONSE = {
  caseStage: "Post-Hearing",
  approvalDate: null,
  assignedTo: null,
  winSheetStatus: "Not Started",
  claimTypeLabel: null,
};

// ---------------------------------------------------------------------------
// Browser-global stubs
// ---------------------------------------------------------------------------

beforeAll(() => {
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn(),
  })) as unknown as typeof ResizeObserver;
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((q: string) => ({
      matches: false, media: q, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    const u = String(url);
    if (u.includes("/api/cases/") && !u.includes("mycase")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(CASE_RESPONSE),
      });
    }
    if (u.includes("mycase/cases/")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(MYCASE_RESPONSE),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  }) as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Default render helper (isOpen=true required to mount content)
// ---------------------------------------------------------------------------

function renderSheet(overrides?: Parameters<typeof CaseDetailSheet>[0]) {
  return render(
    <CaseDetailSheet
      caseId={42}
      isOpen={true}
      onClose={vi.fn()}
      {...overrides}
    />,
  );
}

// ---------------------------------------------------------------------------
// 1. Wiring — case name from API
// ---------------------------------------------------------------------------

describe("CaseDetailSheet — wiring", () => {
  it("renders the case name from the API response", async () => {
    renderSheet();

    await waitFor(() => {
      expect(screen.getByText("Holloway, Grant")).toBeTruthy();
    });
  });

  it("renders the correct case ID in the fetch URL", async () => {
    renderSheet({ caseId: 99 });

    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const caseCall = calls.find(([url]: [string]) => String(url).includes("/api/cases/99"));
      expect(caseCall).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Error handling — failed case fetch
// ---------------------------------------------------------------------------

describe("CaseDetailSheet — errors", () => {
  it("shows an error banner when the case fetch fails", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes("/api/cases/") && !u.includes("mycase")) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({}),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }) as unknown as typeof fetch;

    renderSheet();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
      expect(screen.getByRole("alert").textContent).toMatch(/failed to load case details/i);
    });
  });
});

// ---------------------------------------------------------------------------
// 3. Save — error banner on failed PATCH
// ---------------------------------------------------------------------------

describe("CaseDetailSheet — save", () => {
  it("exits editing mode and re-fetches after a successful PATCH", async () => {
    let fetchCount = 0;
    global.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      const u = String(url);
      if (opts?.method === "PATCH") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        });
      }
      if (u.includes("/api/cases/") && !u.includes("mycase")) {
        fetchCount++;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(CASE_RESPONSE),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }) as unknown as typeof fetch;

    renderSheet();
    await waitFor(() => screen.getByText("Holloway, Grant"));
    const initialFetchCount = fetchCount;

    fireEvent.click(screen.getByRole("button", { name: /edit local details/i }));

    const externalIdInput = screen.getByDisplayValue("EX-042");
    fireEvent.change(externalIdInput, { target: { value: "EX-999" } });

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    // Edit mode exits — "Edit local details" button reappears
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /edit local details/i })).toBeTruthy();
    });

    // fetchCase was called again after the save
    expect(fetchCount).toBeGreaterThan(initialFetchCount);
  });

  it("shows a save error banner when the PATCH fails", async () => {
    global.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      const u = String(url);
      if (opts?.method === "PATCH") {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: "Database write failed" }),
        });
      }
      if (u.includes("/api/cases/") && !u.includes("mycase")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(CASE_RESPONSE),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }) as unknown as typeof fetch;

    renderSheet();

    // Wait for data to load
    await waitFor(() => screen.getByText("Holloway, Grant"));

    // Enter editing mode
    fireEvent.click(screen.getByRole("button", { name: /edit local details/i }));

    // Change a field so handleSave won't early-return (externalId: "EX-042" → "EX-999")
    const externalIdInput = screen.getByDisplayValue("EX-042");
    fireEvent.change(externalIdInput, { target: { value: "EX-999" } });

    // Attempt save
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      const alerts = screen.getAllByRole("alert");
      const saveAlert = alerts.find((el) => el.textContent?.match(/database write failed/i));
      expect(saveAlert).toBeTruthy();
    });
  });
});
