/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { TeamRevenueStats } from "../TeamRevenueStats";

describe("TeamRevenueStats — Collected-per-team bar chart", () => {
  afterEach(cleanup);

  it("renders a Collected figure and bar per team, with the human-readable team label", () => {
    const { container } = render(
      <TeamRevenueStats
        dark={false}
        teams={[
          { team: "T2", collected: 414_557 },
          { team: "T16", collected: 325_569 },
          { team: "Concurrent", collected: 392_826 },
        ]}
      />,
    );
    expect(screen.getByText("T2 Team")).toBeTruthy();
    expect(screen.getByText("T16 Team")).toBeTruthy();
    expect(screen.getByText("Concurrent Team")).toBeTruthy();
    expect(screen.getByText(/414,557/)).toBeTruthy();
    expect(screen.getByText(/325,569/)).toBeTruthy();
    expect(screen.getByText(/392,826/)).toBeTruthy();
    // A real bar per team, height scaled to the shared max Collected value.
    const heighted = Array.from(container.querySelectorAll<HTMLElement>("[style]")).filter(
      (el) => el.style.height,
    );
    expect(heighted.length).toBe(3);
  });

  it("scales the tallest bar to the max Collected value among the given teams", () => {
    const { container } = render(
      <TeamRevenueStats
        dark={false}
        teams={[
          { team: "T2", collected: 100 },
          { team: "T16", collected: 50 },
        ]}
      />,
    );
    const bars = Array.from(container.querySelectorAll<HTMLElement>("[style]")).filter((el) => el.style.height);
    expect(bars[0].style.height).toBe("100%");
    expect(bars[1].style.height).toBe("50%");
  });

  it("shows an empty state when nothing was collected", () => {
    render(<TeamRevenueStats dark={false} teams={[]} />);
    expect(screen.getByText(/No fees collected this month yet/)).toBeTruthy();
  });
});
