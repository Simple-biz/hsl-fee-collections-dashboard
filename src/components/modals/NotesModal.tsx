"use client";

import { useEffect, useState } from "react";
import { X, RefreshCw, FileText } from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import { fmtDate } from "@/lib/formatters";

interface NoteEntry {
  id: string;
  message: string;
  createdBy: string | null;
  createdAt: string;
}

interface NotesModalProps {
  dark: boolean;
  caseId: number;
  caseName: string;
  onClose: () => void;
}

export default function NotesModal({
  dark,
  caseId,
  caseName,
  onClose,
}: NotesModalProps) {
  const t = themeClasses(dark);
  const [notes, setNotes] = useState<NoteEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/cases/${caseId}/notes`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        if (!cancelled) setNotes(json.data);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50" />
      <div
        className={`relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl border ${t.card} p-6 mx-4`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className={`text-sm font-bold ${t.text}`}>Case Notes</h3>
            <p className={`text-[11px] ${t.textMuted} mt-0.5 truncate max-w-md`}>
              {caseName}
            </p>
          </div>
          <button
            onClick={onClose}
            className={`h-7 w-7 rounded-md flex items-center justify-center ${t.hover} ${t.textSub}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {notes === null && !error && (
          <div className={`flex items-center justify-center py-12 ${t.textMuted}`}>
            <RefreshCw className="h-4 w-4 animate-spin mr-2" />
            <span className="text-xs">Loading notes…</span>
          </div>
        )}

        {error && (
          <div
            className={`rounded-md border p-3 text-xs ${dark ? "bg-red-900/20 border-red-800 text-red-300" : "bg-red-50 border-red-200 text-red-700"}`}
          >
            {error}
          </div>
        )}

        {notes && notes.length === 0 && (
          <div
            className={`flex flex-col items-center justify-center py-12 ${t.textMuted}`}
          >
            <FileText className="h-6 w-6 mb-2" />
            <p className="text-xs">No notes for this case yet.</p>
          </div>
        )}

        {notes && notes.length > 0 && (
          <div className="space-y-3">
            {notes.map((n) => (
              <div
                key={n.id}
                className={`rounded-lg border ${t.borderLight} p-3 text-[12px] leading-relaxed`}
              >
                <div
                  className={`flex items-center gap-2 mb-1.5 text-[10px] font-semibold uppercase tracking-wider ${t.textMuted}`}
                >
                  <span>{n.createdBy ?? "—"}</span>
                  <span>·</span>
                  <span>{fmtDate(n.createdAt.slice(0, 10))}</span>
                </div>
                <p className={`${t.text} whitespace-pre-wrap break-words`}>
                  {n.message}
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end mt-6 pt-4 border-t border-current/10">
          <button
            onClick={onClose}
            className={`h-8 px-4 rounded-md text-xs font-semibold ${t.ctaBtn}`}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
