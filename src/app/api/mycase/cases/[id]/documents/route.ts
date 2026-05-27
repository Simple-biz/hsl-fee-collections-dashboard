import { NextRequest, NextResponse } from "next/server";
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
export const GET = async (
  _req: NextRequest,
  context: { params: { id: string } | Promise<{ id: string }> },
) => {
  try {
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
