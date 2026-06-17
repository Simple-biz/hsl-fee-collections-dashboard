import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { eq, getTableColumns } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  cases,
  feeRecords,
  feePetitions,
  activityLog,
  notifications,
  overpaidCases,
  chronicleDocuments,
  mycaseNoticeDocuments,
  userDetails,
  caseArchive,
} from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth-helpers";
import type { PgTable } from "drizzle-orm/pg-core";

export const runtime = "nodejs";

// Derives the set of timestamp column names from the Drizzle table definition,
// then returns a converter that coerces only those fields from ISO strings to
// Date objects. Using the schema's own column metadata avoids the blind regex
// heuristic that would misfire on a text field storing an ISO-looking value.
const makeRehydrator = (table: PgTable) => {
  const timestampCols = new Set(
    Object.entries(getTableColumns(table))
      .filter(([, col]) => col.columnType === "PgTimestamp")
      .map(([name]) => name),
  );
  return (obj: Record<string, unknown>): Record<string, unknown> =>
    Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [
        k,
        timestampCols.has(k) && typeof v === "string" && v.length > 0
          ? new Date(v)
          : v,
      ]),
    );
};

// Module-level so they're built once per server instance.
const rehydrateCase = makeRehydrator(cases);
const rehydrateFeeRecord = makeRehydrator(feeRecords);
const rehydrateUserDetails = makeRehydrator(userDetails);
const rehydrateFeePetitions = makeRehydrator(feePetitions);
const rehydrateOverpaidCases = makeRehydrator(overpaidCases);
const rehydrateActivityLog = makeRehydrator(activityLog);
const rehydrateNotifications = makeRehydrator(notifications);
const rehydrateChronicleDocuments = makeRehydrator(chronicleDocuments);
const rehydrateMycaseNoticeDocuments = makeRehydrator(mycaseNoticeDocuments);

const stripKeys = (
  obj: Record<string, unknown>,
  skip: Set<string>,
): Record<string, unknown> =>
  Object.fromEntries(Object.entries(obj).filter(([k]) => !skip.has(k)));

const CURRENT_SNAPSHOT_VERSION = 1;

interface RelatedSnapshots {
  _version?: number;
  userDetails: Record<string, unknown> | null;
  feePetitions: Record<string, unknown> | null;
  activityLog: Record<string, unknown>[];
  notifications: Record<string, unknown>[];
  overpaidCases: Record<string, unknown> | null;
  chronicleDocuments: Record<string, unknown>[];
  mycaseNoticeDocuments: Record<string, unknown>[];
}

const bodySchema = z.object({
  archiveId: z.string().uuid(),
  destination: z.enum(["master_list", "fees_closed"]),
});

