import { NextRequest, NextResponse } from "next/server";
import { fetchDocumentDownloadUrl } from "@/lib/mycase-proxy";

// Filename-extension → MIME, used to coerce a previewable Content-Type when
// MyCase/S3 hands back a generic one. Types not listed here just download.
const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
  txt: "text/plain",
};

const resolveParams = async (context: {
  params: { id: string } | Promise<{ id: string }>;
}) => {
  const p =
    context.params instanceof Promise ? await context.params : context.params;
  return parseInt(p.id);
};

// GET /api/mycase/documents/[id]/file
// Resolves the document's temporary MyCase (S3) URL via n8n, fetches the file
// server-side, and re-serves it with `Content-Disposition: inline` so the
// browser previews it (PDFs/images) instead of downloading. MyCase's signed URL
// forces `attachment` and we can't change that on the URL itself (it's part of
// the signature), so we override the disposition here.
export const GET = async (
  _req: NextRequest,
  context: { params: { id: string } | Promise<{ id: string }> },
) => {
  try {
    const documentId = await resolveParams(context);
    if (!Number.isFinite(documentId)) {
      return NextResponse.json(
        { error: "Invalid document ID" },
        { status: 400 },
      );
    }

    const signedUrl = await fetchDocumentDownloadUrl(documentId);

    const fileRes = await fetch(signedUrl, { cache: "no-store" });
    if (!fileRes.ok || !fileRes.body) {
      return NextResponse.json(
        { error: `Could not fetch file from MyCase (${fileRes.status})` },
        { status: 502 },
      );
    }

    // Browsers decide preview-vs-download largely from Content-Type. MyCase's
    // S3 objects are often served as a generic type, which forces a download
    // even with `inline`. Infer the real MIME from the filename in the signed
    // URL and prefer that over the generic upstream type.
    const fileName = decodeURIComponent(
      new URL(signedUrl).pathname.split("/").pop() || "",
    );
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
    const inferredType = EXT_MIME[ext];
    const upstreamType = fileRes.headers.get("content-type");
    const isGeneric =
      !upstreamType ||
      upstreamType.includes("octet-stream") ||
      upstreamType === "binary/octet-stream";

    const headers = new Headers();
    headers.set(
      "Content-Type",
      (isGeneric ? inferredType : upstreamType) ??
        upstreamType ??
        "application/octet-stream",
    );
    const contentLength = fileRes.headers.get("content-length");
    if (contentLength) headers.set("Content-Length", contentLength);
    // Inline so supported types (PDF, images) preview in the browser.
    headers.set(
      "Content-Disposition",
      `inline${fileName ? `; filename="${fileName.replace(/"/g, "")}"` : ""}`,
    );
    headers.set("Cache-Control", "private, no-store");

    return new NextResponse(fileRes.body, { status: 200, headers });
  } catch (err) {
    console.error("GET /api/mycase/documents/[id]/file error:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
};
