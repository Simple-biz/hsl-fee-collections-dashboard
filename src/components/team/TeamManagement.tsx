"use client";

import { useState, useEffect, useCallback } from "react";
import { useTheme } from "next-themes";
import {
  Users,
  Plus,
  Pencil,
  UserX,
  UserCheck,
  Briefcase,
  DollarSign,
  Loader2,
  AlertCircle,
  Search,
  ChevronDown,
  RefreshCw,
  X,
} from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TeamMemberFull {
  id: number;
  name: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  cases: number;
  collected: number;
  activeCases: number;
  pifCases: number;
}

const ROLES = [
  { value: "collections_specialist", label: "Collections Specialist" },
  { value: "collections_manager", label: "Collections Manager" },
  { value: "paralegal", label: "Paralegal" },
  { value: "attorney", label: "Attorney" },
  { value: "admin", label: "Admin" },
] as const;

const roleLabel = (role: string) =>
  ROLES.find((r) => r.value === role)?.label ??
  role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const fmtMoney = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export const TeamManagement = () => {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const t = themeClasses(dark);

  const [members, setMembers] = useState<TeamMemberFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMemberFull | null>(
    null,
  );
  const [formName, setFormName] = useState("");
  const [formRole, setFormRole] = useState("collections_specialist");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Confirm deactivate
  const [confirmMember, setConfirmMember] = useState<TeamMemberFull | null>(
    null,
  );
  const [deactivating, setDeactivating] = useState(false);

  /* ---- Fetch ---- */
  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch("/api/team-members");
      if (!res.ok) throw new Error("Failed to load team members");
      const json = await res.json();
      setMembers(json.data);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  /* ---- Filter ---- */
  const filtered = members.filter((m) => {
    if (!showInactive && !m.isActive) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        m.name.toLowerCase().includes(q) || m.role.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const activeCount = members.filter((m) => m.isActive).length;
  const totalCases = members.reduce((a, m) => a + m.cases, 0);
  const totalCollected = members.reduce((a, m) => a + m.collected, 0);

  /* ---- Dialog handlers ---- */
  const openAddDialog = () => {
    setEditingMember(null);
    setFormName("");
    setFormRole("collections_specialist");
    setFormError(null);
    setDialogOpen(true);
  };

  const openEditDialog = (m: TeamMemberFull) => {
    setEditingMember(m);
    setFormName(m.name);
    setFormRole(m.role);
    setFormError(null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      setFormError("Name is required");
      return;
    }
    setSaving(true);
    setFormError(null);

    try {
      if (editingMember) {
        const res = await fetch("/api/team-members", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingMember.id,
            name: formName.trim(),
            role: formRole,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to update");
      } else {
        const res = await fetch("/api/team-members", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: formName.trim(), role: formRole }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to create");
      }
      setDialogOpen(false);
      await fetchMembers();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  /* ---- Deactivate / Reactivate ---- */
  const handleToggleActive = async (m: TeamMemberFull) => {
    if (m.isActive) {
      setConfirmMember(m);
      return;
    }
    // Reactivate directly
    try {
      await fetch("/api/team-members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: m.id, isActive: true }),
      });
      await fetchMembers();
    } catch {}
  };

  const confirmDeactivate = async () => {
    if (!confirmMember) return;
    setDeactivating(true);
    try {
      await fetch(`/api/team-members?id=${confirmMember.id}`, {
        method: "DELETE",
      });
      setConfirmMember(null);
      await fetchMembers();
    } catch {}
    setDeactivating(false);
  };

  /* ------------------------------------------------------------------ */
  /*  Render                                                             */
  /* ------------------------------------------------------------------ */

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className={`h-6 w-6 animate-spin ${t.textMuted}`} />
        <span className={`ml-3 text-sm ${t.textSub}`}>Loading team...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`rounded-xl border p-4 flex items-center gap-3 ${dark ? "bg-red-900/20 border-red-800 text-red-400" : "bg-red-50 border-red-200 text-red-700"}`}
      >
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span className="text-sm">Failed to load team data: {error}</span>
        <button
          onClick={fetchMembers}
          className="ml-auto text-xs font-medium underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ---- Header Row ---- */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className={`text-lg font-bold ${t.text} flex items-center gap-2`}>
            <Users className="h-5 w-5 text-indigo-500" />
            Team Management
          </h2>
          <p className={`text-xs ${t.textMuted} mt-0.5`}>
            Manage collections specialists and case assignments
          </p>
        </div>
        <button
          onClick={openAddDialog}
          className={`h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 ${t.ctaBtn}`}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Member
        </button>
      </div>

      {/* ---- Stat Cards ---- */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          {
            label: "Active Members",
            value: activeCount,
            icon: Users,
            color: "indigo",
          },
          {
            label: "Total Cases",
            value: totalCases,
            icon: Briefcase,
            color: "amber",
          },
          {
            label: "Total Collected",
            value: fmtMoney(totalCollected),
            icon: DollarSign,
            color: "emerald",
          },
        ].map((card) => (
          <div
            key={card.label}
            className={`rounded-xl border p-4 ${t.card} flex items-center gap-3`}
          >
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                dark ? `bg-${card.color}-900/30` : `bg-${card.color}-50`
              }`}
            >
              <card.icon
                className={`h-4.5 w-4.5 ${
                  dark ? `text-${card.color}-400` : `text-${card.color}-600`
                }`}
              />
            </div>
            <div>
              <p className={`text-[11px] ${t.textMuted}`}>{card.label}</p>
              <p className={`text-xl font-bold ${t.text}`}>{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ---- Filters ---- */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400" />
          <input
            type="text"
            placeholder="Search name or role..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`w-full h-8 pl-8 pr-3 rounded-lg border text-xs outline-none ${t.inputBg} focus:ring-2 focus:ring-indigo-500/40`}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2"
            >
              <X className={`h-3 w-3 ${t.textMuted}`} />
            </button>
          )}
        </div>
        <label
          className={`inline-flex items-center gap-1.5 text-[11px] ${t.textMuted} cursor-pointer select-none`}
        >
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded border-neutral-400 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
          />
          Show inactive
        </label>
      </div>

      {/* ---- Table ---- */}
      <div className={`rounded-xl border overflow-hidden ${t.card}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className={dark ? "bg-neutral-800/50" : "bg-neutral-50"}>
                <th
                  className={`px-4 py-2.5 text-left font-semibold ${t.textMuted} text-[11px]`}
                >
                  Name
                </th>
                <th
                  className={`px-4 py-2.5 text-left font-semibold ${t.textMuted} text-[11px]`}
                >
                  Role
                </th>
                <th
                  className={`px-4 py-2.5 text-center font-semibold ${t.textMuted} text-[11px]`}
                >
                  Status
                </th>
                <th
                  className={`px-4 py-2.5 text-right font-semibold ${t.textMuted} text-[11px]`}
                >
                  Cases
                </th>
                <th
                  className={`px-4 py-2.5 text-right font-semibold ${t.textMuted} text-[11px]`}
                >
                  Active
                </th>
                <th
                  className={`px-4 py-2.5 text-right font-semibold ${t.textMuted} text-[11px]`}
                >
                  PIF
                </th>
                <th
                  className={`px-4 py-2.5 text-right font-semibold ${t.textMuted} text-[11px]`}
                >
                  Collected
                </th>
                <th
                  className={`px-4 py-2.5 text-right font-semibold ${t.textMuted} text-[11px]`}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody
              className={`divide-y ${dark ? "divide-neutral-800" : "divide-neutral-100"}`}
            >
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className={`px-4 py-12 text-center text-sm ${t.textMuted}`}
                  >
                    {search
                      ? "No team members match your search"
                      : "No team members found. Click 'Add Member' to get started."}
                  </td>
                </tr>
              ) : (
                filtered.map((m) => (
                  <tr
                    key={m.id}
                    className={`${dark ? "hover:bg-neutral-800/40" : "hover:bg-neutral-50"} transition-colors ${!m.isActive ? "opacity-50" : ""}`}
                  >
                    {/* Name */}
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold ${t.avatarBg}`}
                        >
                          {m.name.charAt(0).toUpperCase()}
                        </div>
                        <span className={`font-semibold ${t.text}`}>
                          {m.name}
                        </span>
                      </div>
                    </td>

                    {/* Role */}
                    <td className={`px-4 py-2.5 ${t.textSub}`}>
                      {roleLabel(m.role)}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-2.5 text-center">
                      {m.isActive ? (
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            dark
                              ? "bg-emerald-900/30 text-emerald-400"
                              : "bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          Active
                        </span>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            dark
                              ? "bg-neutral-800 text-neutral-500"
                              : "bg-neutral-100 text-neutral-500"
                          }`}
                        >
                          Inactive
                        </span>
                      )}
                    </td>

                    {/* Cases */}
                    <td
                      className={`px-4 py-2.5 text-right font-semibold ${t.text}`}
                    >
                      {m.cases}
                    </td>

                    {/* Active */}
                    <td className={`px-4 py-2.5 text-right ${t.textSub}`}>
                      {m.activeCases}
                    </td>

                    {/* PIF */}
                    <td className={`px-4 py-2.5 text-right ${t.textSub}`}>
                      {m.pifCases}
                    </td>

                    {/* Collected */}
                    <td className="px-4 py-2.5 text-right font-semibold text-emerald-500">
                      {fmtMoney(m.collected)}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        <button
                          onClick={() => openEditDialog(m)}
                          className={`rounded-md p-1.5 ${t.textMuted} hover:text-indigo-500 ${t.hover} transition-colors`}
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleToggleActive(m)}
                          className={`rounded-md p-1.5 ${t.textMuted} transition-colors ${
                            m.isActive
                              ? "hover:text-red-500"
                              : "hover:text-emerald-500"
                          } ${t.hover}`}
                          title={m.isActive ? "Deactivate" : "Reactivate"}
                        >
                          {m.isActive ? (
                            <UserX className="h-3.5 w-3.5" />
                          ) : (
                            <UserCheck className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---- Add/Edit Dialog ---- */}
      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className={`absolute inset-0 ${dark ? "bg-black/60" : "bg-black/30"} backdrop-blur-sm`}
            onClick={() => setDialogOpen(false)}
          />
          <div
            className={`relative z-10 w-full max-w-md rounded-xl border shadow-2xl p-5 ${
              dark
                ? "bg-neutral-900 border-neutral-700"
                : "bg-white border-neutral-200"
            }`}
          >
            <h3 className={`text-sm font-bold ${t.text} mb-4`}>
              {editingMember ? "Edit Team Member" : "Add Team Member"}
            </h3>

            <div className="space-y-3">
              {/* Name */}
              <div>
                <label
                  className={`block text-[11px] font-semibold ${t.textMuted} mb-1`}
                >
                  Name
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Drake"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && handleSave()}
                  className={`w-full h-8 px-3 rounded-lg border text-xs outline-none ${t.inputBg} focus:ring-2 focus:ring-indigo-500/40`}
                />
              </div>

              {/* Role */}
              <div>
                <label
                  className={`block text-[11px] font-semibold ${t.textMuted} mb-1`}
                >
                  Role
                </label>
                <div className="relative">
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value)}
                    className={`w-full h-8 px-3 pr-8 rounded-lg border text-xs outline-none appearance-none ${t.inputBg} focus:ring-2 focus:ring-indigo-500/40`}
                  >
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    className={`absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 ${t.textMuted} pointer-events-none`}
                  />
                </div>
              </div>

              {/* Error */}
              {formError && (
                <div
                  className={`rounded-lg px-3 py-2 text-xs flex items-center gap-2 ${
                    dark
                      ? "bg-red-900/20 border border-red-800 text-red-400"
                      : "bg-red-50 border border-red-200 text-red-700"
                  }`}
                >
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {formError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                onClick={() => setDialogOpen(false)}
                className={`h-8 px-3 rounded-lg text-xs font-medium ${t.outlineBtn} border`}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className={`h-8 px-4 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 ${t.ctaBtn} disabled:opacity-50`}
              >
                {saving && <Loader2 className="h-3 w-3 animate-spin" />}
                {editingMember ? "Save Changes" : "Add Member"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Confirm Deactivate Dialog ---- */}
      {confirmMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className={`absolute inset-0 ${dark ? "bg-black/60" : "bg-black/30"} backdrop-blur-sm`}
            onClick={() => setConfirmMember(null)}
          />
          <div
            className={`relative z-10 w-full max-w-sm rounded-xl border shadow-2xl p-5 ${
              dark
                ? "bg-neutral-900 border-neutral-700"
                : "bg-white border-neutral-200"
            }`}
          >
            <h3 className={`text-sm font-bold ${t.text} mb-2`}>
              Deactivate Member?
            </h3>
            <p className={`text-xs ${t.textMuted} mb-5 leading-relaxed`}>
              This will mark{" "}
              <strong className={t.text}>{confirmMember.name}</strong> as
              inactive. Their {confirmMember.cases} existing case assignments
              will be preserved. You can reactivate them later.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setConfirmMember(null)}
                className={`h-8 px-3 rounded-lg text-xs font-medium ${t.outlineBtn} border`}
              >
                Cancel
              </button>
              <button
                onClick={confirmDeactivate}
                disabled={deactivating}
                className="h-8 px-4 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deactivating && <Loader2 className="h-3 w-3 animate-spin" />}
                Deactivate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
