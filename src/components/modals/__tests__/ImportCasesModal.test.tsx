// @vitest-environment jsdom
//
// Targets the three bug shapes that have caused regressions (per #458):
//
//   1. Wiring — preview summary counts (new / duplicates) come from the API
//      response, not from local fallbacks.
//   2. Optimistic UI vs server — after a successful import the result section
//      shows the inserted count returned by the server and calls onImported.
//   3. Error handling — a failed preview fetch and a failed import each render
//      the error banner without crashing.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import ImportCasesModal from "@/components/modals/ImportCasesModal";

// ---------------------------------------------------------------------------
// Shared fixture
// ---------------------------------------------------------------------------

const PREVIEW_RESPONSE = {
  summary: { parsed: 3, new: 2, duplicates: 1, warnings: [] },
  rows: [
    {
      clientId: 101,
      caseName: "Freeman, Walter",
      caseLink: "https://example.com/101",
      externalUrl: null,
      approvalDate: "2024-03-01",
      assignedTo: "Agent A",
      winSheetStatus: "Not Started",
      winSheetLink: null,
      winSheetLinkText: null,
      levelWon: null,
      claimType: "t2",
      totalExpected: 7000,
      hasNotes: false,
      isDuplicate: false,
    },
    {
      clientId: 102,
      caseName: "Park, Soo-Jin",
      caseLink: "https://example.com/102",
      externalUrl: null,
      approvalDate: null,
      assignedTo: null,
      winSheetStatus: "Not Started",
      winSheetLink: null,
      winSheetLinkText: null,
      levelWon: null,
      claimType: null,
      totalExpected: 0,
      hasNotes: false,
      isDuplicate: true,
    },
  ],
};

function makeFile(name = "cases.xlsx") {
  return new File(["data"], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** Simulate selecting a file via the hidden file input and wait for preview. */
async function uploadFile(container: HTMLElement, file: File) {
  const input = container.querySelector('input[type="file"]')!;
  Object.defineProperty(input, "files", {
    value: { 0: file, length: 1, item: (i: number) => (i === 0 ? file : null) },
    configurable: true,
  });
  fireEvent.change(input);
}

/** Navigate from step 1 through to step 4 via the Next buttons. */
async function advanceToStep4() {
  // Step 1 → 2
  fireEvent.click(await screen.findByRole("button", { name: /next: map columns/i }));
  // Step 2 → 3
  fireEvent.click(await screen.findByRole("button", { name: /next: compare/i }));
  // Step 3 → 4
  fireEvent.click(await screen.findByRole("button", { name: /next: select/i }));
}

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
    if (u.includes("mode=append")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ inserted: 1, activityLogEntries: 1 }),
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
// 1. Wiring — preview summary from API
// ---------------------------------------------------------------------------

describe("ImportCasesModal — wiring", () => {
  it("renders the preview summary counts from the API after file selection", async () => {
    const { container } = render(
      <ImportCasesModal dark={false} onClose={vi.fn()} onImported={vi.fn()} />,
    );

    await uploadFile(container, makeFile());

    await waitFor(() => {
      // "New" count from summary.new
      expect(screen.getByText("2")).toBeTruthy();
      // "Duplicates" count from summary.duplicates
      expect(screen.getByText("1")).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Import result — inserted count and onImported called
// ---------------------------------------------------------------------------

describe("ImportCasesModal — import result", () => {
  it("shows the inserted count and calls onImported after a successful append", async () => {
    const onImported = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <ImportCasesModal dark={false} onClose={vi.fn()} onImported={onImported} />,
    );

    await uploadFile(container, makeFile());
    // Wait for preview to load (Next button becomes enabled)
    await screen.findByRole("button", { name: /next: map columns/i });

    await advanceToStep4();

    // "Import Selected" button should be visible and enabled (selected = [101] — the non-duplicate)
    const importBtn = await screen.findByRole("button", { name: /import selected/i });
    fireEvent.click(importBtn);

    await waitFor(() => {
      expect(onImported).toHaveBeenCalled();
    });

    // Result section should show the inserted count
    await waitFor(() => {
      expect(screen.getByText(/imported 1 case/i)).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// 3. Error handling
// ---------------------------------------------------------------------------

describe("ImportCasesModal — errors", () => {
  it("shows an error banner when the preview fetch fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: "Preview failed (500)" }),
    }) as unknown as typeof fetch;

    const { container } = render(
      <ImportCasesModal dark={false} onClose={vi.fn()} onImported={vi.fn()} />,
    );

    await uploadFile(container, makeFile());

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
      expect(screen.getByRole("alert").textContent).toMatch(/preview failed/i);
    });
  });

  it("shows an error banner when the import fetch fails", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes("mode=preview")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(PREVIEW_RESPONSE),
        });
      }
      // Import fails
      return Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: "Import failed (500)" }),
      });
    }) as unknown as typeof fetch;

    const { container } = render(
      <ImportCasesModal dark={false} onClose={vi.fn()} onImported={vi.fn()} />,
    );

    await uploadFile(container, makeFile());
    await screen.findByRole("button", { name: /next: map columns/i });

    await advanceToStep4();

    const importBtn = await screen.findByRole("button", { name: /import selected/i });
    fireEvent.click(importBtn);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
      expect(screen.getByRole("alert").textContent).toMatch(/import failed/i);
    });
  });
});
