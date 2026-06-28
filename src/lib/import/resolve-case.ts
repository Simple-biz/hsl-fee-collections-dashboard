import { db } from "@/lib/db";
import { cases } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

/**
 * Resolves a raw CSV identifier to a cases.clientId.
 *
 * Priority:
 *  1. If the value is a pure integer string → match cases.client_id directly.
 *  2. Otherwise → case-insensitive match on "firstName lastName" or "lastName, firstName".
 *
 * Returns { caseId } on success or { error } on failure (not found / ambiguous).
 */
export async function resolveCaseId(
  value: string,
): Promise<{ caseId: number } | { error: string }> {
  const trimmed = value.trim();
  if (!trimmed) return { error: "Client ID / name is required" };

  // Integer path
  if (/^\d+$/.test(trimmed)) {
    const id = parseInt(trimmed, 10);
    const rows = await db
      .select({ clientId: cases.clientId })
      .from(cases)
      .where(eq(cases.clientId, id))
      .limit(1);
    if (!rows.length) return { error: `No case found with client ID ${id}` };
    return { caseId: rows[0].clientId };
  }

  // Name path — try "First Last" and "Last, First"
  const normalised = trimmed.toLowerCase();

  const byFullName = await db
    .select({ clientId: cases.clientId })
    .from(cases)
    .where(
      sql`LOWER(${cases.firstName} || ' ' || ${cases.lastName}) = ${normalised}`,
    );

  if (byFullName.length === 1) return { caseId: byFullName[0].clientId };
  if (byFullName.length > 1) {
    return {
      error: `Multiple cases match "${trimmed}" — use client ID instead`,
    };
  }

  // Try "Last, First"
  const commaIdx = trimmed.indexOf(",");
  if (commaIdx !== -1) {
    const last = trimmed.slice(0, commaIdx).trim().toLowerCase();
    const first = trimmed.slice(commaIdx + 1).trim().toLowerCase();
    const byLastFirst = await db
      .select({ clientId: cases.clientId })
      .from(cases)
      .where(
        sql`LOWER(${cases.firstName}) = ${first} AND LOWER(${cases.lastName}) = ${last}`,
      );
    if (byLastFirst.length === 1) return { caseId: byLastFirst[0].clientId };
    if (byLastFirst.length > 1) {
      return {
        error: `Multiple cases match "${trimmed}" — use client ID instead`,
      };
    }
  }

  // MyCase title path — "YYYY.MM.DD Last, First v. ALJ ..."
  // Strip the date prefix and everything from " v. " onward, leaving "Last, First".
  const mycaseMatch = trimmed.match(/^\d{4}\.\d{2}\.\d{2}\s+(.+?)\s+v\.?\s+/i);
  if (mycaseMatch) {
    const namePart = mycaseMatch[1].trim();
    const ci = namePart.indexOf(",");
    if (ci !== -1) {
      const last = namePart.slice(0, ci).trim().toLowerCase();
      const first = namePart.slice(ci + 1).trim().toLowerCase();
      const rows = await db
        .select({ clientId: cases.clientId })
        .from(cases)
        .where(
          sql`LOWER(${cases.firstName}) = ${first} AND LOWER(${cases.lastName}) = ${last}`,
        );
      if (rows.length === 1) return { caseId: rows[0].clientId };
      if (rows.length > 1) {
        return { error: `Multiple cases match "${namePart}" — use client ID instead` };
      }
    }
  }

  return { error: `No case found matching "${trimmed}"` };
}
