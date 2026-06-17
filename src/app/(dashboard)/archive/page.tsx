import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { ArchivePageClient } from "./ArchivePageClient";

// Auth-gated and session-dependent → never prerender.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Archive · SSA Fee Collections",
};

export default async function ArchiveRoute() {
  const guard = await requireAdmin();
  if (!guard.ok) {
    redirect(guard.error === "Unauthenticated" ? "/login" : "/");
  }

  return <ArchivePageClient />;
}
