"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { resourceLinks } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth-helpers";

const linkSchema = z.object({
  title: z.string().trim().min(1).max(200),
  url: z.string().trim().url().refine(
    (u) => u.startsWith("https://") || u.startsWith("http://"),
    { message: "URL must use http:// or https://" },
  ),
  sortOrder: z.number().int().default(0),
});

export async function createResourceLink(input: unknown) {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false as const, error: "Unauthorized" };

  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid input" };

  const { title, url, sortOrder } = parsed.data;
  const [row] = await db.insert(resourceLinks).values({
    title,
    url,
    sortOrder,
    createdBy: guard.session.user.name ?? guard.session.user.email,
  }).returning({ id: resourceLinks.id });

  return { ok: true as const, id: row.id };
}

export async function updateResourceLink(id: number, input: unknown) {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false as const, error: "Unauthorized" };

  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid input" };

  const { title, url, sortOrder } = parsed.data;
  await db
    .update(resourceLinks)
    .set({ title, url, sortOrder, updatedAt: new Date() })
    .where(eq(resourceLinks.id, id));

  return { ok: true as const };
}

export async function deleteResourceLink(id: number) {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false as const, error: "Unauthorized" };

  await db.delete(resourceLinks).where(eq(resourceLinks.id, id));
  return { ok: true as const };
}
