"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { FileText, Search, Loader2, AlertCircle, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { themeClasses } from "@/lib/theme-classes";
import { fmtDate } from "@/lib/formatters";

type Doc = {
  id: number;
  name: string;
  filename: string | null;
  path: string | null;
  description: string | null;
  assigned_date: string | null;
  case: { id: number } | null;
  created_at: string | null;
  updated_at: string | null;
  self_url: string | null;
  folder: { id: number } | null;
};

interface MyCaseDocumentsDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  caseId: number;
  caseName?: string;
}

export function MyCaseDocumentsDialog({
  open,
  onOpenChange,
  caseId,
  caseName,
}: MyCaseDocumentsDialogProps) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const t = themeClasses(dark);

  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  // Fetch when the dialog opens. Abort if it closes mid-flight.
  useEffect(() => {
    if (!open || !Number.isFinite(caseId)) {
      setDocs([]);
      setError(null);
      setQuery("");
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/mycase/cases/${caseId}/documents`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          const j: { error?: string } = await res
            .json()
            .catch(() => ({}));
          throw new Error(j.error || `Failed to load documents (${res.status})`);
        }
        const json = await res.json();
        setDocs(Array.isArray(json.data) ? json.data : []);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError((err as Error).message);
      } finally {
        if (abortRef.current === controller) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [open, caseId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter((d) =>
      [d.name, d.filename, d.path].some((s) =>
        s ? s.toLowerCase().includes(q) : false,
      ),
    );
  }, [docs, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            Documents{caseName ? ` · ${caseName}` : ""}
          </DialogTitle>
          <DialogDescription>
            {loading
              ? "Loading documents from MyCase…"
              : error
                ? "Could not load documents."
                : `${docs.length} document${docs.length === 1 ? "" : "s"} from MyCase`}
          </DialogDescription>
        </DialogHeader>

        {!loading && !error && docs.length > 0 && (
          <div className="relative">
            <Search
              aria-hidden="true"
              className={`absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 ${t.textMuted}`}
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by name, filename, or folder path…"
              className="pl-8"
            />
          </div>
        )}

        <div
          className={`mt-2 max-h-[60vh] overflow-y-auto rounded-md border ${t.borderLight}`}
        >
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className={`h-5 w-5 animate-spin ${t.textMuted}`} />
              <span className={`ml-3 text-sm ${t.textSub}`}>
                Loading documents…
              </span>
            </div>
          ) : error ? (
            <div
              role="alert"
              className={`p-4 flex items-start gap-2 text-sm ${dark ? "text-red-400" : "text-red-700"}`}
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center">
              <FileText
                aria-hidden="true"
                className={`h-7 w-7 mx-auto opacity-30 ${t.textMuted}`}
              />
              <p className={`mt-2 text-sm ${t.textMuted}`}>
                {docs.length === 0
                  ? "No documents on this case in MyCase."
                  : "No documents match your filter."}
              </p>
            </div>
          ) : (
            <ul>
              {filtered.map((d) => (
                <li
                  key={d.id}
                  className={`px-3 py-2.5 border-b last:border-b-0 ${t.borderLight} ${dark ? "hover:bg-neutral-800/40" : "hover:bg-neutral-50"} transition-colors`}
                >
                  <div className="flex items-center gap-3">
                    <FileText
                      aria-hidden="true"
                      className={`h-4 w-4 shrink-0 ${t.textMuted}`}
                    />
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-[15px] font-medium ${t.text} truncate`}
                        title={d.filename || d.name}
                      >
                        {d.filename || d.name}
                      </p>
                      {d.path && (
                        <p
                          className={`text-[12px] ${t.textMuted} truncate`}
                          title={d.path}
                        >
                          {d.path}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`text-[12px] ${t.textMuted}`}>
                        {fmtDate(d.assigned_date || d.created_at)}
                      </span>
                      <a
                        href={`/api/mycase/documents/${d.id}/file`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex items-center gap-1 text-[13px] font-medium ${dark ? "text-indigo-400" : "text-indigo-600"} hover:underline`}
                      >
                        View
                        <ExternalLink aria-hidden="true" className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                  {d.description && (
                    <p className={`mt-1 ml-7 text-[13px] ${t.textSub}`}>
                      {d.description}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