export const POST = async (req: NextRequest) => {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) {
      return NextResponse.json(
        { error: guard.error },
        { status: guard.error === "Unauthenticated" ? 401 : 403 },
      );
    }

    let body: z.infer<typeof bodySchema>;
    try {
      body = bodySchema.parse(await req.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { archiveId, destination } = body;

    const archiveRows = await db
      .select()
      .from(caseArchive)
      .where(eq(caseArchive.id, archiveId));

    if (archiveRows.length === 0) {
      return NextResponse.json({ error: "Archive record not found" }, { status: 404 });
    }

    const archiveRow = archiveRows[0];

    const existing = await db
      .select({ clientId: cases.clientId })
      .from(cases)
      .where(eq(cases.clientId, archiveRow.originalClientId));

    if (existing.length > 0) {
      return NextResponse.json(
        { error: `Client ${archiveRow.originalClientId} already exists in the database` },
        { status: 409 },
      );
    }

    const caseSnap = archiveRow.caseSnapshot as Record<string, unknown>;
    const feeSnap = archiveRow.feeRecordSnapshot as Record<string, unknown> | null;
    const related = archiveRow.relatedSnapshots as RelatedSnapshots | null;
    const cid = archiveRow.originalClientId;

    // Reject snapshots from a future version we don't know how to restore.
    // Absence of _version means an old archive (no related tables) — that's fine.
    if (
      related != null &&
      typeof related._version === "number" &&
      related._version !== CURRENT_SNAPSHOT_VERSION
    ) {
      return NextResponse.json(
        {
          error: `Snapshot version ${related._version} is not supported (expected ${CURRENT_SNAPSHOT_VERSION}). Upgrade the application before restoring this archive.`,
        },
        { status: 422 },
      );
    }

    // Strip DB-managed serial PK and auto timestamps — DB will re-assign them.
    const skipCase = new Set(["id", "createdAt", "updatedAt"]);
    const caseInsert = rehydrateCase(stripKeys(caseSnap, skipCase));

    // Preserve the fee_record UUID so activity_log.fee_record_id FKs survive restore.
    let feeInsert: Record<string, unknown> | null = null;
    if (feeSnap) {
      const skipFee = new Set(["caseId", "createdAt", "updatedAt"]);
      const feeBase = rehydrateFeeRecord(stripKeys(feeSnap, skipFee));
      feeInsert = {
        ...feeBase,
        caseId: cid,
        isClosed: destination === "fees_closed",
        closedAt: destination === "fees_closed" ? new Date() : null,
        ...(destination === "fees_closed" ? { winSheetStatus: "closed" } : {}),
      };
    }

    await db.transaction(async (tx) => {
      await tx.insert(cases).values(caseInsert as unknown as typeof cases.$inferInsert);

      if (feeInsert) {
        await tx.insert(feeRecords).values(feeInsert as unknown as typeof feeRecords.$inferInsert);
      }

      if (related?.userDetails) {
        const skip = new Set(["id", "caseId", "createdAt", "updatedAt"]);
        const insert = { ...rehydrateUserDetails(stripKeys(related.userDetails, skip)), caseId: cid };
        await tx.insert(userDetails).values(insert as unknown as typeof userDetails.$inferInsert);
      }

      if (related?.feePetitions) {
        const skip = new Set(["id", "caseId", "createdAt", "updatedAt"]);
        const insert = { ...rehydrateFeePetitions(stripKeys(related.feePetitions, skip)), caseId: cid };
        await tx.insert(feePetitions).values(insert as unknown as typeof feePetitions.$inferInsert);
      }

      if (related?.overpaidCases) {
        const skip = new Set(["id", "caseId", "createdAt", "updatedAt"]);
        const insert = { ...rehydrateOverpaidCases(stripKeys(related.overpaidCases, skip)), caseId: cid };
        await tx.insert(overpaidCases).values(insert as unknown as typeof overpaidCases.$inferInsert);
      }

      if (related?.activityLog?.length) {
        const skip = new Set(["id", "caseId", "createdAt"]);
        const inserts = related.activityLog.map((row) => ({
          ...rehydrateActivityLog(stripKeys(row, skip)),
          caseId: cid,
        }));
        await tx.insert(activityLog).values(inserts as unknown as (typeof activityLog.$inferInsert)[]);
      }

      if (related?.notifications?.length) {
        const skip = new Set(["id", "caseId", "createdAt"]);
        const inserts = related.notifications.map((row) => ({
          ...rehydrateNotifications(stripKeys(row, skip)),
          caseId: cid,
        }));
        await tx.insert(notifications).values(inserts as unknown as (typeof notifications.$inferInsert)[]);
      }

      if (related?.chronicleDocuments?.length) {
        const skip = new Set(["id", "caseId", "createdAt", "updatedAt"]);
        const inserts = related.chronicleDocuments.map((row) => ({
          ...rehydrateChronicleDocuments(stripKeys(row, skip)),
          caseId: cid,
        }));
        await tx
          .insert(chronicleDocuments)
          .values(inserts as unknown as (typeof chronicleDocuments.$inferInsert)[])
          .onConflictDoNothing();
      }

      if (related?.mycaseNoticeDocuments?.length) {
        const skip = new Set(["id", "caseId", "createdAt", "updatedAt"]);
        const inserts = related.mycaseNoticeDocuments.map((row) => ({
          ...rehydrateMycaseNoticeDocuments(stripKeys(row, skip)),
          caseId: cid,
        }));
        await tx
          .insert(mycaseNoticeDocuments)
          .values(inserts as unknown as (typeof mycaseNoticeDocuments.$inferInsert)[])
          .onConflictDoNothing();
      }

      await tx.delete(caseArchive).where(eq(caseArchive.id, archiveId));
    });

    return NextResponse.json({ restored: 1, destination });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};
