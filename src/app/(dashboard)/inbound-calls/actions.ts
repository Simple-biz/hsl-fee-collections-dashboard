"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { inboundCallRecords } from "@/lib/db/schema";
import { parseBool, parseDate } from "@/lib/import/csv-parser";
import type { ImportResult } from "@/components/modals/CsvImportModal";
import { getMondayOfDate } from "@/lib/formatters";

export async function bulkImportInboundCalls(
  rawRows: Record<string, string>[],
): Promise<ImportResult> {
  const session = await auth();
  if (!session?.user) {
    return {
      imported: 0,
      failed: 0,
      rowErrors: [],
      error: "You must be signed in to import inbound calls.",
    };
  }

  let imported = 0;
  const rowErrors: ImportResult["rowErrors"] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const rowNum = i + 1;

    const callDate = parseDate(raw["call_date"] ?? "");
    if (!callDate) {
      rowErrors.push({ row: rowNum, error: "Invalid or missing call_date" });
      continue;
    }

    const weekStart = getMondayOfDate(callDate);

    let calledBackResolved = false;
    if (raw["called_back_resolved"] !== undefined && raw["called_back_resolved"].trim()) {
      const b = parseBool(raw["called_back_resolved"]);
      if (b === null) {
        rowErrors.push({ row: rowNum, error: "Invalid called_back_resolved value" });
        continue;
      }
      calledBackResolved = b;
    }

    const values: typeof inboundCallRecords.$inferInsert = {
      weekStart,
      callDate,
      number: raw["number"]?.trim() || null,
      transcript: raw["transcript"]?.trim() || null,
      caseLink: raw["case_link"]?.trim() || null,
      specialistAssigned: raw["specialist_assigned"]?.trim() || null,
      calledBackResolved,
    };

    try {
      await db.insert(inboundCallRecords).values(values);
      imported++;
    } catch {
      rowErrors.push({ row: rowNum, error: "Database error — row skipped" });
    }
  }

  return { imported, failed: rowErrors.length, rowErrors };
}
