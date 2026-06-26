import { db } from "@/lib/db";
import { dropdownOptions } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { InboundCallsClient } from "@/components/inbound-calls/InboundCallsClient";

export default async function InboundCallsPage() {
  const members = await db
    .select({ name: dropdownOptions.name })
    .from(dropdownOptions)
    .where(eq(dropdownOptions.category, "assigned_to"))
    .orderBy(asc(dropdownOptions.sortOrder), asc(dropdownOptions.name));

  const teamMembers = members.map((m) => m.name);

  return <InboundCallsClient teamMembers={teamMembers} />;
}
