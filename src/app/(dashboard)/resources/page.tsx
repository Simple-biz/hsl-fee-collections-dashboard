import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { resourceLinks } from "@/lib/db/schema";
import { auth } from "@/auth";
import { isAdminRole } from "@/lib/auth-helpers";
import { ResourcesClient } from "@/components/resources/ResourcesClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Resources · SSA Fee Collections",
};

export default async function ResourcesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const rows = await db
    .select({
      id: resourceLinks.id,
      title: resourceLinks.title,
      url: resourceLinks.url,
      sortOrder: resourceLinks.sortOrder,
    })
    .from(resourceLinks)
    .orderBy(asc(resourceLinks.sortOrder), asc(resourceLinks.id));

  return (
    <div className="p-4 sm:p-6">
      <ResourcesClient
        initialLinks={rows}
        isAdmin={isAdminRole(session.user.role)}
      />
    </div>
  );
}
