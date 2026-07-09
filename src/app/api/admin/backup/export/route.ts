import "server-only";
import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getTableColumns } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";
import { logAdminActivity } from "@/lib/admin-activity";
import { BACKUP_TABLES, BACKUP_SCHEMA_VERSION } from "@/lib/backup/registry";
import { humanizeKey } from "@/lib/backup/humanize";

export const runtime = "nodejs";

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" } };

const styleHeaderRow = (sheet: ExcelJS.Worksheet) => {
  const header = sheet.getRow(1);
  header.font = HEADER_FONT;
  header.eachCell((cell) => { cell.fill = HEADER_FILL; });
  header.height = 20;
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
};

// Dates become ISO strings and jsonb/array columns become readable JSON
// strings — a cell can't hold a nested object, and this is the exact shape
// a restore's parser will expect back.
const toCellValue = (v: unknown): unknown => {
  if (v instanceof Date) return v.toISOString();
  if (v !== null && typeof v === "object") return JSON.stringify(v);
  return v;
};

export const GET = async () => {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) {
      return NextResponse.json(
        { error: guard.error },
        { status: guard.error === "Unauthenticated" ? 401 : 403 },
      );
    }

    // Fetch everything up front so the manifest's row counts are known
    // before that sheet is built — it needs to be the *first* worksheet
    // added so it lands first in Excel's tab order, and ExcelJS orders tabs
    // by insertion, not by any later-settable property.
    const tableRows = await Promise.all(
      BACKUP_TABLES.map((config) => db.select().from(config.table)),
    );

    const wb = new ExcelJS.Workbook();
    const exportedAt = new Date().toISOString();
    const exportedBy = guard.session.user.name ?? guard.session.user.email ?? "unknown";
    const manifestRows = BACKUP_TABLES.map((config, i) => ({
      table: config.key,
      label: config.label,
      rowCount: tableRows[i].length,
    }));

    // Width-only column defs — setting `header` here instead would overwrite
    // row 1 with the header labels rather than inserting a row, clobbering
    // the "Schema Version" row added right below.
    const manifestSheet = wb.addWorksheet("_Manifest");
    manifestSheet.columns = [{ key: "a", width: 24 }, { key: "b", width: 24 }, { key: "c", width: 14 }];
    manifestSheet.addRow(["Schema Version", BACKUP_SCHEMA_VERSION]);
    manifestSheet.addRow(["Exported At", exportedAt]);
    manifestSheet.addRow(["Exported By", exportedBy]);
    manifestSheet.addRow([]);
    const headerRowNum = manifestSheet.rowCount + 1;
    manifestSheet.addRow(["Table", "Label", "Row Count"]);
    for (const r of manifestRows) manifestSheet.addRow([r.table, r.label, r.rowCount]);
    const manifestHeaderRow = manifestSheet.getRow(headerRowNum);
    manifestHeaderRow.font = HEADER_FONT;
    manifestHeaderRow.eachCell((cell) => { cell.fill = HEADER_FILL; });

    BACKUP_TABLES.forEach((config, i) => {
      const allKeys = Object.keys(getTableColumns(config.table));
      const keys = allKeys.filter((k) => !(config.excludeColumns ?? []).includes(k));

      const sheet = wb.addWorksheet(config.label);
      sheet.columns = keys.map((k) => ({
        header: humanizeKey(k),
        key: k,
        width: Math.min(Math.max(humanizeKey(k).length + 4, 12), 40),
      }));
      for (const r of tableRows[i]) {
        const row = r as Record<string, unknown>;
        const plain: Record<string, unknown> = {};
        for (const k of keys) plain[k] = toCellValue(row[k]);
        sheet.addRow(plain);
      }
      styleHeaderRow(sheet);
    });

    await logAdminActivity({
      actor: { id: Number(guard.session.user.id) || null, email: guard.session.user.email ?? null },
      action: "backup.export",
      summary: `Exported a full data backup (${BACKUP_TABLES.length} tables)`,
      metadata: { rowCounts: manifestRows },
    });

    const buffer = await wb.xlsx.writeBuffer();
    const filename = `hsl-backup-${exportedAt.slice(0, 19).replace(/[:T]/g, "-")}.xlsx`;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};
