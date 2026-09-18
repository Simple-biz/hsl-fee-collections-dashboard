// @vitest-environment jsdom
//
// The marker exists to make the Level/membership divergence visible, so the
// case that matters most is "at Fee Petition level but NOT added" — the state
// that didn't exist before migration 0055. It has to survive both Level
// spellings in the data ("FEE PETITION" and "FEE_PETITION"), the way the
// Claim filter didn't when an admin renamed CONC to CONCURRENT.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { FeePetitionIndicator } from "@/components/cases/FeePetitionIndicator";

afterEach(cleanup);

const ADDED = /On the Fee Petitions page/;
const NOT_ADDED = /not added to the Fee Petitions page yet/;

describe("FeePetitionIndicator", () => {
  it("marks a case that is on the Fee Petitions page", () => {
    render(<FeePetitionIndicator inFeePetition level="FEE PETITION" dark={false} />);
    expect(screen.getByText(ADDED)).toBeTruthy();
  });

  it("marks a Fee Petition case that has not been added yet", () => {
    render(<FeePetitionIndicator inFeePetition={false} level="FEE PETITION" dark={false} />);
    expect(screen.getByText(NOT_ADDED)).toBeTruthy();
  });

  it.each(["FEE_PETITION", "fee petition", " Fee_Petition "])(
    "recognises the Level spelling %j",
    (level) => {
      render(<FeePetitionIndicator inFeePetition={false} level={level} dark={false} />);
      expect(screen.getByText(NOT_ADDED)).toBeTruthy();
    },
  );

  it("renders nothing for an ordinary case at another level", () => {
    const { container } = render(
      <FeePetitionIndicator inFeePetition={false} level="HEARING" dark={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when the Level is unset", () => {
    const { container } = render(
      <FeePetitionIndicator inFeePetition={false} level={null} dark={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  // A case can stay on the page after its Level moves on — the whole point of
  // decoupling — so membership alone must be enough to earn the marker.
  it("still marks a case added at a Level other than Fee Petition", () => {
    render(<FeePetitionIndicator inFeePetition level="HEARING" dark={false} />);
    expect(screen.getByText(ADDED)).toBeTruthy();
  });
});
