import { describe, it, expect } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { cases, feeRecords, feePetitions } from "@/lib/db/schema";
import {
  coerceCellValue,
  valuesEqual,
  buildReconcileKey,
  toDbValue,
  humanizedLabelMap,
  buildHeaderKeyMap,
} from "../restore-helpers";

const casesCols = getTableColumns(cases);
const feeRecordsCols = getTableColumns(feeRecords);
const feePetitionsCols = getTableColumns(feePetitions);

describe("coerceCellValue", () => {
  it("treats null, undefined, and blank strings as null", () => {
    expect(coerceCellValue(casesCols.firstName, null)).toBeNull();
    expect(coerceCellValue(casesCols.firstName, undefined)).toBeNull();
    expect(coerceCellValue(casesCols.firstName, "   ")).toBeNull();
  });

  it("parses a PgTimestamp cell into a Date", () => {
    const result = coerceCellValue(casesCols.createdAt, "2026-07-01T12:00:00.000Z");
    expect(result).toBeInstanceOf(Date);
    expect((result as Date).toISOString()).toBe("2026-07-01T12:00:00.000Z");
  });

  it("returns null for an unparseable timestamp", () => {
    expect(coerceCellValue(casesCols.createdAt, "not a date")).toBeNull();
  });

  it("parses a JSON array/jsonb cell", () => {
    expect(coerceCellValue(casesCols.claimType, '["T2","T16"]')).toEqual(["T2", "T16"]);
    expect(coerceCellValue(casesCols.representatives, '{"name":"Jan"}')).toEqual({ name: "Jan" });
  });

  it("returns null for invalid JSON in an array/json column", () => {
    expect(coerceCellValue(casesCols.claimType, "not json")).toBeNull();
  });

  it("coerces a numeric column to a number", () => {
    expect(coerceCellValue(casesCols.clientId, "38467006")).toBe(38467006);
    expect(coerceCellValue(casesCols.clientId, 38467006)).toBe(38467006);
  });

  it("returns null for a non-numeric value in a number column", () => {
    expect(coerceCellValue(casesCols.clientId, "abc")).toBeNull();
  });

  it("coerces a boolean column from a boolean or a string", () => {
    expect(coerceCellValue(feeRecordsCols.isClosed, true)).toBe(true);
    expect(coerceCellValue(feeRecordsCols.isClosed, "true")).toBe(true);
    expect(coerceCellValue(feeRecordsCols.isClosed, "false")).toBe(false);
  });

  it("passes other values through as strings", () => {
    expect(coerceCellValue(casesCols.firstName, "Jan")).toBe("Jan");
  });
});

describe("valuesEqual", () => {
  it("treats null and an empty string as equal", () => {
    expect(valuesEqual(feePetitionsCols.updateNote, null, "")).toBe(true);
    expect(valuesEqual(feePetitionsCols.updateNote, "", null)).toBe(true);
    expect(valuesEqual(feePetitionsCols.updateNote, "", "")).toBe(true);
  });

  it("treats a Date and its equivalent ISO string as equal on a PgTimestamp column", () => {
    const d = new Date("2026-07-01T12:00:00.000Z");
    expect(valuesEqual(casesCols.createdAt, d, "2026-07-01T12:00:00.000Z")).toBe(true);
    expect(valuesEqual(casesCols.createdAt, d, "2026-07-01T13:00:00.000Z")).toBe(false);
  });

  it("tolerates sub-cent drift on a PgNumeric column but not a real difference", () => {
    expect(valuesEqual(feeRecordsCols.t16Retro, "4760.695", "4760.70")).toBe(true);
    expect(valuesEqual(feeRecordsCols.t16Retro, "100.00", "150.00")).toBe(false);
  });

  it("compares arrays order-independently", () => {
    expect(valuesEqual(casesCols.claimType, ["T2", "T16"], ["T16", "T2"])).toBe(true);
    expect(valuesEqual(casesCols.claimType, ["T2"], ["T2", "T16"])).toBe(false);
  });

  it("compares plain strings and booleans strictly", () => {
    expect(valuesEqual(casesCols.firstName, "Jan", "Jan")).toBe(true);
    expect(valuesEqual(casesCols.firstName, "Jan", "Racquel")).toBe(false);
    expect(valuesEqual(feeRecordsCols.isClosed, true, false)).toBe(false);
  });
});

describe("buildReconcileKey", () => {
  it("joins composite key fields with a plain space", () => {
    const key = buildReconcileKey({ weekStart: "2026-07-06", dayOfWeek: 2, pocName: "Jan" }, [
      "weekStart",
      "dayOfWeek",
      "pocName",
    ]);
    expect(key).toBe("2026-07-06 2 Jan");
  });

  it("returns null when any key field is missing", () => {
    expect(buildReconcileKey({ caseId: null }, ["caseId"])).toBeNull();
    expect(buildReconcileKey({}, ["caseId"])).toBeNull();
    expect(buildReconcileKey({ caseId: "" }, ["caseId"])).toBeNull();
  });
});

describe("toDbValue", () => {
  it("substitutes an empty string for null on a NOT NULL string column", () => {
    expect(toDbValue(feePetitionsCols.updateNote, null)).toBe("");
  });

  it("substitutes an empty array for null on a NOT NULL array column", () => {
    expect(toDbValue(casesCols.claimType, null)).toEqual([]);
  });

  it("leaves null alone on a nullable column", () => {
    expect(toDbValue(casesCols.dob, null)).toBeNull();
  });

  it("passes non-null values through unchanged", () => {
    expect(toDbValue(feePetitionsCols.updateNote, "hello")).toBe("hello");
  });
});

describe("humanizedLabelMap", () => {
  it("maps distinct keys to their humanized labels", () => {
    const map = humanizedLabelMap(["firstName", "clientId"]);
    expect(map.get("First Name")).toBe("firstName");
    expect(map.get("Client ID")).toBe("clientId");
  });

  it("throws when two keys humanize to the same label", () => {
    expect(() => humanizedLabelMap(["foo", "Foo"])).toThrow(/collision/i);
  });
});

describe("buildHeaderKeyMap", () => {
  it("builds a real, collision-free map for every backed-up table's columns", () => {
    expect(() => buildHeaderKeyMap(cases, ["fullSsn", "ssnEncrypted"])).not.toThrow();
    expect(() => buildHeaderKeyMap(feeRecords)).not.toThrow();
    expect(() => buildHeaderKeyMap(feePetitions)).not.toThrow();
  });

  it("excludes the given columns from the map", () => {
    const map = buildHeaderKeyMap(cases, ["fullSsn", "ssnEncrypted"]);
    expect(map.has("Full SSN")).toBe(false);
    expect(map.has("First Name")).toBe(true);
  });
});
