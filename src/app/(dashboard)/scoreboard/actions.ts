"use server";

import { db } from "@/lib/db";
import { dailyMetrics } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { parseDate, parseNonNegativeInt } from "@/lib/import/csv-parser";
import type { ImportResult } from "@/components/modals/CsvImportModal";

export async function bulkImportDailyMetrics(
  rawRows: Record<string, string>[],
): Promise<ImportResult> {
  let imported = 0;
  const rowErrors: ImportResult["rowErrors"] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const rowNum = i + 1;

    const agentName = raw["agent_name"]?.trim();
    if (!agentName) {
      rowErrors.push({ row: rowNum, error: "agent_name is required" });
      continue;
    }

    const metricDate = parseDate(raw["metric_date"] ?? "");
    if (!metricDate) {
      rowErrors.push({ row: rowNum, error: "Invalid or missing metric_date" });
      continue;
    }

    let parseOk = true;
    const values = {
      agentName,
      metricDate,
      ssaCalls: 0,
      clientCallsIb: 0,
      clientCallsOb: 0,
      winSheetsCreated: 0,
      notes: null as string | null,
    };

    for (const [csvKey, field] of [
      ["ssa_calls", "ssaCalls"],
      ["client_calls_ib", "clientCallsIb"],
      ["client_calls_ob", "clientCallsOb"],
      ["win_sheets_created", "winSheetsCreated"],
    ] as const) {
      if (raw[csvKey] !== undefined && raw[csvKey].trim()) {
        const n = parseNonNegativeInt(raw[csvKey]);
        if (n === null) {
          rowErrors.push({ row: rowNum, error: `Invalid value for "${csvKey}" — must be a non-negative integer` });
          parseOk = false;
          break;
        }
        (values as Record<string, unknown>)[field] = n;
      }
    }

    if (!parseOk) continue;

    if (raw["notes"] !== undefined) {
      values.notes = raw["notes"].trim() || null;
    }

    try {
      // No unique constraint on (agentName, metricDate) — check then upsert
      const existing = await db
        .select({ id: dailyMetrics.id })
        .from(dailyMetrics)
        .where(
          and(
            eq(dailyMetrics.agentName, agentName),
            eq(dailyMetrics.metricDate, metricDate),
          ),
        )
        .limit(1);

      if (existing.length) {
        await db
          .update(dailyMetrics)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(dailyMetrics.id, existing[0].id));
      } else {
        await db.insert(dailyMetrics).values(values);
      }
      imported++;
    } catch {
      rowErrors.push({ row: rowNum, error: "Database error — row skipped" });
    }
  }

  return { imported, failed: rowErrors.length, rowErrors };
}
