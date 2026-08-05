/**
 * Standalone CLI equivalent of the Admin > Backup & Restore "Export" button
 * (src/app/api/admin/backup/export/route.ts). Produces the same
 * BACKUP_TABLES-driven, restore-compatible .xlsx — usable ahead of a manual
 * data cleanup where there's no browser session to hit the authenticated route.
 *
 * Usage:
 *   npm run db:studio -- (n/a) — instead run directly:
 *   npx dotenv -e .env.local -- tsx scripts/backup-full-export.ts
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import ExcelJS from "exceljs";
import { getTableColumns } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import * as schema from "../src/lib/db/schema";

// Mirrors src/lib/backup/registry.ts (BACKUP_TABLES) and src/lib/backup/humanize.ts
// (humanizeKey) verbatim. Reimplemented here rather than imported because both
// of those files start with `import "server-only"`, which throws when loaded
// outside a Next.js server-component bundle (i.e. under plain tsx). Keep this
// list in sync with registry.ts if that file changes.
const BACKUP_SCHEMA_VERSION = 1;
const BACKUP_TABLES: { key: string; label: string; table: PgTable; excludeColumns?: string[] }[] = [
  { key: "Cases", label: "Cases", table: schema.cases, excludeColumns: ["fullSsn", "ssnEncrypted"] },
  { key: "FeeRecords", label: "Fee Records", table: schema.feeRecords },
  { key: "FeePetitions", label: "Fee Petitions", table: schema.feePetitions },
  { key: "FeePayments", label: "Fee Payments", table: schema.feePayments },
  { key: "OverpaidCases", label: "Overpaid Cases", table: schema.overpaidCases },
  { key: "UserDetails", label: "User Details", table: schema.userDetails, excludeColumns: ["ssn"] },
  { key: "TeamMembers", label: "Team Members", table: schema.teamMembers },
  { key: "DropdownOptions", label: "Dropdown Options", table: schema.dropdownOptions },
  { key: "DailyMetrics", label: "Daily Metrics", table: schema.dailyMetrics },
  { key: "InboundCallRecords", label: "Inbound Calls", table: schema.inboundCallRecords },
  { key: "InboundCallPoc", label: "Inbound Call POC", table: schema.inboundCallPoc },
  { key: "LeaderNotes", label: "Leader Notes", table: schema.leaderNotes },
  { key: "CaseArchive", label: "Case Archive", table: schema.caseArchive },
  { key: "ChronicleDocuments", label: "Chronicle Documents", table: schema.chronicleDocuments },
  { key: "MyCaseNoticeDocuments", label: "MyCase Notice Docs", table: schema.mycaseNoticeDocuments },
];

const WORD_OVERRIDES: Record<string, string> = {
  id: "ID", ssa: "SSA", ssn: "SSN", alj: "ALJ", dob: "DOB", ein: "EIN",
  poc: "POC", ib: "IB", ob: "OB", url: "URL", pdf: "PDF",
  t16: "T16", t2: "T2", aux: "AUX",
  mycase: "MyCase",
  ltr: "Letter", clmt: "Claimant", conf: "Confirmation", op: "Overpayment",
};

function humanizeKey(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(" ")
    .filter(Boolean);
  return words
    .map((w) => WORD_OVERRIDES[w.toLowerCase()] ?? w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

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

const toCellValue = (v: unknown): unknown => {
  if (v instanceof Date) return v.toISOString();
  if (v !== null && typeof v === "object") return JSON.stringify(v);
  return v;
};

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set. Run via: npx dotenv -e .env.local -- tsx scripts/backup-full-export.ts");
    process.exit(1);
  }

  const client = postgres(connectionString, { max: 1, prepare: false });
  const db = drizzle(client, { schema });

  try {
    const tableRows = await Promise.all(
      BACKUP_TABLES.map((config) => db.select().from(config.table)),
    );

    const wb = new ExcelJS.Workbook();
    const exportedAt = new Date().toISOString();
    const exportedBy = "CLI script (scripts/backup-full-export.ts) — pre-cleanup snapshot for duplicate Fees Closed rows";
    const manifestRows = BACKUP_TABLES.map((config, i) => ({
      table: config.key,
      label: config.label,
      rowCount: tableRows[i].length,
    }));

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

    const filename = `hsl-backup-${exportedAt.slice(0, 19).replace(/[:T]/g, "-")}.xlsx`;
    await wb.xlsx.writeFile(filename);
    console.log(`✓ Wrote ${filename}`);
    for (const r of manifestRows) console.log(`  ${r.label}: ${r.rowCount} rows`);
  } catch (err) {
    console.error("Backup export failed:", err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
