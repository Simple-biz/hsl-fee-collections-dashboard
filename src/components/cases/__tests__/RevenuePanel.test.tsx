/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { RevenuePanel } from "../RevenuePanel";
import type { CaseRow, DashboardSummary } from "@/types";

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

const CASE: CaseRow = {
  id: 1,
  name: "Watson, Katrina",
  externalId: null,
  chronicleId: null,
  assigned: "Test Agent",
  level: "HEARING",
  claim: "T16",
  date: "2026-01-15",
  status: "not_started",
  createdAt: "2026-01-15T00:00:00.000Z",
  t16Retro: 10000, t16FeeDue: 2500, t16FeeReceived: 0, t16Pending: 2500, t16FeeReceivedDate: null,
  t2Retro: 0,    t2FeeDue: null,   t2FeeReceived: 0,  t2Pending: 0,    t2FeeReceivedDate: null,
  auxRetro: 0,   auxFeeDue: null,  auxFeeReceived: 0, auxPending: 0,   auxFeeReceivedDate: null,
  totalRetroDue: 10000,
  expected: 2500,
  paid: 0,
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
};

describe("RevenuePanel — window toggle", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("defaults to All Time: lifetime paid total, collection rate, no fetch", () => {
    render(<RevenuePanel stats={SUMMARY} cases={[CASE]} />);
    expect(screen.getByRole("button", { name: "All Time" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/44\.6%/)).toBeTruthy();
    expect(screen.getByText("Expected")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetches the windowed total when a narrower preset is clicked", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ window: "month", claims: [{ claim: "T2", collected: 12_400 }, { claim: "T16", collected: 3_100 }] }),
    });
    render(<RevenuePanel stats={SUMMARY} cases={[CASE]} />);

    fireEvent.click(screen.getByRole("button", { name: "Month" }));

    expect(fetch).toHaveBeenCalledWith("/api/revenue-by-claim-type?window=month", expect.anything());
    await waitFor(() => expect(screen.getByText(/Collected — Month/)).toBeTruthy());
    expect(screen.getByText(/15,500/)).toBeTruthy(); // windowed total = 12,400 + 3,100
    // "Expected" legend disappears — there's nothing windowed to pair it with.
    expect(screen.queryByText("Expected")).toBeNull();
  });

  it("shows an alert and keeps the toggle usable when the fetch fails", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, status: 500 });
    render(<RevenuePanel stats={SUMMARY} cases={[CASE]} />);

    fireEvent.click(screen.getByRole("button", { name: "Week" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toContain("500");
  });

  it("switching back to All Time drops the fetched window without refetching", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ window: "today", claims: [{ claim: "T2", collected: 900 }] }),
    });
    render(<RevenuePanel stats={SUMMARY} cases={[CASE]} />);

    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    await waitFor(() => expect(screen.getByText(/Collected — Today/)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "All Time" }));
    expect(screen.getByText(/44\.6%/)).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
