import { describe, it, expect } from "vitest";
import { getMondayOfDate } from "../formatters";

// getMondayOfDate decides which week an inbound call record is filed under
// (see api/inbound-calls POST + PATCH), so a regression here silently moves
// records into the wrong week's table.
describe("getMondayOfDate", () => {
  it("returns the same date when given a Monday", () => {
    expect(getMondayOfDate("2026-08-10")).toBe("2026-08-10");
  });

  it("walks back to Monday for a mid-week date", () => {
    expect(getMondayOfDate("2026-08-07")).toBe("2026-08-03");
    expect(getMondayOfDate("2026-08-15")).toBe("2026-08-10");
  });

  it("treats Sunday as the end of the preceding Monday-start week", () => {
    expect(getMondayOfDate("2026-08-16")).toBe("2026-08-10");
  });

  it("crosses month boundaries", () => {
    expect(getMondayOfDate("2026-09-01")).toBe("2026-08-31");
  });

  it("crosses year boundaries", () => {
    expect(getMondayOfDate("2027-01-03")).toBe("2026-12-28");
    expect(getMondayOfDate("2027-01-04")).toBe("2027-01-04");
  });

  it("handles future dates the same as past ones", () => {
    expect(getMondayOfDate("2027-06-16")).toBe("2027-06-14");
  });

  it("always returns a Monday", () => {
    for (let day = 1; day <= 28; day++) {
      const iso = `2026-08-${String(day).padStart(2, "0")}`;
      const monday = getMondayOfDate(iso);
      expect(new Date(`${monday}T00:00:00`).getDay()).toBe(1);
    }
  });
});
