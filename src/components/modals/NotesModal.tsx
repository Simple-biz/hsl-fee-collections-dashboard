"use client";

import { useEffect, useState } from "react";
import { X, RefreshCw, FileText, Loader2 } from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import { fmtDateTime } from "@/lib/formatters";
import { useCapabilities } from "@/hooks/useCapabilities";

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
  // Called after a note is added or removed so the caller can refresh the
  // table's notes-count badge. Optional.
  onChanged?: () => void;
  // "notes" (default): the general Notes thread — anyone with case.update
  // can post, case.delete to remove. "leader-notes": a separate, quieter
  // thread hidden from members entirely — leaderNotes.access gates viewing,
  // posting, AND deleting (audience is already narrow, so any lead who can
  // post can also clean up their own entry).
  variant?: "notes" | "leader-notes";
}

export default function NotesModal({
  dark,
  caseId,
  caseName,
  onClose,
  onChanged,
  variant = "notes",
}: NotesModalProps) {
  const t = themeClasses(dark);
  const { can } = useCapabilities();
  const isLeader = variant === "leader-notes";
  const apiPath = `/api/cases/${caseId}/${isLeader ? "leader-notes" : "notes"}`;
  const canDelete = can(isLeader ? "leaderNotes.access" : "case.delete");

  const [notes, setNotes] = useState<NoteEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(apiPath);
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
  }, [apiPath]);

  const addNote = async () => {
    const message = draft.trim();
    if (!message || adding) return;
    setAdding(true);
    setActionError(null);
    try {
      const res = await fetch(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      // Newest first — matches the GET ordering.
      setNotes((prev) => [json.data as NoteEntry, ...(prev ?? [])]);
      setDraft("");
      onChanged?.();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setAdding(false);
    }
  };

  const deleteNote = async (id: string) => {
    if (deletingId) return;
    setDeletingId(id);
    setActionError(null);
    try {
      const res = await fetch(`${apiPath}/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      setNotes((prev) => (prev ?? []).filter((n) => n.id !== id));
      setConfirmingId(null);
      onChanged?.();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setDeletingId(null);
    }
  };

  const count = notes?.length ?? 0;

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
            <h3 className={`text-sm font-bold ${t.text}`}>{isLeader ? "Leader Notes" : "Case Log"}</h3>
            <p
              className={`text-[11px] ${t.textMuted} mt-0.5 truncate max-w-md`}
            >
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

        {/* Add New Note */}
        <div className="mb-6">
          <label className={`block text-[11px] font-semibold ${t.text} mb-1.5`}>
            Add New Note
          </label>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Enter your note…"
            rows={3}
            className={`w-full px-3 py-2 rounded-md border text-[13px] outline-none resize-y ${t.inputBg}`}
          />
          <div className="mt-2 flex items-center gap-3">
            <button
              onClick={addNote}
              disabled={!draft.trim() || adding}
              className={`h-8 px-4 rounded-md text-xs font-semibold flex items-center gap-1.5 ${t.ctaBtn} disabled:opacity-50`}
            >
              {adding && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Add Note
            </button>
            {actionError && (
              <span
                className={`text-[11px] ${dark ? "text-red-400" : "text-red-600"}`}
              >
                {actionError}
              </span>
            )}
          </div>
        </div>

        {/* History */}
        <h4 className={`text-[11px] font-semibold ${t.text} mb-2`}>
          {isLeader ? "Notes History" : "Log History"} ({count})
        </h4>

        {notes === null && !error && (
          <div
            className={`flex items-center justify-center py-12 ${t.textMuted}`}
          >
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
            className={`flex flex-col items-center justify-center py-10 ${t.textMuted}`}
          >
            <FileText className="h-6 w-6 mb-2" />
            <p className="text-xs">{isLeader ? "No notes for this case yet." : "No log entries for this case yet."}</p>
          </div>
        )}

        {notes && notes.length > 0 && (
          <div className="space-y-3">
            {notes.map((n) => (
              <div
                key={n.id}
                className={`relative rounded-lg border ${t.borderLight} p-3 text-[12px] leading-relaxed`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div
                    className={`flex items-center gap-2 mb-1.5 text-[10px] font-semibold uppercase tracking-wider ${t.textMuted}`}
                  >
                    <span>{n.createdBy ?? "—"}</span>
                    <span>·</span>
                    <span>{fmtDateTime(n.createdAt)}</span>
                  </div>
                  {canDelete &&
                    (confirmingId === n.id ? (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`text-[10px] ${t.textMuted}`}>
                          Delete?
                        </span>
                        <button
                          onClick={() => deleteNote(n.id)}
                          disabled={deletingId === n.id}
                          className={`h-6 px-2 rounded text-[10px] font-semibold flex items-center gap-1 disabled:opacity-50 ${dark ? "bg-red-900/40 text-red-300 hover:bg-red-900/60" : "bg-red-600 text-white hover:bg-red-700"}`}
                        >
                          {deletingId === n.id && (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          )}
                          Delete
                        </button>
                        <button
                          onClick={() => setConfirmingId(null)}
                          disabled={deletingId === n.id}
                          className={`h-6 px-2 rounded border text-[10px] font-medium ${t.outlineBtn} disabled:opacity-50`}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmingId(n.id)}
                        aria-label="Delete note"
                        title="Delete note"
                        className={`-mt-1 -mr-1 h-6 w-6 shrink-0 rounded-md flex items-center justify-center ${t.hover} ${t.textSub}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    ))}
                </div>
                <p className={`${t.text} whitespace-pre-wrap wrap-break-word`}>
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
