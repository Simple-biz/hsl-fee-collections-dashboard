// @vitest-environment jsdom
//
// Targets the three bug shapes that have caused regressions (per #458):
//
//   1. Wiring — preview summary counts come from the API response, not from
//      local fallbacks.
//   2. Optimistic UI vs server — after a successful sync the result section
//      shows the inserted/updated counts returned by the server and calls
//      onSynced.
//   3. Error handling — a failed preview fetch and a failed sync each render
//      the error banner without crashing.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import MyCaseSyncModal from "@/components/modals/MyCaseSyncModal";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const PREVIEW_RESPONSE = {
  summary: {
    fetched: 2,
    new: 1,
    changed: 0,
    unchanged: 1,
    missing: 0,
    viewed: 0,
    warnings: [],
  },
  rows: {
    source: [
      {
        clientId: 201,
        caseName: "Ellison, Carol",
        caseLink: "https://example.com/201",
        externalUrl: null,
        approvalDate: "2024-05-01",
        assignedTo: "Agent B",
        winSheetStatus: "Not Started",
        totalExpected: 9000,
        hasNotes: false,
        status: "new" as const,
        changedFields: [],
      },
      {
        clientId: 202,
        caseName: "Okafor, James",
        caseLink: "https://example.com/202",
        externalUrl: null,
        approvalDate: "2024-03-10",
        assignedTo: null,
        winSheetStatus: "Not Started",
        totalExpected: 4500,
        hasNotes: false,
        status: "unchanged" as const,
        changedFields: [],
      },
    ],
    missing: [],
  },
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    const u = String(url);
    if (u.includes("mode=preview")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(PREVIEW_RESPONSE),
      });
    }
    if (u.includes("mode=upsert")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ inserted: 1, updated: 0 }),
      });
    }
    // tags endpoint
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
    });
  }) as unknown as typeof fetch;

  // Suppress window.confirm calls (re-fetch guard)
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Wiring — preview summary from API
// ---------------------------------------------------------------------------

describe("MyCaseSyncModal — wiring", () => {
  it("renders the fetched-row count from the API after clicking Fetch", async () => {
    render(<MyCaseSyncModal dark={false} onClose={vi.fn()} onSynced={vi.fn()} />);

    // The step-pill tab also says "Fetch from MyCase" — use the last match (body button)
    const btns = screen.getAllByRole("button", { name: /fetch from mycase/i });
    fireEvent.click(btns[btns.length - 1]);

    await waitFor(() => {
      // "Rows fetched" stat from summary.fetched = 2
      expect(screen.getByText("2")).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Sync result — inserted/updated counts and onSynced called
// ---------------------------------------------------------------------------

describe("MyCaseSyncModal — sync result", () => {
  it("shows inserted/updated counts and calls onSynced after a successful sync", async () => {
    const onSynced = vi.fn().mockResolvedValue(undefined);
    render(<MyCaseSyncModal dark={false} onClose={vi.fn()} onSynced={onSynced} />);

    // Step 1: Fetch (body button — step-pill tab has same text)
    const fetchBtns = screen.getAllByRole("button", { name: /fetch from mycase/i });
    fireEvent.click(fetchBtns[fetchBtns.length - 1]);
    await screen.findByRole("button", { name: /next: field map/i });

    // Navigate: step 1 → 2 → 3 → 4
    fireEvent.click(screen.getByRole("button", { name: /next: field map/i }));
    fireEvent.click(await screen.findByRole("button", { name: /next: compare/i }));
    fireEvent.click(await screen.findByRole("button", { name: /next: select/i }));

    // Step 4: Sync Selected (only "new" row 201 is pre-selected)
    const syncBtn = await screen.findByRole("button", { name: /sync selected/i });
    fireEvent.click(syncBtn);

    await waitFor(() => {
      expect(onSynced).toHaveBeenCalled();
    });

    // Result section: "1 new case inserted · 0 existing records updated"
    await waitFor(() => {
      expect(screen.getByText(/inserted/i)).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// 3. Error handling
// ---------------------------------------------------------------------------

describe("MyCaseSyncModal — errors", () => {
  it("shows an error banner when the preview fetch fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: "Fetch failed (500)" }),
    }) as unknown as typeof fetch;

    render(<MyCaseSyncModal dark={false} onClose={vi.fn()} onSynced={vi.fn()} />);

    const btns = screen.getAllByRole("button", { name: /fetch from mycase/i });
    fireEvent.click(btns[btns.length - 1]);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
      expect(screen.getByRole("alert").textContent).toMatch(/fetch failed/i);
    });
  });

  it("shows an error banner when the sync upsert fails", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes("mode=preview")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(PREVIEW_RESPONSE),
        });
      }
      // Upsert fails
      return Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: "Sync failed (500)" }),
      });
    }) as unknown as typeof fetch;

    const onSynced = vi.fn();
    render(<MyCaseSyncModal dark={false} onClose={vi.fn()} onSynced={onSynced} />);

    // Fetch first (body button — step-pill tab has same text)
    const fetchBtns = screen.getAllByRole("button", { name: /fetch from mycase/i });
    fireEvent.click(fetchBtns[fetchBtns.length - 1]);
    await screen.findByRole("button", { name: /next: field map/i });

    // Navigate to step 4
    fireEvent.click(screen.getByRole("button", { name: /next: field map/i }));
    fireEvent.click(await screen.findByRole("button", { name: /next: compare/i }));
    fireEvent.click(await screen.findByRole("button", { name: /next: select/i }));

    fireEvent.click(await screen.findByRole("button", { name: /sync selected/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
      expect(screen.getByRole("alert").textContent).toMatch(/sync failed/i);
    });

    expect(onSynced).not.toHaveBeenCalled();
  });
});
