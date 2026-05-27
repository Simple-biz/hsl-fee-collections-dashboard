"use client";

import { useCallback, useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  ListChecks,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { DropdownCategory } from "@/lib/dropdown-categories";

type Option = {
  id: number;
  category: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string | null;
  updatedAt: string | null;
};

type Props = {
  category: DropdownCategory;
  label: string;
  description?: string;
};

/**
 * Admin-managed list of options for a single dropdown category (e.g.
 * "Approved By", "Assigned To"). Add / rename / activate / delete supported.
 * Backed by the generic `dropdown_options` table — filtered by `category`.
 */
export function DropdownOptionsCard({ category, label, description }: Props) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const t = themeClasses(dark);

  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | "new" | null>(null);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  const sectionCard = `rounded-xl border ${t.card}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/settings/dropdown-options?category=${encodeURIComponent(category)}`,
      );
      if (!res.ok) throw new Error("Failed to load options");
      const json = await res.json();
      setOptions(json.data || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name || busyId !== null) return;
    setBusyId("new");
    setError(null);
    try {
      const res = await fetch("/api/settings/dropdown-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, name }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to add");
      setNewName("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const handleUpdate = async (
    id: number,
    patch: Partial<Pick<Option, "name" | "isActive">>,
  ) => {
    if (busyId !== null) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/settings/dropdown-options/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to update");
      setEditingId(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (opt: Option) => {
    if (busyId !== null) return;
    if (
      !window.confirm(
        `Delete "${opt.name}"? Existing records that already use this value keep it; the dropdown just won't offer it going forward.`,
      )
    )
      return;
    setBusyId(opt.id);
    setError(null);
    try {
      const res = await fetch(`/api/settings/dropdown-options/${opt.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Failed to delete");
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const startEdit = (opt: Option) => {
    setEditingId(opt.id);
    setEditName(opt.name);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
  };
  const saveEdit = (id: number) => {
    const name = editName.trim();
    if (!name) return;
    handleUpdate(id, { name });
  };

  return (
    <div className={sectionCard}>
      <div
        className={`p-4 border-b ${t.borderLight} flex items-center justify-between`}
      >
        <h4 className={`text-xs font-bold ${t.text} flex items-center gap-2`}>
          <ListChecks className="h-3.5 w-3.5" /> {label} Options
        </h4>
        <span className={`text-[11px] ${t.textMuted}`}>
          {loading
            ? "Loading…"
            : options.length === 1
              ? "1 option"
              : `${options.length} options`}
        </span>
      </div>

      <div className="p-4 space-y-3">
        {description && (
          <p className={`text-[11px] ${t.textMuted}`}>{description}</p>
        )}

        {error && (
          <div
            role="alert"
            className={`flex items-center gap-2 rounded-md border p-2 text-xs ${dark ? "bg-red-900/20 border-red-800 text-red-400" : "bg-red-50 border-red-200 text-red-700"}`}
          >
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}

        {/* Add new */}
        <div className="flex items-center gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
            placeholder={`Add a ${label.toLowerCase()} option`}
            maxLength={150}
            disabled={busyId !== null}
            className="h-8 text-xs"
          />
          <Button
            type="button"
            size="sm"
            onClick={handleAdd}
            disabled={!newName.trim() || busyId !== null}
          >
            {busyId === "new" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            Add
          </Button>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className={`h-5 w-5 animate-spin ${t.textMuted}`} />
          </div>
        ) : options.length === 0 ? (
          <div
            className={`py-8 text-center text-[11px] ${t.textMuted} border rounded-md ${t.borderLight}`}
          >
            No options yet. Add the first one above to populate the dropdown.
          </div>
        ) : (
          <ul className={`rounded-md border ${t.borderLight} divide-y`}>
            {options.map((opt) => {
              const rowBusy = busyId === opt.id;
              const isEditing = editingId === opt.id;
              return (
                <li
                  key={opt.id}
                  className={`flex items-center gap-2 p-2 ${dark ? "divide-neutral-800" : "divide-neutral-100"}`}
                >
                  {isEditing ? (
                    <>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            saveEdit(opt.id);
                          } else if (e.key === "Escape") {
                            cancelEdit();
                          }
                        }}
                        autoFocus
                        maxLength={150}
                        disabled={rowBusy}
                        className="h-7 text-xs flex-1"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => saveEdit(opt.id)}
                        disabled={
                          !editName.trim() ||
                          rowBusy ||
                          editName.trim() === opt.name
                        }
                        className="h-7"
                      >
                        {rowBusy ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={cancelEdit}
                        disabled={rowBusy}
                        className="h-7"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span
                        className={`flex-1 text-xs ${opt.isActive ? t.text : t.textMuted} ${opt.isActive ? "" : "line-through"}`}
                      >
                        {opt.name}
                      </span>
                      <div className="flex items-center gap-1.5 mr-2">
                        <Switch
                          checked={opt.isActive}
                          onCheckedChange={(v) =>
                            handleUpdate(opt.id, { isActive: v })
                          }
                          disabled={rowBusy}
                          aria-label={`${opt.isActive ? "Deactivate" : "Activate"} ${opt.name}`}
                        />
                        <span className={`text-[10px] ${t.textMuted} w-12`}>
                          {opt.isActive ? "Active" : "Inactive"}
                        </span>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => startEdit(opt)}
                        disabled={rowBusy}
                        className="h-7"
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleDelete(opt)}
                        disabled={rowBusy}
                        className={`h-7 ${dark ? "text-red-400" : "text-red-600"}`}
                      >
                        {rowBusy ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                      </Button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
