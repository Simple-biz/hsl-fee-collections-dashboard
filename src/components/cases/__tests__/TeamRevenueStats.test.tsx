/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { TeamRevenueStats } from "../TeamRevenueStats";

describe("TeamRevenueStats — All Time (self-scaled progress bars)", () => {
  afterEach(cleanup);

  it("renders Expected/Collected per team as text, with the human-readable team label", () => {
    render(
      <TeamRevenueStats
        dark={false}
        bars={[
          { team: "T2", expected: 792_636, paid: 499_500 },
          { team: "T16", expected: 300_656, paid: 656 },
        ]}
      />,
    );
    expect(screen.getByText("T2 Team")).toBeTruthy();
    expect(screen.getByText("T16 Team")).toBeTruthy();
    expect(screen.getByText(/792,636/)).toBeTruthy();
    expect(screen.getByText(/300,656/)).toBeTruthy();
  });

  it("scales each team's progress bar to its OWN expected, not a shared dollar axis", () => {
    render(
      <TeamRevenueStats
        dark={false}
        bars={[
          { team: "T2", expected: 792_636, paid: 499_500 }, // ~63%
          { team: "T16", expected: 300_656, paid: 300_656 }, // 100%
        ]}
      />,
    );
    const bars = screen.getAllByRole("progressbar");
    expect(bars).toHaveLength(2);
    expect(bars[0].getAttribute("aria-valuenow")).toBe("63");
    expect(bars[1].getAttribute("aria-valuenow")).toBe("100");
  });

  it("caps the progress bar at 100% for an overpaid team", () => {
    render(
      <TeamRevenueStats dark={false} bars={[{ team: "T16", expected: 300_656, paid: 400_000 }]} />,
    );
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("100");
  });

  it("shows an empty state when there are no team bars", () => {
    render(<TeamRevenueStats dark={false} bars={[]} />);
    expect(screen.getByText(/No team data yet/)).toBeTruthy();
  });
});

describe("TeamRevenueStats — windowed (collected-only bar chart)", () => {
  afterEach(cleanup);

  it("renders a Collected figure and bar per team, no Expected", () => {
    const { container } = render(
      <TeamRevenueStats
        dark={false}
        bars={[]}
        windowedTeams={[
          { team: "T2", collected: 12_400 },
          { team: "Concurrent", collected: 3_100 },
        ]}
      />,
    );
    expect(screen.getByText("T2 Team")).toBeTruthy();
    expect(screen.getByText("Concurrent Team")).toBeTruthy();
    expect(screen.getByText(/12,400/)).toBeTruthy();
    expect(screen.queryByText("Expected")).toBeNull();
    // A real bar per team — height scaled to the shared max Collected value.
    const heighted = Array.from(container.querySelectorAll<HTMLElement>("[style]")).filter(
      (el) => el.style.height,
    );
    expect(heighted.length).toBe(2);
  });

  it("shows an empty state when nothing was collected in the window", () => {
    render(<TeamRevenueStats dark={false} bars={[]} windowedTeams={[]} />);
    expect(screen.getByText(/No fees collected in this window yet/)).toBeTruthy();
  });

  it("ignores the bars prop entirely once windowedTeams is set", () => {
    render(
      <TeamRevenueStats
        dark={false}
        bars={[{ team: "T16", expected: 999_999, paid: 1 }]}
        windowedTeams={[{ team: "T2", collected: 500 }]}
      />,
    );
    expect(screen.queryByText("T16 Team")).toBeNull();
    expect(screen.getByText("T2 Team")).toBeTruthy();
  });
});
