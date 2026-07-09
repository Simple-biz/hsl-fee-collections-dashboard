import "server-only";
import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getTableColumns, getTableName, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";
import { logAdminActivity } from "@/lib/admin-activity";
import { BACKUP_TABLES, BACKUP_SCHEMA_VERSION, type BackupTableConfig } from "@/lib/backup/registry";
import { readSheetRows, buildReconcileKey, valuesEqual, toDbValue } from "@/lib/backup/restore-helpers";

export const runtime = "nodejs";
export const maxDuration = 120;

const DETAIL_SAMPLE_LIMIT = 25;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

type RowStatus = "new" | "changed" | "unchanged";

interface ParsedTableRow {
  key: string;
  status: RowStatus;
  values: Record<string, unknown>;
  changedFields?: { field: string; backup: string; db: string }[];
}

const readManifestSchemaVersion = (wb: ExcelJS.Workbook): number | null => {
  const manifest = wb.getWorksheet("_Manifest");
  if (!manifest) return null;
  const version = manifest.getRow(1).getCell(2).value;
  return typeof version === "number" ? version : Number(version);
};

const diffTable = (
  config: BackupTableConfig,
  backupRows: Record<string, unknown>[],
  dbRows: Record<string, unknown>[],
): { rows: ParsedTableRow[]; invalidCount: number } => {
  const columns = getTableColumns(config.table);
  const dbMap = new Map<string, Record<string, unknown>>();
  for (const r of dbRows) {
    const key = buildReconcileKey(r, config.reconcileBy);
    if (key !== null) dbMap.set(key, r);
  }

  const rows: ParsedTableRow[] = [];
  let invalidCount = 0;
  for (const backupRow of backupRows) {
    const key = buildReconcileKey(backupRow, config.reconcileBy);
    if (key === null) {
      invalidCount++;
      continue;
    }
    const dbRow = dbMap.get(key);
    if (!dbRow) {
      rows.push({ key, status: "new", values: backupRow });
      continue;
    }
    const changedFields: { field: string; backup: string; db: string }[] = [];
    for (const field of Object.keys(columns)) {
      if (config.reconcileBy.includes(field)) continue;
      if (field === "id" || field === "createdAt" || field === "updatedAt") continue;
      if (!valuesEqual(columns[field], backupRow[field], dbRow[field])) {
        changedFields.push({
          field,
          backup: String(backupRow[field] ?? ""),
          db: String(dbRow[field] ?? ""),
        });
      }
    }
    rows.push({
      key,
      status: changedFields.length > 0 ? "changed" : "unchanged",
      values: backupRow,
      changedFields,
    });
  }

  return { rows, invalidCount };
};

