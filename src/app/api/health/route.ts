import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { logEvent } from "@/lib/telemetry";
import crypto from "node:crypto";

// Intentionally unauthenticated — uptime checkers must reach this without a session.
// Returns only a generic status; diagnostic detail goes to telemetry, not the response body.
export const GET = async () => {
  const start = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    return NextResponse.json({ status: "ok", database: "connected" });
  } catch (error) {
    logEvent({
      correlationId: crypto.randomUUID(),
      route: "/api/health",
      operation: "health.check",
      durationMs: Date.now() - start,
      outcome: "db_error",
      serverError: error instanceof Error ? error.message : String(error),
      serverStack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({ status: "error" }, { status: 503 });
  }
};
