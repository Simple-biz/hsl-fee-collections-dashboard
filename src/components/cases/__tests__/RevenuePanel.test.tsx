/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { RevenuePanel } from "../RevenuePanel";

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

describe("RevenuePanel — every window, including All Time, comes from /api/revenue-by-team", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("defaults to All Time: fetches the lifetime Expected/Collected per team (open + closed cases)", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        window: "alltime",
        teams: [
          { team: "T2", collected: 499_500, expected: 792_636 },
          { team: "T16", collected: 656, expected: 300_656 },
        ],
      }),
    });
    render(<RevenuePanel />);

    expect(fetch).toHaveBeenCalledWith("/api/revenue-by-team?window=alltime", expect.anything());
    await waitFor(() => expect(screen.getByText("T2 Team")).toBeTruthy());
    expect(screen.getByText("T16 Team")).toBeTruthy();
    expect(screen.getByText(/792,636/)).toBeTruthy();
  });

  it("fetches the windowed team totals when a narrower preset is clicked", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ window: "alltime", teams: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          window: "month",
          teams: [{ team: "T2", collected: 12_400 }, { team: "T16", collected: 3_100 }],
        }),
      });
    render(<RevenuePanel />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Month" }));

    expect(fetch).toHaveBeenCalledWith("/api/revenue-by-team?window=month", expect.anything());
    await waitFor(() => expect(screen.getByText(/Collected — Month/)).toBeTruthy());
    expect(screen.getByText(/15,500/)).toBeTruthy(); // 12,400 + 3,100
    expect(screen.queryByText("Expected")).toBeNull();
  });

  it("re-sorts a windowed response into TEAM_ORDER regardless of the API's own row order", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ window: "alltime", teams: [] }) })
      .mockResolvedValueOnce({
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
    render(<RevenuePanel />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Month" }));
    await waitFor(() => expect(screen.getByText(/Collected — Month/)).toBeTruthy());

    const labels = screen.getAllByText(/^(T2|T16|Concurrent) Team$/).map((el) => el.textContent);
    expect(labels).toEqual(["T2 Team", "T16 Team", "Concurrent Team"]);
  });

  it("shows an alert when the windowed fetch fails", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ window: "alltime", teams: [] }) })
      .mockResolvedValueOnce({ ok: false, status: 500 });
    render(<RevenuePanel />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Week" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toContain("500");
    // The error banner replaces the team breakdown entirely — no redundant
    // "no data" state rendered underneath it.
    expect(screen.queryByText(/No team data yet/)).toBeNull();
    expect(screen.queryByText(/No fees collected/)).toBeNull();
  });

  it("clears the previous window's figures immediately on switch, instead of showing them under the new label", async () => {
    let resolveMonth!: (value: unknown) => void;
    const monthPromise = new Promise((resolve) => {
      resolveMonth = resolve;
    });
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ window: "alltime", teams: [{ team: "T2", collected: 499_500, expected: 792_636 }] }),
      })
      .mockReturnValueOnce(monthPromise);
    render(<RevenuePanel />);
    await waitFor(() => expect(screen.getByText(/792,636/)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Month" }));

    // Old All Time figure must be gone before Month's data has even arrived —
    // otherwise it would sit on screen under the (already-updated) "Month" label.
    await waitFor(() => expect(screen.getByText(/Loading/)).toBeTruthy());
    expect(screen.queryByText(/792,636/)).toBeNull();

    resolveMonth({
      ok: true,
      json: async () => ({ window: "month", teams: [{ team: "T2", collected: 12_400 }] }),
    });
    // Matches both the headline ($12,400.00) and the bar label ($12,400).
    await waitFor(() => expect(screen.getAllByText(/12,400/).length).toBeGreaterThan(0));
  });

  it("switching back to All Time re-fetches the lifetime totals", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ window: "alltime", teams: [{ team: "T2", collected: 499_500, expected: 792_636 }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ window: "today", teams: [{ team: "T2", collected: 900 }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ window: "alltime", teams: [{ team: "T2", collected: 499_500, expected: 792_636 }] }),
      });
    render(<RevenuePanel />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    await waitFor(() => expect(screen.getByText(/Collected — Today/)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "All Time" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    // 499,500 / 792,636 = 63.0%
    await waitFor(() => expect(screen.getByText(/63\.0%/)).toBeTruthy());
  });
});
