/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import {
  ScoreboardSummaryCards,
  type ScoreboardSummary,
  type ScoreboardTeam,
} from "../ScoreboardSummaryCards";
import { themeClasses } from "@/lib/theme-classes";

const SUMMARY: ScoreboardSummary = {
  totalCasesAssigned: 0, totalOpenCases: 0, totalCasesClosed: 0,
  totalCompletedWinSheets: 0, totalWinSheetsCreated: 0,
  totalUnpaidT2Over60: 0, totalUnpaidT16Over60: 0, totalUnpaidConcOver60: 0,
  totalUnpaidT2Over90: 0, totalUnpaidT16Over90: 0, totalUnpaidConcOver90: 0,
  totalCollected: 0, totalFeesCollectedInWindow: 0, totalCasesFullFee: 0,
  totalSsaCalls: 0, totalClientCalls: 0,
};

// The whole bug in fixture form: the window figure and the week figure differ,
// so rendering the wrong one is visible.
const T2: ScoreboardTeam = {
  team: "T2",
  agentCount: 8,
  casesAssigned: 0,
  openCases: 174,
  casesClosed: 6,          // one day — the page window
  completedWinSheets: 0,
  winSheetsCreated: 5,
  unpaidT2Over60: 0, unpaidT16Over60: 0, unpaidConcOver60: 0,
  totalCollected: 999_999,
  feesCollectedInWindow: 1_234,   // same window as casesClosed
  feesToday: 4_321,
  feesThisWeek: 79_458,           // a DIFFERENT window — must not be shown
  feesThisMonth: 5_555,
  casesFullFee: 0,
  ssaCalls: 7,
  clientCalls: 6,
};

const renderCards = (
  windowMode: "today" | "week" | "month" | "alltime" | null,
  onWindowChange = vi.fn(),
) => {
  const utils = render(
    <ScoreboardSummaryCards
      summary={SUMMARY}
      teams={[T2]}
      label="Fri Aug 7"
      dark={false}
      t={themeClasses(false)}
      showMiniCards={false}
      windowMode={windowMode}
      onWindowChange={onWindowChange}
    />,
  );
  return { ...utils, onWindowChange };
};

describe("ScoreboardSummaryCards — By Team window", () => {
  afterEach(cleanup);

  it("shows the window-scoped fees figure, never a differently-windowed one", () => {
    renderCards("today");
    // $1,234 covers the same period as the other tiles
    expect(screen.getByText(/1,234/)).toBeTruthy();
    // the week figure belongs to a different period and must not appear
    expect(screen.queryByText(/79,458/)).toBeNull();
  });

  it("derives the highlighted preset from the window in effect", () => {
    renderCards("today");
    expect(screen.getByRole("button", { name: "Today" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Week" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("highlights nothing when the window matches no preset", () => {
    renderCards(null);
    for (const name of ["Today", "Week", "Month", "All Time"]) {
      expect(screen.getByRole("button", { name }).getAttribute("aria-pressed")).toBe("false");
    }
  });

  it("asks the page to change window rather than keeping its own period", () => {
    const { onWindowChange } = renderCards("today");
    fireEvent.click(screen.getByRole("button", { name: "Month" }));
    expect(onWindowChange).toHaveBeenCalledWith("month");
  });

  it("states the window it is showing, so the period is never implicit", () => {
    renderCards("today");
    expect(screen.getByText(/By Team/).textContent).toContain("Fri Aug 7");
  });
});

describe("ScoreboardSummaryCards — refetch feedback", () => {
  afterEach(cleanup);

  it("says it is updating and marks the figures busy while a window loads", () => {
    render(
      <ScoreboardSummaryCards
        summary={SUMMARY} teams={[T2]} label="Week" dark={false}
        t={themeClasses(false)} showMiniCards={false}
        windowMode="week" onWindowChange={vi.fn()} loading
      />,
    );
    expect(screen.getByText(/Updating/)).toBeTruthy();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it("keeps the previous figures on screen rather than blanking them", () => {
    render(
      <ScoreboardSummaryCards
        summary={SUMMARY} teams={[T2]} label="Week" dark={false}
        t={themeClasses(false)} showMiniCards={false}
        windowMode="week" onWindowChange={vi.fn()} loading
      />,
    );
    // 174 open cases is still readable mid-refetch — a spinner replacing the
    // cards would make them jump on every toggle click.
    expect(screen.getByText("174")).toBeTruthy();
  });

  it("shows no updating hint when idle", () => {
    render(
      <ScoreboardSummaryCards
        summary={SUMMARY} teams={[T2]} label="Week" dark={false}
        t={themeClasses(false)} showMiniCards={false}
        windowMode="week" onWindowChange={vi.fn()}
      />,
    );
    expect(screen.queryByText(/Updating/)).toBeNull();
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
  });
});
