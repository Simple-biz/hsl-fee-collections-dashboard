import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { sessionHasPageAccess, sessionHasCapability } from "@/lib/auth-helpers";
import { fetchCaseDocuments } from "@/lib/mycase-proxy";

const resolveParams = async (context: {
  params: { id: string } | Promise<{ id: string }>;
}) => {
  const p =
    context.params instanceof Promise ? await context.params : context.params;
  return parseInt(p.id);
};

// GET /api/mycase/cases/[id]/documents
// Returns the MyCase documents for the given case id (via the n8n proxy).
//
// Access rule: any authenticated user with Master Fees page access and the
// case.editPii capability may view documents for any case (all-staff model —
// see issue #443 for the explicit entitlement decision).
export const GET = async (
  _req: NextRequest,
  context: { params: { id: string } | Promise<{ id: string }> },
) => {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (
      !sessionHasPageAccess(session, "master_fees") ||
      !sessionHasCapability(session, "case.editPii")
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const caseId = await resolveParams(context);
    if (!Number.isFinite(caseId)) {
      return NextResponse.json({ error: "Invalid case ID" }, { status: 400 });
    }
    const data = await fetchCaseDocuments(caseId);
    return NextResponse.json({ data });
  } catch (err) {
    console.error("GET /api/mycase/cases/[id]/documents error:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
};
