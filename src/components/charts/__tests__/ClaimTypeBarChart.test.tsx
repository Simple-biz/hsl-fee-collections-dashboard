/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ClaimTypeBarChart } from "../ClaimTypeBarChart";
import type { CaseRow } from "@/types";

const BASE_CASE: CaseRow = {
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

const caseWith = (overrides: Partial<CaseRow>): CaseRow => ({ ...BASE_CASE, ...overrides });

describe("ClaimTypeBarChart — All Time (cases prop)", () => {
  afterEach(cleanup);

  it("aggregates expected/paid per claim type and shows both bars' labels", () => {
    render(
      <ClaimTypeBarChart
        cases={[
          caseWith({ id: 1, claim: "T16", expected: 300_656, paid: 656 }),
          caseWith({ id: 2, claim: "T2", expected: 792_636, paid: 499_500 }),
        ]}
      />,
    );
    expect(screen.getByText("T16")).toBeTruthy();
    expect(screen.getByText("T2")).toBeTruthy();
    expect(screen.getByText(/300,656/)).toBeTruthy();
    expect(screen.getByText(/792,636/)).toBeTruthy();
  });

  it("skips cases with no claim type", () => {
    render(<ClaimTypeBarChart cases={[caseWith({ claim: "—" })]} />);
    expect(screen.getByText(/No claim-type data yet/)).toBeTruthy();
  });
});

describe("ClaimTypeBarChart — windowed (collected-only)", () => {
  afterEach(cleanup);

  it("renders a single Collected bar per claim type, no Expected pair", () => {
    const { container } = render(
      <ClaimTypeBarChart
        cases={[]}
        windowedClaims={[
          { claim: "T2", collected: 12_400 },
          { claim: "T16", collected: 3_100 },
        ]}
      />,
    );
    expect(screen.getByText("T2")).toBeTruthy();
    expect(screen.getByText("T16")).toBeTruthy();
    expect(screen.getByText(/12,400/)).toBeTruthy();
    // Exactly one bar element per claim type — no second (Expected) bar.
    const bars = container.querySelectorAll('div[style*="background: rgb(16, 185, 129)"], div[style*="background: #10b981"]');
    expect(bars.length).toBe(2);
  });

  it("shows an empty state when nothing was collected in the window", () => {
    render(<ClaimTypeBarChart cases={[]} windowedClaims={[]} />);
    expect(screen.getByText(/No fees collected in this window yet/)).toBeTruthy();
  });

  it("ignores the cases prop entirely once windowedClaims is set", () => {
    render(
      <ClaimTypeBarChart
        cases={[caseWith({ claim: "CONC", expected: 999_999, paid: 1 })]}
        windowedClaims={[{ claim: "T2", collected: 500 }]}
      />,
    );
    expect(screen.queryByText("CONC")).toBeNull();
    expect(screen.getByText("T2")).toBeTruthy();
  });
});