export const POST = async (req: NextRequest) => {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) {
      return NextResponse.json(
        { error: guard.error },
        { status: guard.error === "Unauthenticated" ? 401 : 403 },
      );
    }

    const { searchParams } = new URL(req.url);
    const modeParam = searchParams.get("mode") ?? "preview";
    if (modeParam !== "preview" && modeParam !== "apply") {
      return NextResponse.json({ error: `Invalid mode: ${modeParam}` }, { status: 400 });
    }
    const mode = modeParam;

    const form = await req.formData();
    const file = form.get("file");
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "Missing 'file' field" }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `File is too large (max ${MAX_FILE_BYTES / (1024 * 1024)}MB)` },
        { status: 413 },
      );
    }

    let includeTables: Set<string> | null = null;
    if (mode === "apply") {
      const raw = form.get("includeTables");
      if (typeof raw !== "string") {
        return NextResponse.json({ error: "Missing 'includeTables' field" }, { status: 400 });
      }
      try {
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) throw new Error();
        includeTables = new Set(arr.map(String));
      } catch {
        return NextResponse.json({ error: "includeTables must be a JSON array" }, { status: 400 });
      }
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = new ExcelJS.Workbook();
    try {
      // exceljs bundles its own (older) @types/node via a transitive dep,
      // whose Buffer type structurally conflicts with this project's —
      // the runtime value is a plain Buffer either way.
      await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
    } catch {
      return NextResponse.json({ error: "Could not read that file as an Excel workbook" }, { status: 400 });
    }

    const schemaVersion = readManifestSchemaVersion(wb);
    if (schemaVersion === null) {
      return NextResponse.json(
        { error: "This doesn't look like an HSL backup file (missing _Manifest sheet)" },
        { status: 400 },
      );
    }
    if (schemaVersion !== BACKUP_SCHEMA_VERSION) {
      return NextResponse.json(
        {
          error: `Backup schema version ${schemaVersion} doesn't match the current version ${BACKUP_SCHEMA_VERSION}. Restoring from a differently-shaped backup isn't supported yet.`,
        },
        { status: 400 },
      );
    }

    if (mode === "preview") {
      const tableResults = [];
      for (const config of BACKUP_TABLES) {
        const sheet = wb.getWorksheet(config.label);
        if (!sheet) {
          tableResults.push({
            key: config.key,
            label: config.label,
            sheetMissing: true,
            counts: { new: 0, changed: 0, unchanged: 0, missingInBackup: 0, invalid: 0 },
            sample: [],
            moreChanged: 0,
          });
          continue;
        }

        const { rows: backupRows, unmappedHeaders } = readSheetRows(sheet, config.table, config.excludeColumns);
        const dbRows = (await db.select().from(config.table)) as Record<string, unknown>[];
        const { rows, invalidCount } = diffTable(config, backupRows, dbRows);

        const backupKeySet = new Set(rows.map((r) => r.key));
        const missingInBackup = dbRows.filter((r) => {
          const key = buildReconcileKey(r, config.reconcileBy);
          return key === null || !backupKeySet.has(key);
        }).length;

        const changed = rows.filter((r) => r.status === "changed");
        const newRows = rows.filter((r) => r.status === "new");
        const unchanged = rows.length - changed.length - newRows.length;

        const sample = [...changed, ...newRows].slice(0, DETAIL_SAMPLE_LIMIT).map((r) => ({
          key: r.key,
          status: r.status,
          changedFields: r.changedFields ?? [],
        }));
        const moreChanged = Math.max(0, changed.length + newRows.length - sample.length);

        tableResults.push({
          key: config.key,
          label: config.label,
          sheetMissing: false,
          counts: {
            new: newRows.length,
            changed: changed.length,
            unchanged,
            missingInBackup,
            invalid: invalidCount,
          },
          sample,
          moreChanged,
          unmappedHeaders,
        });
      }

      return NextResponse.json({
        mode,
        schemaVersion,
        tables: tableResults,
      });
    }

    // apply mode
    const applied: Record<string, { inserted: number; updated: number }> = {};

    await db.transaction(async (tx) => {
      for (const config of BACKUP_TABLES) {
        if (!includeTables!.has(config.key)) continue;
        const sheet = wb.getWorksheet(config.label);
        if (!sheet) continue;

        const { rows: backupRows } = readSheetRows(sheet, config.table, config.excludeColumns);
        const dbRows = (await tx.select().from(config.table)) as Record<string, unknown>[];
        const { rows } = diffTable(config, backupRows, dbRows);
        const toApply = rows.filter((r) => r.status === "new" || r.status === "changed");
        if (toApply.length === 0) {
          applied[config.key] = { inserted: 0, updated: 0 };
          continue;
        }

        const columns = getTableColumns(config.table);
        const targetColumns = config.reconcileBy.map((f) => columns[f]);
        // id/createdAt are never overwritten on conflict — a restored row
        // keeps whatever identity/creation time it already has in the DB;
        // only a brand-new row's insert values populate them (from the
        // backup) at all.
        const setColumns = Object.keys(columns).filter(
          (f) => !config.reconcileBy.includes(f) && f !== "id" && f !== "createdAt",
        );

        const insertValues = toApply.map((r) => {
          const value: Record<string, unknown> = {};
          for (const k of Object.keys(columns)) {
            if (k === "id" && !config.reconcileBy.includes("id")) continue;
            if (k in r.values) value[k] = toDbValue(columns[k], r.values[k]);
          }
          return value;
        });

        const set = Object.fromEntries(
          setColumns.map((k) => [k, sql.raw(`excluded.${columns[k].name}`)]),
        );

        await tx
          .insert(config.table)
          .values(insertValues)
          .onConflictDoUpdate({ target: targetColumns, set });

        // A "new" row with an explicit id (reconcileBy includes "id") only
        // arises for a serial PK when its underlying sequence is behind —
        // otherwise that id would already exist and this would be an
        // update, not an insert. Advancing the sequence here prevents the
        // very next ordinary insert from colliding with a restored row.
        if (config.reconcileBy.includes("id") && columns.id.columnType === "PgSerial") {
          const tableName = getTableName(config.table);
          await tx.execute(
            sql`select setval(pg_get_serial_sequence(${tableName}, 'id'), (select max(id) from ${config.table}))`,
          );
        }

        applied[config.key] = {
          inserted: toApply.filter((r) => r.status === "new").length,
          updated: toApply.filter((r) => r.status === "changed").length,
        };
      }
    });

    await logAdminActivity({
      actor: { id: Number(guard.session.user.id) || null, email: guard.session.user.email ?? null },
      action: "backup.restore",
      summary: `Restored ${Object.keys(applied).length} tables from an uploaded backup`,
      metadata: { applied },
    });

    return NextResponse.json({ mode, applied });
  } catch (e) {
    const cause = e instanceof Error && e.cause instanceof Error ? `: ${e.cause.message}` : "";
    const msg = e instanceof Error ? `${e.message}${cause}` : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};
