import type ExcelJS from "exceljs";
import { getTableColumns, type Column } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { humanizeKey } from "@/lib/backup/humanize";

// Maps this table's humanized column labels (as written by the export route)
// back to their real (TS) column keys, so a restore doesn't depend on column
// order matching between the export and the file the admin re-uploads.
// Two columns humanizing to the same label would silently make the second
// one's values overwrite the first's on every restore — fail loudly instead,
// since this can only be caught by inspection otherwise. Split out from
// buildHeaderKeyMap so the collision check is testable without a real
// PgTable/DB connection.
export const humanizedLabelMap = (keys: string[]): Map<string, string> => {
  const map = new Map<string, string>();
  for (const key of keys) {
    const label = humanizeKey(key);
    if (map.has(label)) {
      throw new Error(`humanizeKey collision: "${map.get(label)}" and "${key}" both humanize to "${label}"`);
    }
    map.set(label, key);
  }
  return map;
};

export const buildHeaderKeyMap = (
  table: PgTable,
  excludeColumns: string[] = [],
): Map<string, string> => {
  const keys = Object.keys(getTableColumns(table)).filter((k) => !excludeColumns.includes(k));
  return humanizedLabelMap(keys);
};

// Excel has no concept of a column's original JS/DB type — every cell is a
// string, number, boolean, or Date. This reverses `toCellValue` from the
// export route using each column's actual drizzle type as the guide.
export const coerceCellValue = (column: Column, raw: unknown): unknown => {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string" && raw.trim() === "") return null;

  if (column.columnType === "PgTimestamp") {
    const d = raw instanceof Date ? raw : new Date(String(raw));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (column.dataType === "json" || column.dataType === "array") {
    if (typeof raw !== "string") return raw;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (column.dataType === "number") {
    const n = Number(raw);
    return Number.isNaN(n) ? null : n;
  }
  if (column.dataType === "boolean") {
    if (typeof raw === "boolean") return raw;
    return String(raw).trim().toLowerCase() === "true";
  }
  return String(raw);
};

// Field-level equality used to classify a row as "changed" vs "unchanged".
// Numeric (decimal) columns tolerate a sub-cent gap — see the identical
// rationale in src/app/api/sheets/sync/route.ts's `n()` helper.
export const valuesEqual = (column: Column, a: unknown, b: unknown): boolean => {
  // An empty string round-trips through Excel as a blank cell — coerceCellValue
  // reads it back as null, so a blank/"" distinction on the way out can't
  // survive a restore anyway. Treat them as equivalent here too, or every
  // untouched empty-string column would show up as "changed".
  const norm = (v: unknown) => (v === "" ? null : v ?? null);
  const av = norm(a);
  const bv = norm(b);
  if (av === null && bv === null) return true;
  if (av === null || bv === null) return false;

  if (column.columnType === "PgTimestamp") {
    const at = av instanceof Date ? av.getTime() : new Date(String(av)).getTime();
    const bt = bv instanceof Date ? bv.getTime() : new Date(String(bv)).getTime();
    return at === bt;
  }
  if (column.columnType === "PgNumeric") {
    return Math.abs(Number(av) - Number(bv)) < 0.01;
  }
  if (column.dataType === "number") return Number(av) === Number(bv);
  if (column.dataType === "boolean") return Boolean(av) === Boolean(bv);
  if (column.dataType === "json" || column.dataType === "array") {
    const an = Array.isArray(av) ? [...av].sort() : av;
    const bn = Array.isArray(bv) ? [...bv].sort() : bv;
    return JSON.stringify(an) === JSON.stringify(bn);
  }
  return String(av) === String(bv);
};

// A blank cell coerces to null, which is correct for comparison — but a few
// NOT NULL text columns (e.g. feePetitions/overpaidCases updateNote) use ""
// rather than a real default, and Postgres rejects an explicit NULL for a
// NOT NULL column even though the column *has* a default (defaults only
// apply when the column is omitted from the insert entirely). This restores
// the "" a blank cell actually represents for those columns specifically.
export const toDbValue = (column: Column, value: unknown): unknown => {
  if (value !== null || !column.notNull) return value;
  if (column.dataType === "string") return "";
  if (column.dataType === "array") return [];
  return value;
};

// Reads a worksheet into plain row objects keyed by DB column name, using
// the sheet's own header row (not column position) to figure out which
// cell is which field.
export const readSheetRows = (
  sheet: ExcelJS.Worksheet,
  table: PgTable,
  excludeColumns: string[] = [],
): { rows: Record<string, unknown>[]; unmappedHeaders: string[] } => {
  const headerMap = buildHeaderKeyMap(table, excludeColumns);
  const columns = getTableColumns(table);

  const keysByCol: (string | null)[] = [];
  const unmappedHeaders: string[] = [];
  const headerRow = sheet.getRow(1);
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const label = String(cell.value ?? "").trim();
    if (!label) return;
    const key = headerMap.get(label) ?? null;
    if (!key) unmappedHeaders.push(label);
    keysByCol[colNumber] = key;
  });

  const rows: Record<string, unknown>[] = [];
  for (let rowNum = 2; rowNum <= sheet.rowCount; rowNum++) {
    const row = sheet.getRow(rowNum);
    if (row.cellCount === 0) continue;

    const record: Record<string, unknown> = {};
    let hasValue = false;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const key = keysByCol[colNumber];
      if (!key) return;
      const value = coerceCellValue(columns[key], cell.value);
      record[key] = value;
      if (value !== null) hasValue = true;
    });
    if (hasValue) rows.push(record);
  }

  return { rows, unmappedHeaders };
};

// The composite identity used to match a backup row to its DB counterpart —
// null if any key field is missing (row can't be safely reconciled).
export const buildReconcileKey = (
  row: Record<string, unknown>,
  reconcileBy: string[],
): string | null => {
  const parts: string[] = [];
  for (const field of reconcileBy) {
    const v = row[field];
    if (v === null || v === undefined || v === "") return null;
    parts.push(v instanceof Date ? v.toISOString() : String(v));
  }
  return parts.join(" ");
};
