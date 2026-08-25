/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { RevenuePanel } from "../RevenuePanel";

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

describe("RevenuePanel — always shows this month's Collected per team as a bar chart", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("fetches window=month on mount and renders the team totals", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        window: "month",
        teams: [
          { team: "T2", collected: 414_557 },
          { team: "T16", collected: 325_569 },
          { team: "Concurrent", collected: 392_826 },
        ],
      }),
    });
    render(<RevenuePanel />);

    expect(fetch).toHaveBeenCalledWith("/api/revenue-by-team?window=month", expect.anything());
    await waitFor(() => expect(screen.getByText("T2 Team")).toBeTruthy());
    expect(screen.getByText("T16 Team")).toBeTruthy();
    expect(screen.getByText("Concurrent Team")).toBeTruthy();
    expect(screen.getByText(/Collected — Month/)).toBeTruthy();
    // Headline is the sum of all three teams.
    expect(screen.getByText("$1,132,952.00")).toBeTruthy();
    // No tab switcher and no Expected figure — removed at Jazz/Lori's request.
    expect(screen.queryByRole("button", { name: "All Time" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Today" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Week" })).toBeNull();
    expect(screen.queryByText("Expected")).toBeNull();
  });

  it("re-sorts the response into a fixed display order regardless of the API's own row order", async () => {
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
    render(<RevenuePanel />);
    await waitFor(() => expect(screen.getByText("T2 Team")).toBeTruthy());

    const labels = screen.getAllByText(/^(T2|T16|Concurrent) Team$/).map((el) => el.textContent);
    expect(labels).toEqual(["T2 Team", "T16 Team", "Concurrent Team"]);
  });

  it("shows an alert when the fetch fails, without a redundant empty state underneath", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, status: 500 });
    render(<RevenuePanel />);

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toContain("500");
    expect(screen.queryByText(/No fees collected/)).toBeNull();
  });

  it("shows a loading state before the fetch resolves", async () => {
    let resolveFetch!: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    (fetch as ReturnType<typeof vi.fn>).mockReturnValueOnce(pending);
    render(<RevenuePanel />);

    expect(screen.getByText(/Loading/)).toBeTruthy();

    resolveFetch({
      ok: true,
      json: async () => ({ window: "month", teams: [{ team: "T2", collected: 900 }] }),
    });
    await waitFor(() => expect(screen.getByText("T2 Team")).toBeTruthy());
  });

  it("shows an empty state when nothing was collected this month", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ window: "month", teams: [] }),
    });
    render(<RevenuePanel />);
    await waitFor(() => expect(screen.getByText(/No fees collected this month yet/)).toBeTruthy());
  });
});
