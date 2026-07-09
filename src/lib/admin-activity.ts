import "server-only";
import { db } from "@/lib/db";
import { adminActivityLog } from "@/lib/db/schema";

// Action keys for the admin audit trail. Keep these stable — they're stored in
// the DB and used to pick the badge/label in the UI.
export type AdminAction =
  | "user.create"
  | "user.role_change"
  | "user.activate"
  | "user.deactivate"
  | "user.password_reset"
  | "user.access_update"
  | "backup.export"
  | "backup.restore";

export interface AdminActor {
  id: number | null;
  email: string | null;
}

/**
 * Append an entry to the admin audit trail. Best-effort: a logging failure
 * must never break the admin action that triggered it, so errors are swallowed
 * (and logged to the server console).
 */
export async function logAdminActivity(entry: {
  actor: AdminActor;
  action: AdminAction;
  targetUserId?: number | null;
  targetEmail?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(adminActivityLog).values({
      actorId: entry.actor.id,
      actorEmail: entry.actor.email,
      action: entry.action,
      targetUserId: entry.targetUserId ?? null,
      targetEmail: entry.targetEmail ?? null,
      summary: entry.summary,
      metadata: entry.metadata ?? null,
    });
  } catch (err) {
    console.error("logAdminActivity error:", err);
  }
}
