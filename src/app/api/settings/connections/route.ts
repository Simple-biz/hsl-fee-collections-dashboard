import { NextRequest, NextResponse } from "next/server";

interface ConnectionStatus {
  service: string;
  label: string;
  keyConfigured: boolean;
  baseUrl: string;
  status: "connected" | "error" | "not_configured" | "untested";
  message: string;
}

// GET /api/settings/connections?test=true
export const GET = async (req: NextRequest) => {
  try {
    const shouldTest = new URL(req.url).searchParams.get("test") === "true";
    const connections: ConnectionStatus[] = [];

    // ── Chronicle Legal ──
    const chronicleKey = process.env.CHRONICLE_API_KEY || "";
    const chronicleUrl =
      process.env.CHRONICLE_API_URL || process.env.CHRONICLE_BASE_URL || "";
    const chronicleStatus: ConnectionStatus = {
      service: "chronicle",
      label: "Chronicle Legal",
      keyConfigured: !!chronicleKey,
      baseUrl: chronicleUrl,
      status: !chronicleKey ? "not_configured" : "untested",
      message: !chronicleKey
        ? "API key not set in environment variables"
        : "Key configured",
    };

    if (shouldTest && chronicleKey && chronicleUrl) {
      try {
        const res = await fetch(`${chronicleUrl}/api/clients/1`, {
          headers: { "x-api-key": chronicleKey, Accept: "application/json" },
          signal: AbortSignal.timeout(5000),
        });
        if (res.status === 401 || res.status === 403) {
          chronicleStatus.status = "error";
          chronicleStatus.message = "Authentication failed — check API key";
        } else {
          chronicleStatus.status = "connected";
          chronicleStatus.message = `API reachable (HTTP ${res.status})`;
        }
      } catch (err) {
        chronicleStatus.status = "error";
        chronicleStatus.message = `Connection failed: ${(err as Error).message}`;
      }
    }
    connections.push(chronicleStatus);

    // ── MyCase ──
    const mycaseKey = process.env.MYCASE_API_KEY || "";
    const mycaseUrl = process.env.MYCASE_API_URL || "";
    connections.push({
      service: "mycase",
      label: "MyCase",
      keyConfigured: !!mycaseKey,
      baseUrl: mycaseUrl,
      status: !mycaseKey ? "not_configured" : "untested",
      message: !mycaseKey
        ? "API key not set in environment variables"
        : "Key configured (sync not yet implemented)",
    });

    // ── CallTools ──
    const calltoolsKey = process.env.CALLTOOLS_API_KEY || "";
    connections.push({
      service: "calltools",
      label: "CallTools",
      keyConfigured: !!calltoolsKey,
      baseUrl: "",
      status: !calltoolsKey ? "not_configured" : "untested",
      message: !calltoolsKey
        ? "API key not set in environment variables"
        : "Key configured (integration not yet implemented)",
    });

    return NextResponse.json({ connections });
  } catch (error) {
    console.error("GET /api/settings/connections error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
};
