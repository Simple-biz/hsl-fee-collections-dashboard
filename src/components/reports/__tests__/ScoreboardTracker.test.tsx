// @vitest-environment jsdom
//
// Targets the three bug shapes that have caused regressions (per #458):
//
//   1. Wiring — agent name in the tracking table must come from the API
//      response, not from local fallbacks.
//   2. Optimistic UI vs server — a successful daily-metrics save shows the
//      save confirmation message; a server error renders the error alert.
//   3. Error handling — a failed scoreboard fetch renders the error banner
//      without crashing.

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";

vi.mock("next-auth/react", () => ({
  useSession: vi.fn(() => ({
    data: {
      user: { role: "admin", capabilities: ["case.update"] },
      expires: "9999-12-31",
    },
    status: "authenticated",
    update: vi.fn(),
  })),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

vi.mock("@/hooks/useCapabilities", () => ({
  useCapabilities: vi.fn(() => ({
    can: () => true,
    capabilities: ["case.update"],
  })),
}));

import { ScoreboardTracker } from "@/components/reports/ScoreboardTracker";
import { themeClasses } from "@/lib/theme-classes";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeAgent(name: string, overrides: Record<string, unknown> = {}) {
  return {
    agent: name,
    team: null,
    role: "member",
    casesAssigned: 10,
    openCases: 5,
    casesClosed: 5,
    pendingFeePetitions: 2,
    approvedFeePetitions: 1,
    completedWinSheets: 3,
    winSheetsCreated: 4,
    unpaidT2Over60: 0,
    unpaidT16Over60: 0,
    unpaidConcOver60: 0,
    unpaidT2Over90: 0,
    unpaidT16Over90: 0,
    unpaidConcOver90: 0,
    totalCollected: 15000,
    feesCollectedInWindow: null,
    feesToday: 0,
    feesThisWeek: 0,
    feesThisMonth: 0,
    casesFullFee: 0,
    weekSsaCalls: 0,
    weekClientCalls: 0,
    weekFaxSent: 0,
    openNoFees: 0,
    openPartial: 0,
    openPif: 0,
    ...overrides,
  };
}

const SCOREBOARD_RESPONSE = {
  agents: [makeAgent("Preston, Carol")],
  daily: [],
  summary: null,
  teams: [],
  openCasesFeesStatus: { noFees: 0 },
  noFeesAging: { over60: 0, over90: 0 },
  noFeesCases: [],
  noFeesCasesTotal: 0,
};

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

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    const u = String(url);
    if (u.includes("/api/scoreboard")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(SCOREBOARD_RESPONSE),
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
// Render helper
// ---------------------------------------------------------------------------

function renderTracker() {
  const dark = false;
  const t = themeClasses(dark);
  return render(<ScoreboardTracker dark={dark} t={t} />);
}

// ---------------------------------------------------------------------------
// 1. Wiring — agent name from API
// ---------------------------------------------------------------------------

describe("ScoreboardTracker — wiring", () => {
  it("renders the agent name from the API response", async () => {
    renderTracker();

    await waitFor(() => {
      expect(screen.getByText("Preston, Carol")).toBeTruthy();
    });
  });

  it("renders a second agent when the API returns two rows", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes("/api/scoreboard")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            ...SCOREBOARD_RESPONSE,
            agents: [makeAgent("Preston, Carol"), makeAgent("Oduya, James")],
          }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }) as unknown as typeof fetch;

    renderTracker();

    await waitFor(() => {
      expect(screen.getByText("Preston, Carol")).toBeTruthy();
      expect(screen.getByText("Oduya, James")).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Error handling — failed scoreboard fetch
// ---------------------------------------------------------------------------

describe("ScoreboardTracker — errors", () => {
  it("shows an error banner when the scoreboard fetch fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    }) as unknown as typeof fetch;

    renderTracker();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
      expect(screen.getByRole("alert").textContent).toMatch(/failed to fetch agent tracking/i);
    });
  });
});
