/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { TeamRevenueStats } from "../TeamRevenueStats";

describe("TeamRevenueStats — All Time (pre-aggregated bars)", () => {
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

  it("renders no visual bar/height elements — text tiles only", () => {
    const { container } = render(
      <TeamRevenueStats dark={false} bars={[{ team: "T16", expected: 300_656, paid: 656 }]} />,
    );
    // The old chart used inline `height` styles to size bars; this component
    // never should, since a plain number carries no relative-size framing.
    const heighted = Array.from(container.querySelectorAll<HTMLElement>("[style]")).filter(
      (el) => el.style.height,
    );
    expect(heighted.length).toBe(0);
  });

  it("shows an empty state when there are no team bars", () => {
    render(<TeamRevenueStats dark={false} bars={[]} />);
    expect(screen.getByText(/No team data yet/)).toBeTruthy();
  });
});

describe("TeamRevenueStats — windowed (collected-only)", () => {
  afterEach(cleanup);

  it("renders only a Collected figure per team, no Expected", () => {
    render(
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
