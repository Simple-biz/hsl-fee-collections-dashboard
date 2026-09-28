// @vitest-environment jsdom
//
// Targets the three bug shapes that have caused regressions (per #458):
//
//   1. Wiring — preview summary counts ("Rows fetched") come from the API,
//      not from local fallbacks.
//   2. Optimistic UI vs server — after a successful sync the result state is
//      set and onSynced is called.
//   3. Error handling — a failed main preview fetch and a failed sync each
//      render the error banner without crashing.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import SheetSyncModal from "@/components/modals/SheetSyncModal";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SHEET_PREVIEW_RESPONSE = {
  usingMock: false,
  summary: {
    fetched: 5,
    new: 1,
    changed: 0,
    unchanged: 4,
    feesClosed: 0,
    missing: 0,
    missingClosed: 0,
    synthetic: 0,
    needsLink: 0,
    warnings: [],
  },
  rows: {
    sheet: [
      {
        clientId: 301,
        caseName: "Brennan, Kevin",
        caseLink: "https://example.com/301",
        externalUrl: null,
        approvalDate: "2024-06-01",
        assignedTo: "Agent C",
        winSheetStatus: "Not Started",
        winSheetLink: null,
        winSheetLinkText: null,
        totalExpected: 8500,
        hasNotes: false,
        isSynthetic: false,
        status: "new" as const,
        changedFields: [],
      },
    ],
    feesClosed: [],
    missing: [],
    missingClosed: [],
    needsLink: [],
  },
};

const FC_PREVIEW_RESPONSE = {
  usingMock: false,
  summary: { fetched: 0, matchedInDb: 0, unmatchedInDb: 0, warnings: [] },
  rows: [],
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    const u = String(url);
    if (u.includes("sheets/sync") && u.includes("mode=preview")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(SHEET_PREVIEW_RESPONSE),
      });
    }
    if (u.includes("fees-closed/sync") && u.includes("mode=preview")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(FC_PREVIEW_RESPONSE),
      });
    }
    if (u.includes("sheets/sync") && u.includes("mode=upsert")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ inserted: 1, updated: 0, closed: 0 }),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  }) as unknown as typeof fetch;

  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Click the body "Fetch from Sheets" button (step-pill tab has same text). */
function clickFetch() {
  const btns = screen.getAllByRole("button", { name: /fetch from sheets/i });
  fireEvent.click(btns[btns.length - 1]);
}

/** Navigate from step 1 → 4 via the Next buttons. */
async function advanceToStep4() {
  fireEvent.click(await screen.findByRole("button", { name: /next: map columns/i }));
  fireEvent.click(await screen.findByRole("button", { name: /next: compare/i }));
  fireEvent.click(await screen.findByRole("button", { name: /next: select/i }));
}

// ---------------------------------------------------------------------------
// 1. Wiring — preview summary from API
// ---------------------------------------------------------------------------

describe("SheetSyncModal — wiring", () => {
  it("renders the fetched-row count from the API after clicking Fetch", async () => {
    render(<SheetSyncModal dark={false} onClose={vi.fn()} onSynced={vi.fn()} />);

    clickFetch();

    await waitFor(() => {
      // "Rows fetched" stat from summary.fetched = 5
      expect(screen.getByText("5")).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Sync result — onSynced called after success
// ---------------------------------------------------------------------------

describe("SheetSyncModal — sync result", () => {
  it("calls onSynced after a successful sync", async () => {
    const onSynced = vi.fn().mockResolvedValue(undefined);
    render(<SheetSyncModal dark={false} onClose={vi.fn()} onSynced={onSynced} />);

    clickFetch();
    // Wait for preview to arrive (Next button becomes enabled)
    await screen.findByRole("button", { name: /next: map columns/i });

    await advanceToStep4();

    // "Sync (1)" button — 1 new row pre-selected
    const syncBtn = await screen.findByRole("button", { name: /^sync \(/i });
    fireEvent.click(syncBtn);

    await waitFor(() => {
      expect(onSynced).toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// 3. Error handling
// ---------------------------------------------------------------------------

describe("SheetSyncModal — errors", () => {
  it("shows an error banner when the main preview fetch fails", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes("sheets/sync") && u.includes("mode=preview")) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: "Sheets fetch failed (500)" }),
        });
      }
      // fees-closed preview can succeed; main failure is what matters
      return Promise.resolve({ ok: true, json: () => Promise.resolve(FC_PREVIEW_RESPONSE) });
    }) as unknown as typeof fetch;

    render(<SheetSyncModal dark={false} onClose={vi.fn()} onSynced={vi.fn()} />);

    clickFetch();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
      expect(screen.getByRole("alert").textContent).toMatch(/sheets fetch failed/i);
    });
  });

  it("shows an error banner when the sync upsert fails", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes("mode=preview")) {
        if (u.includes("sheets/sync")) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(SHEET_PREVIEW_RESPONSE) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve(FC_PREVIEW_RESPONSE) });
      }
      // Upsert fails
      return Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: "Sync failed (500)" }),
      });
    }) as unknown as typeof fetch;

    const onSynced = vi.fn();
    render(<SheetSyncModal dark={false} onClose={vi.fn()} onSynced={onSynced} />);

    clickFetch();
    await screen.findByRole("button", { name: /next: map columns/i });

    await advanceToStep4();

    fireEvent.click(await screen.findByRole("button", { name: /^sync \(/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
      expect(screen.getByRole("alert").textContent).toMatch(/sync failed/i);
    });

    expect(onSynced).not.toHaveBeenCalled();
  });
});
