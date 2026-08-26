/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { Scoreboard } from "../Scoreboard";

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null }),
}));

// bulkImportDailyMetrics is a "use server" action that imports @/auth and
// @/lib/db (bcrypt, Drizzle) — heavy server-only modules that don't load in
// jsdom. Scoreboard only calls it from the (untested-here) CSV import flow.
vi.mock("@/app/(dashboard)/scoreboard/actions", () => ({
  bulkImportDailyMetrics: vi.fn(),
}));

const agentsResponse = (agents: { agent: string; team: string; role?: string | null; casesClosed: number }[]) => ({
  ok: true,
  json: async () => ({ agents: agents.map((a) => ({ role: null, ...a })) }),
});

describe("Scoreboard — 5-period comparison (week or month), with a Team Total row", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(agentsResponse([{ agent: "Cora", team: "T2", casesClosed: 3 }])));
    vi.stubGlobal("clipboard", { writeText: vi.fn().mockResolvedValue(undefined), write: vi.fn().mockResolvedValue(undefined) });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("defaults to Week mode and fetches 5 weekly windows", async () => {
    render(<Scoreboard />);

    expect(fetch).toHaveBeenCalledTimes(5);
    for (const call of (fetch as ReturnType<typeof vi.fn>).mock.calls) {
      expect(call[0]).toMatch(/^\/api\/scoreboard\?week=\d{4}-\d{2}-\d{2}$/);
    }
    await waitFor(() => expect(screen.getByText("Cora")).toBeTruthy());
    expect(screen.getByText("This week")).toBeTruthy();
  });

  it("switches to Month mode: fetches 5 monthly from/to ranges instead", async () => {
    render(<Scoreboard />);
    await waitFor(() => expect(screen.getByText("Cora")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Month" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(10)); // 5 week calls on mount + 5 month calls
    const lastFive = (fetch as ReturnType<typeof vi.fn>).mock.calls.slice(-5);
    for (const call of lastFive) {
      expect(call[0]).toMatch(/^\/api\/scoreboard\?from=\d{4}-\d{2}-01&to=\d{4}-\d{2}-\d{2}$/);
    }
    await waitFor(() => expect(screen.getByText("This month")).toBeTruthy());
  });

  it("renders a Team Total row summing every agent's current-period value", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      agentsResponse([
        { agent: "Cora", team: "T2", casesClosed: 5 },
        { agent: "Bree", team: "T2", casesClosed: 3 },
      ]),
    );
    render(<Scoreboard />);
    await waitFor(() => expect(screen.getByText("Cora")).toBeTruthy());

    expect(screen.getByText("Team Total")).toBeTruthy();
    // 5 + 3 = 8 — the mock returns the same agents for all 5 period columns,
    // so the Team Total row shows 8 in every column (one "8" per period).
    expect(screen.getAllByText("8").length).toBe(5);
  });

  it("excludes team leads from both the ranking and the Team Total", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      agentsResponse([
        { agent: "Georgia", team: "T2", role: "team_lead", casesClosed: 20 },
        { agent: "Cora", team: "T2", casesClosed: 5 },
      ]),
    );
    render(<Scoreboard />);
    await waitFor(() => expect(screen.getByText("Cora")).toBeTruthy());

    expect(screen.queryByText("Georgia")).toBeNull();
    // Team Total should be 5 (Cora only), not 25 (Cora + team lead).
    expect(screen.getAllByText("5").length).toBeGreaterThan(0);
    expect(screen.queryByText("25")).toBeNull();
  });

  it("shows an alert when a fetch fails", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 500 });
    render(<Scoreboard />);

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toContain("500");
  });
});
