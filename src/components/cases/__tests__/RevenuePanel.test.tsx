/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { RevenuePanel } from "../RevenuePanel";
import type { CaseRow, DashboardSummary, TeamMember } from "@/types";

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

const SUMMARY: DashboardSummary = {
  totalCases: 10,
  expected: 838_486.81,
  paid: 373_923,
  outstanding: 464_563.81,
  pif: 2,
  syncErrors: 0,
  synced: 10,
  feesCollectedMTD: 0,
  casesClosedMTD: 0,
};

const TEAM: TeamMember[] = [
  { name: "Cora", role: "collections_specialist", team: "T2", cases: 1, collected: "0" },
  { name: "Bree", role: "collections_specialist", team: "T16", cases: 1, collected: "0" },
];

const caseWith = (id: number, assigned: string, expected: number, paid: number): CaseRow => ({
  id,
  name: `Case ${id}`,
  externalId: null,
  chronicleId: null,
  assigned,
  level: "HEARING",
  claim: "T16",
  date: "2026-01-15",
  status: "not_started",
  createdAt: "2026-01-15T00:00:00.000Z",
  t16Retro: 10000, t16FeeDue: expected, t16FeeReceived: paid, t16Pending: 0, t16FeeReceivedDate: null,
  t2Retro: 0,    t2FeeDue: null,   t2FeeReceived: 0,  t2Pending: 0,    t2FeeReceivedDate: null,
  auxRetro: 0,   auxFeeDue: null,  auxFeeReceived: 0, auxPending: 0,   auxFeeReceivedDate: null,
  totalRetroDue: 10000,
  expected,
  paid,
  pif: null,
  approvedBy: null,
  feesConfirmation: null,
  feesClosedTrigger: null,
  caseStatus: null,
  nextFollowUpDate: null,
  isClosed: false,
  markedOverpaid: false,
  closedAt: null,
  update: "",
  sync: "synced",
  daysAfterApproval: 30,
  approvalCategory: null,
  feesStatus: null,
  weekAssignedToAgent: null,
  monthAssignedToAgent: null,
  office: "Test Office",
  notesCount: 0,
  leaderNotesCount: 0,
  caseLink: null,
  winSheetLink: null,
  winSheetLinkText: null,
});

const CASES: CaseRow[] = [
  caseWith(1, "Cora", 792_636, 499_500),   // T2 team
  caseWith(2, "Bree", 300_656, 656),        // T16 team
  caseWith(3, "Nobody", 50_000, 10_000),    // not in team roster — excluded
];

describe("RevenuePanel — groups by team, not claim type", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("defaults to All Time: aggregates Expected/Collected by each case's assigned agent's team", () => {
    render(<RevenuePanel stats={SUMMARY} cases={CASES} team={TEAM} />);
    expect(screen.getByText("Revenue by Team")).toBeTruthy();
    expect(screen.getByText("T2 Team")).toBeTruthy();
    expect(screen.getByText("T16 Team")).toBeTruthy();
    // Case 1 (Cora → T2) contributes $792,636 expected to the T2 bar.
    expect(screen.getByText(/792,636/)).toBeTruthy();
    // Case 3's agent isn't on the roster — excluded, not folded into any team.
    expect(screen.queryByText(/50,000/)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetches the windowed team totals when a narrower preset is clicked", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ window: "month", teams: [{ team: "T2", collected: 12_400 }, { team: "T16", collected: 3_100 }] }),
    });
    render(<RevenuePanel stats={SUMMARY} cases={CASES} team={TEAM} />);

    fireEvent.click(screen.getByRole("button", { name: "Month" }));

    expect(fetch).toHaveBeenCalledWith("/api/revenue-by-team?window=month", expect.anything());
    await waitFor(() => expect(screen.getByText(/Collected — Month/)).toBeTruthy());
    expect(screen.getByText(/15,500/)).toBeTruthy(); // 12,400 + 3,100
    expect(screen.queryByText("Expected")).toBeNull();
  });

  it("re-sorts a windowed response into TEAM_ORDER regardless of the API's own row order", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      // Deliberately out of order — SQL's GROUP BY gives no ordering guarantee.
      json: async () => ({
        window: "month",
        teams: [
          { team: "Concurrent", collected: 1 },
          { team: "T16", collected: 2 },
          { team: "T2", collected: 3 },
        ],
      }),
    });
    render(<RevenuePanel stats={SUMMARY} cases={CASES} team={TEAM} />);

    fireEvent.click(screen.getByRole("button", { name: "Month" }));
    await waitFor(() => expect(screen.getByText(/Collected — Month/)).toBeTruthy());

    const labels = screen.getAllByText(/^(T2|T16|Concurrent) Team$/).map((el) => el.textContent);
    expect(labels).toEqual(["T2 Team", "T16 Team", "Concurrent Team"]);
  });

  it("shows an alert when the windowed fetch fails", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, status: 500 });
    render(<RevenuePanel stats={SUMMARY} cases={CASES} team={TEAM} />);

    fireEvent.click(screen.getByRole("button", { name: "Week" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toContain("500");
  });

  it("switching back to All Time drops the fetched window without refetching", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ window: "today", teams: [{ team: "T2", collected: 900 }] }),
    });
    render(<RevenuePanel stats={SUMMARY} cases={CASES} team={TEAM} />);

    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    await waitFor(() => expect(screen.getByText(/Collected — Today/)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "All Time" }));
    expect(screen.getByText(/44\.6%/)).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
