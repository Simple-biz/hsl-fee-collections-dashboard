// @vitest-environment jsdom
//
// Targets the three bug shapes that have caused regressions (per #458):
//
//   1. Wiring — the claimant name in the result card must come from the API
//      response, not from local state or fallbacks.
//   2. Optimistic UI vs server — a successful pull renders the result card
//      immediately; a server error shows the error banner without rendering
//      any result.
//   3. Error handling — the error banner appears on a failed pull fetch.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

import { ChroniclePull } from "@/components/chronicle/ChroniclePull";

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const PULL_RESPONSE = {
  parsed: {
    chronicleClientId: 112221,
    externalId: "EX-001",
    firstName: "Patricia",
    lastName: "Walsh",
    last4Ssn: "7890",
    dob: null,
    claimType: "T2",
    claimTypeRaw: ["T2"],
    reportType: "All",
    officeWithJurisdiction: "Atlanta, GA",
    statusOfCase: "Closed",
    statusDate: null,
    applicationDate: null,
    allegedOnset: null,
    receiptDate: null,
    closureDate: null,
    lastChange: null,
    hearingRequestDate: null,
    hearingScheduledDate: null,
    hearingHeldDate: null,
    aljName: null,
    hearingTimezone: null,
    t2Decision: "Fully Favorable",
    t16Decision: null,
    isFavorable: true,
    favorableTypes: ["Fully Favorable"],
    isUnfavorable: false,
    decisionPending: false,
    caseLevel: "ALJ",
    allFileLink: null,
  },
  existsInDb: false,
  matchedClientId: null,
  usingMock: false,
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    const u = String(url);
    if (u.includes("/api/chronicle/pull")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(PULL_RESPONSE),
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
// Helpers
// ---------------------------------------------------------------------------

function typeClientId(id: string) {
  const input = screen.getByPlaceholderText(/enter chronicle client id/i);
  fireEvent.change(input, { target: { value: id } });
}

function clickPull() {
  fireEvent.click(screen.getByRole("button", { name: /^pull$/i }));
}

// ---------------------------------------------------------------------------
// 1. Wiring
// ---------------------------------------------------------------------------

describe("ChroniclePull — wiring", () => {
  it("renders the client name from the API pull response", async () => {
    render(<ChroniclePull />);

    typeClientId("112221");
    clickPull();

    await waitFor(() => {
      // infoRow renders the name in two spans (result card + pull history)
      expect(screen.getAllByText("Walsh, Patricia").length).toBeGreaterThan(0);
    });
  });

  it("renders the chronicle client ID from the API response", async () => {
    render(<ChroniclePull />);

    typeClientId("112221");
    clickPull();

    await waitFor(() => {
      // Chronicle ID shown in the result card info grid
      expect(screen.getByText("112221")).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Result on success / no result on error
// ---------------------------------------------------------------------------

describe("ChroniclePull — result card visibility", () => {
  it("shows the result card after a successful pull", async () => {
    render(<ChroniclePull />);

    typeClientId("112221");
    clickPull();

    // The decision banner text comes from isFavorable
    await waitFor(() => {
      expect(screen.getByText(/favorable decision/i)).toBeTruthy();
    });
  });

  it("does not render the result card when pull fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: "Client not found" }),
    }) as unknown as typeof fetch;

    render(<ChroniclePull />);

    typeClientId("999999");
    clickPull();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });

    // No result card — "Walsh, Patricia" should not appear
    expect(screen.queryByText("Walsh, Patricia")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. Error handling
// ---------------------------------------------------------------------------

describe("ChroniclePull — errors", () => {
  it("shows an error banner when the pull fetch returns a non-OK response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: "Chronicle service unavailable" }),
    }) as unknown as typeof fetch;

    render(<ChroniclePull />);

    typeClientId("112221");
    clickPull();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
      expect(screen.getByRole("alert").textContent).toMatch(/chronicle service unavailable/i);
    });
  });

  it("shows an error banner when the pull fetch rejects entirely", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error")) as unknown as typeof fetch;

    render(<ChroniclePull />);

    typeClientId("112221");
    clickPull();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
      expect(screen.getByRole("alert").textContent).toMatch(/network error/i);
    });
  });
});
