/**
 * Parses a CSV string and returns the original header strings plus rows keyed
 * by those original headers (preserving exact capitalisation and spacing).
 *
 * @param headerRowIndex - 0-based index of the row that contains column headers.
 *   Rows before this index are treated as metadata and skipped.
 *   Defaults to 0 (first row).
 */
export function parseCsvText(
  text: string,
  headerRowIndex: number = 0,
): {
  headers: string[];
  rows: Record<string, string>[];
} {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // Strip UTF-8 BOM if present
  const clean = normalized.startsWith("﻿") ? normalized.slice(1) : normalized;
  const lines = clean.split("\n").filter((_, i) => {
    // Keep the header row and everything after; drop lines before it
    return i >= headerRowIndex;
  });
  if (lines.length < 2) return { headers: [], rows: [] };

  const headers = splitCsvLine(lines[0]).map((h) => h.trim());

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, j) => {
      row[h] = (cells[j] ?? "").trim();
    });
    rows.push(row);
  }
  return { headers, rows };
}

/**
 * Applies a field mapping to raw CSV rows.
 * `mapping` maps expected field keys to original CSV header strings.
 * Fields mapped to "" or absent are resolved to "".
 */
export function applyMapping(
  rows: Record<string, string>[],
  mapping: Record<string, string>,
): Record<string, string>[] {
  return rows.map((raw) => {
    const out: Record<string, string> = {};
    for (const [expectedKey, csvHeader] of Object.entries(mapping)) {
      out[expectedKey] = (csvHeader && raw[csvHeader] != null) ? raw[csvHeader] : "";
    }
    return out;
  });
}

/**
 * Auto-suggests a mapping from expected field keys to CSV headers.
 * Tries to match by normalising both sides (lowercase, collapse punctuation).
 */
export function autoMapColumns(
  fieldKeys: string[],
  fieldLabels: string[],
  csvHeaders: string[],
): Record<string, string> {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[_\s\-/()]+/g, " ").trim();

  const mapping: Record<string, string> = {};
  for (let i = 0; i < fieldKeys.length; i++) {
    const keyNorm = norm(fieldKeys[i]);
    const labelNorm = norm(fieldLabels[i]);

    const match = csvHeaders.find((h) => {
      const hn = norm(h);
      return hn === keyNorm || hn === labelNorm;
    });
    mapping[fieldKeys[i]] = match ?? "";
  }
  return mapping;
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

/**
 * Parses a boolean-like string.
 * Accepts: true/false, yes/no, 1/0, y/n, x (checked), and empty string (false).
 * Returns null for unrecognised values.
 */
export function parseBool(value: string): boolean | null {
  const v = value.trim().toLowerCase();
  if (["true", "yes", "1", "y", "x"].includes(v)) return true;
  if (["false", "no", "0", "n", ""].includes(v)) return false;
  return null;
}

/**
 * Parses a date string to ISO "YYYY-MM-DD".
 * Accepts YYYY-MM-DD and MM/DD/YYYY. Returns null for empty or invalid input.
 */
export function parseDate(value: string): string | null {
  const v = value.trim();
  if (!v) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const d = new Date(v + "T12:00:00");
    if (!isNaN(d.getTime())) return v;
  }

  const mdy = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const iso = `${mdy[3]}-${mdy[1].padStart(2, "0")}-${mdy[2].padStart(2, "0")}`;
    const d = new Date(iso + "T12:00:00");
    if (!isNaN(d.getTime())) return iso;
  }

  // MM/DD/YY — two-digit year treated as 20YY
  const mdyShort = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (mdyShort) {
    const iso = `20${mdyShort[3]}-${mdyShort[1].padStart(2, "0")}-${mdyShort[2].padStart(2, "0")}`;
    const d = new Date(iso + "T12:00:00");
    if (!isNaN(d.getTime())) return iso;
  }

  // Fallback: extract a date pattern embedded in a longer string (e.g. "Recv'd 3/26/2026")
  const embedded4 = v.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (embedded4) {
    const iso = `${embedded4[3]}-${embedded4[1].padStart(2, "0")}-${embedded4[2].padStart(2, "0")}`;
    const d = new Date(iso + "T12:00:00");
    if (!isNaN(d.getTime())) return iso;
  }

  const embedded2 = v.match(/(\d{1,2})\/(\d{1,2})\/(\d{2})(?!\d)/);
  if (embedded2) {
    const iso = `20${embedded2[3]}-${embedded2[1].padStart(2, "0")}-${embedded2[2].padStart(2, "0")}`;
    const d = new Date(iso + "T12:00:00");
    if (!isNaN(d.getTime())) return iso;
  }

  return null;
}

/** Parses a non-negative integer string. Returns null for empty or invalid. */
export function parseNonNegativeInt(value: string): number | null {
  const v = value.trim();
  if (!v) return null;
  if (!/^\d+$/.test(v)) return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

/** Parses a decimal string (strips commas). Returns null for empty or invalid. */
export function parseDecimalString(value: string): string | null {
  const v = value.trim().replace(/[$,]/g, "");
  if (!v) return null;
  const n = parseFloat(v);
  if (isNaN(n)) return null;
  return n.toFixed(2);
}
