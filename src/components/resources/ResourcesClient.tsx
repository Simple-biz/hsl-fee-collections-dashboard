"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import { useTheme } from "next-themes";
import {
  createResourceLink,
  updateResourceLink,
  deleteResourceLink,
} from "@/app/(dashboard)/resources/actions";

export interface ResourceLink {
  id: number;
  title: string;
  url: string;
  sortOrder: number;
}

interface ResourcesClientProps {
  initialLinks: ResourceLink[];
  isAdmin: boolean;
}

interface FormState {
  title: string;
  url: string;
}

const EMPTY_FORM: FormState = { title: "", url: "" };

const btnBase = `inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors`;

export function ResourcesClient({ initialLinks, isAdmin }: ResourcesClientProps) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const t = themeClasses(dark);

  const [links, setLinks] = useState<ResourceLink[]>(initialLinks);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleAdd = () => {
    if (!addForm.title.trim() || !addForm.url.trim()) return;
    setError(null);
    startTransition(async () => {
      const maxSort = links.reduce((m, l) => Math.max(m, l.sortOrder), -1);
      const result = await createResourceLink({
        title: addForm.title.trim(),
        url: addForm.url.trim(),
        sortOrder: maxSort + 1,
      });
      if (!result.ok) { setError(result.error); return; }
      setLinks((prev) => [
        ...prev,
        { id: result.id, title: addForm.title.trim(), url: addForm.url.trim(), sortOrder: maxSort + 1 },
      ]);
      setAddForm(EMPTY_FORM);
      setAddOpen(false);
    });
  };

  const startEdit = (link: ResourceLink) => {
    setEditingId(link.id);
    setEditForm({ title: link.title, url: link.url });
    setError(null);
  };

  const handleEdit = (id: number) => {
    if (!editForm.title.trim() || !editForm.url.trim()) return;
    setError(null);
    startTransition(async () => {
      const link = links.find((l) => l.id === id);
      const result = await updateResourceLink(id, {
        title: editForm.title.trim(),
        url: editForm.url.trim(),
        sortOrder: link?.sortOrder ?? 0,
      });
      if (!result.ok) { setError(result.error); return; }
      setLinks((prev) =>
        prev.map((l) => l.id === id ? { ...l, title: editForm.title.trim(), url: editForm.url.trim() } : l)
      );
      setEditingId(null);
    });
  };

  const handleDelete = (id: number) => {
    setError(null);
    startTransition(async () => {
      const result = await deleteResourceLink(id);
      if (!result.ok) { setError(result.error); return; }
      setLinks((prev) => prev.filter((l) => l.id !== id));
    });
  };

  const inputCls = `w-full px-2.5 py-1.5 rounded-md border text-sm ${t.inputBg} ${t.text} ${dark ? "border-neutral-700 focus:border-indigo-500" : "border-neutral-300 focus:border-indigo-400"} outline-none transition-colors`;
  const btnOutline = `${btnBase} ${dark ? "border-neutral-700 text-neutral-300 hover:bg-neutral-800" : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"}`;
  const btnDanger = `${btnBase} ${dark ? "border-red-800 text-red-400 hover:bg-red-900/20" : "border-red-200 text-red-600 hover:bg-red-50"}`;
  const btnPrimary = `${btnBase} ${dark ? "border-indigo-700 bg-indigo-900/30 text-indigo-300 hover:bg-indigo-900/50" : "border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"}`;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Header */}
      <div className={`rounded-xl border ${t.card}`}>
        <div className={`p-4 flex items-center justify-between border-b ${t.borderLight}`}>
          <div>
            <h2 className={`text-sm font-bold ${t.text}`}>Important Links</h2>
            <p className={`text-[13px] ${t.textMuted} mt-0.5`}>
              Reference tools and resources for the collections team.
            </p>
          </div>
          {isAdmin && !addOpen && (
            <button
              onClick={() => { setAddOpen(true); setAddForm(EMPTY_FORM); setError(null); }}
              className={btnPrimary}
              disabled={pending}
            >
              <Plus aria-hidden="true" className="h-3.5 w-3.5" />
              Add link
            </button>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div
            role="alert"
            className={`mx-4 mt-3 rounded-md border p-2.5 text-xs flex items-center gap-2 ${dark ? "bg-red-900/20 border-red-800 text-red-400" : "bg-red-50 border-red-200 text-red-700"}`}
          >
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} aria-label="Dismiss error">
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Add form */}
        {isAdmin && addOpen && (
          <div className={`p-4 border-b ${t.borderLight} flex flex-col sm:flex-row gap-2`}>
            <input
              className={`${inputCls} flex-1`}
              placeholder="Title (e.g. PDB/Fee Calculator AI)"
              value={addForm.title}
              onChange={(e) => setAddForm((f) => ({ ...f, title: e.target.value }))}
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") setAddOpen(false); }}
            />
            <input
              className={`${inputCls} flex-1`}
              placeholder="https://..."
              value={addForm.url}
              onChange={(e) => setAddForm((f) => ({ ...f, url: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") setAddOpen(false); }}
            />
            <div className="flex gap-1.5 shrink-0">
              <button onClick={handleAdd} disabled={pending || !addForm.title.trim() || !addForm.url.trim()} className={btnPrimary} aria-label="Save new link">
                <Check aria-hidden="true" className="h-3.5 w-3.5" />
                Save
              </button>
              <button onClick={() => setAddOpen(false)} className={btnOutline} aria-label="Cancel">
                <X aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {links.length === 0 && !addOpen && (
          <div className={`flex flex-col items-center justify-center py-16 ${t.textMuted}`}>
            <p className="text-sm font-medium">No links yet.</p>
            {isAdmin && (
              <p className="text-xs mt-1">Click &ldquo;Add link&rdquo; to get started.</p>
            )}
          </div>
        )}

        {/* Links list */}
        {links.length > 0 && (
          <ul>
            {links.map((link, idx) => (
              <li
                key={link.id}
                className={`flex items-center gap-3 px-4 py-3 ${idx < links.length - 1 ? `border-b ${dark ? "border-neutral-800/50" : "border-neutral-100"}` : ""} ${editingId === link.id ? (dark ? "bg-neutral-800/40" : "bg-neutral-50") : ""}`}
              >
                {editingId === link.id ? (
                  <div className="flex flex-1 flex-col sm:flex-row gap-2">
                    <input
                      className={`${inputCls} flex-1`}
                      value={editForm.title}
                      onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                      autoFocus
                      onKeyDown={(e) => { if (e.key === "Enter") handleEdit(link.id); if (e.key === "Escape") setEditingId(null); }}
                    />
                    <input
                      className={`${inputCls} flex-1`}
                      value={editForm.url}
                      onChange={(e) => setEditForm((f) => ({ ...f, url: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") handleEdit(link.id); if (e.key === "Escape") setEditingId(null); }}
                    />
                    <div className="flex gap-1.5 shrink-0">
                      <button onClick={() => handleEdit(link.id)} disabled={pending} className={btnPrimary} aria-label="Save changes">
                        <Check aria-hidden="true" className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setEditingId(null)} className={btnOutline} aria-label="Cancel edit">
                        <X aria-hidden="true" className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className={`flex-1 flex items-center gap-2 text-sm font-medium hover:underline ${dark ? "text-indigo-400" : "text-indigo-600"}`}
                    >
                      {link.title}
                      <ExternalLink aria-hidden="true" className="h-3.5 w-3.5 opacity-50 shrink-0" />
                    </a>
                    {isAdmin && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => startEdit(link)} className={btnOutline} aria-label={`Edit ${link.title}`} disabled={pending}>
                          <Pencil aria-hidden="true" className="h-3 w-3" />
                        </button>
                        <button onClick={() => handleDelete(link.id)} className={btnDanger} aria-label={`Delete ${link.title}`} disabled={pending}>
                          <Trash2 aria-hidden="true" className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
