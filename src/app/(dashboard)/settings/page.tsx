"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useSyncExternalStore,
} from "react";
import { useTheme } from "next-themes";
import {
  Settings,
  DollarSign,
  Key,
  Target,
  Bell,
  RefreshCw,
  Save,
  Plus,
  Trash2,
  Check,
  AlertCircle,
  Calendar,
  Link2,
  Shield,
  Wifi,
  WifiOff,
  Loader2,
  // ExternalLink,
  CircleDot,
} from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";

// ============================================================================
// Types
// ============================================================================

interface AppSetting {
  key: string;
  value: string;
  rawValue?: string;
  label: string | null;
  category: string;
  isSecret: boolean;
  updatedAt: string | null;
}

interface FeeCap {
  id: number;
  effectiveDate: string;
  capAmount: number;
  notes: string | null;
  createdAt: string | null;
}

interface ConnectionStatus {
  service: string;
  label: string;
  keyConfigured: boolean;
  baseUrl: string;
  status: "connected" | "error" | "not_configured" | "untested";
  message: string;
}

type TabKey = "fees" | "integrations" | "targets" | "notifications";

const TAB_META: Record<
  TabKey,
  { label: string; icon: React.ElementType; desc: string }
> = {
  fees: {
    label: "Fee Configuration",
    icon: DollarSign,
    desc: "Fee cap history and computation defaults",
  },
  integrations: {
    label: "Integrations",
    icon: Link2,
    desc: "External service connections",
  },
  targets: { label: "Agent Targets", icon: Target, desc: "Daily call targets" },
  notifications: {
    label: "Notifications",
    icon: Bell,
    desc: "Notification preferences",
  },
};

const TABS: TabKey[] = ["fees", "integrations", "targets", "notifications"];

const STATUS_STYLE: Record<
  ConnectionStatus["status"],
  { light: string; dark: string; icon: React.ElementType }
> = {
  connected: {
    light: "bg-emerald-50 border-emerald-200 text-emerald-700",
    dark: "bg-emerald-900/20 border-emerald-800 text-emerald-400",
    icon: Wifi,
  },
  error: {
    light: "bg-red-50 border-red-200 text-red-700",
    dark: "bg-red-900/20 border-red-800 text-red-400",
    icon: WifiOff,
  },
  not_configured: {
    light: "bg-neutral-50 border-neutral-200 text-neutral-500",
    dark: "bg-neutral-800/50 border-neutral-700 text-neutral-400",
    icon: WifiOff,
  },
  untested: {
    light: "bg-amber-50 border-amber-200 text-amber-700",
    dark: "bg-amber-900/20 border-amber-800 text-amber-400",
    icon: CircleDot,
  },
};

const ENV_VAR_NAMES: Record<string, string> = {
  chronicle: "CHRONICLE_API_KEY",
  mycase: "MYCASE_API_KEY",
  calltools: "CALLTOOLS_API_KEY",
};

// ============================================================================
// Component
// ============================================================================

export default function SettingsPage() {
  const { resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const dark = mounted ? resolvedTheme === "dark" : false;
  const t = themeClasses(dark);

  const [settings, setSettings] = useState<AppSetting[]>([]);
  const [feeCaps, setFeeCaps] = useState<FeeCap[]>([]);
  const [connections, setConnections] = useState<ConnectionStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("fees");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  // Editable values
  const [edits, setEdits] = useState<Record<string, string>>({});

  // Fee cap form
  const [capDate, setCapDate] = useState("");
  const [capAmount, setCapAmount] = useState("");
  const [capNotes, setCapNotes] = useState("");
  const [addingCap, setAddingCap] = useState(false);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [settingsRes, connRes] = await Promise.all([
        fetch("/api/settings"),
        fetch("/api/settings/connections"),
      ]);
      if (!settingsRes.ok) throw new Error("Failed to load settings");
      const sJson = await settingsRes.json();
      setSettings(sJson.settings || []);
      setFeeCaps(sJson.feeCaps || []);
      if (connRes.ok) {
        const cJson = await connRes.json();
        setConnections(cJson.connections || []);
      }
      // Init edits
      const initial: Record<string, string> = {};
      for (const s of sJson.settings || []) {
        if (!s.isSecret) initial[s.key] = s.rawValue ?? s.value;
      }
      setEdits(initial);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const editValue = (key: string, value: string) => {
    setEdits((prev) => ({ ...prev, [key]: value }));
    setSaveMsg(null);
  };

  // Save settings for current category
  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const catSettings = settings.filter(
        (s) => s.category === activeTab && !s.isSecret,
      );
      const payload: Record<string, string> = {};
      for (const s of catSettings) {
        const newVal = edits[s.key];
        if (newVal !== undefined) payload[s.key] = newVal;
      }
      if (Object.keys(payload).length === 0) {
        setSaveMsg("No changes to save");
        setSaving(false);
        return;
      }
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: payload }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setSaveMsg(`Saved ${Object.keys(payload).length} setting(s)`);
      await fetchSettings();
    } catch (err) {
      setSaveMsg("Error: " + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // Test connections
  const handleTestConnections = async () => {
    setTesting(true);
    try {
      const res = await fetch("/api/settings/connections?test=true");
      if (res.ok) {
        const json = await res.json();
        setConnections(json.connections || []);
      }
    } catch {
      /* silent */
    } finally {
      setTesting(false);
    }
  };

  // Add fee cap
  const handleAddCap = async () => {
    if (!capDate || !capAmount) return;
    setAddingCap(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feeCap: {
            effectiveDate: capDate,
            capAmount: parseFloat(capAmount),
            notes: capNotes || null,
          },
        }),
      });
      if (!res.ok) throw new Error("Failed to add fee cap");
      setCapDate("");
      setCapAmount("");
      setCapNotes("");
      await fetchSettings();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAddingCap(false);
    }
  };

  // Delete fee cap
  const handleDeleteCap = async (id: number) => {
    if (!confirm("Delete this fee cap entry?")) return;
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleteFeeCap: id }),
      });
      await fetchSettings();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const categorySettings = settings.filter(
    (s) => s.category === activeTab && !s.isSecret,
  );
  const sectionCard = `rounded-xl border ${t.card}`;
  const inputClass = `w-full h-9 px-3 rounded-lg border text-sm outline-none transition-colors ${t.inputBg}`;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className={sectionCard}>
        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Settings
              className={`h-5 w-5 ${dark ? "text-indigo-400" : "text-indigo-500"}`}
            />
            <div>
              <h3 className={`text-sm font-bold ${t.text}`}>Settings</h3>
              <p className={`text-[11px] ${t.textMuted} mt-0.5`}>
                Configure fee caps, integrations, targets, and preferences
              </p>
            </div>
          </div>
          {activeTab !== "integrations" && (
            <button
              onClick={handleSave}
              disabled={saving}
              className={`h-8 px-4 rounded-md text-xs font-semibold flex items-center gap-1.5 ${t.ctaBtn} disabled:opacity-40`}
            >
              {saving ? (
                <RefreshCw className="h-3 w-3 animate-spin" />
              ) : (
                <Save className="h-3 w-3" />
              )}
              Save Changes
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className={`px-4 pb-3 flex items-center gap-1 overflow-x-auto`}>
          {TABS.map((tab) => {
            const m = TAB_META[tab];
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
                  setSaveMsg(null);
                }}
                className={`h-8 px-3 rounded-md text-[11px] font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                  active
                    ? dark
                      ? "bg-neutral-800 text-neutral-100"
                      : "bg-neutral-100 text-neutral-900"
                    : dark
                      ? "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50"
                      : "text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50"
                }`}
              >
                <m.icon className="h-3 w-3" />
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          className={`rounded-xl border p-3 flex items-center gap-2 ${dark ? "bg-red-900/20 border-red-800 text-red-400" : "bg-red-50 border-red-200 text-red-700"}`}
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="text-xs">{error}</span>
        </div>
      )}

      {/* Save message */}
      {saveMsg && (
        <div
          className={`rounded-xl border p-3 flex items-center gap-2 ${
            saveMsg.startsWith("Error")
              ? dark
                ? "bg-red-900/20 border-red-800 text-red-400"
                : "bg-red-50 border-red-200 text-red-700"
              : dark
                ? "bg-emerald-900/20 border-emerald-800 text-emerald-400"
                : "bg-emerald-50 border-emerald-200 text-emerald-700"
          }`}
        >
          {saveMsg.startsWith("Error") ? (
            <AlertCircle className="h-4 w-4" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          <span className="text-xs font-medium">{saveMsg}</span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div
          className={`${sectionCard} flex items-center justify-center py-16`}
        >
          <RefreshCw className={`h-5 w-5 animate-spin ${t.textMuted}`} />
          <span className={`ml-2 text-sm ${t.textSub}`}>
            Loading settings...
          </span>
        </div>
      )}

      {!loading && (
        <>
          {/* ── FEES TAB ── */}
          {activeTab === "fees" && (
            <div className="space-y-4">
              {/* Fee defaults */}
              <div className={sectionCard}>
                <div className={`p-4 border-b ${t.borderLight}`}>
                  <h4
                    className={`text-xs font-bold ${t.text} flex items-center gap-2`}
                  >
                    <DollarSign className="h-3.5 w-3.5" /> Fee Defaults
                  </h4>
                </div>
                <div className="p-4 space-y-4">
                  {settings
                    .filter((s) => s.category === "fees")
                    .map((s) => (
                      <div
                        key={s.key}
                        className="flex flex-col sm:flex-row sm:items-center gap-2"
                      >
                        <label
                          className={`text-xs font-medium ${t.text} sm:w-56 shrink-0`}
                        >
                          {s.label || s.key}
                        </label>
                        {s.key === "default_fee_method" ? (
                          <select
                            value={edits[s.key] || "fee_agreement"}
                            onChange={(e) => editValue(s.key, e.target.value)}
                            className={inputClass}
                          >
                            <option value="fee_agreement">Fee Agreement</option>
                            <option value="fee_petition">Fee Petition</option>
                          </select>
                        ) : s.key === "auto_compute_fees" ? (
                          <select
                            value={edits[s.key] || "true"}
                            onChange={(e) => editValue(s.key, e.target.value)}
                            className={inputClass}
                          >
                            <option value="true">Yes</option>
                            <option value="false">No</option>
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={edits[s.key] || ""}
                            onChange={(e) => editValue(s.key, e.target.value)}
                            className={inputClass}
                          />
                        )}
                      </div>
                    ))}
                </div>
              </div>

              {/* Fee Cap History */}
              <div className={sectionCard}>
                <div
                  className={`p-4 border-b ${t.borderLight} flex items-center justify-between`}
                >
                  <h4
                    className={`text-xs font-bold ${t.text} flex items-center gap-2`}
                  >
                    <Calendar className="h-3.5 w-3.5" /> SSA Fee Cap History
                  </h4>
                  <span className={`text-[10px] ${t.textMuted}`}>
                    {feeCaps.length} entries
                  </span>
                </div>

                {/* Add new cap */}
                <div
                  className={`p-4 border-b ${t.borderLight} ${dark ? "bg-neutral-800/30" : "bg-neutral-50/50"}`}
                >
                  <p className={`text-[11px] font-semibold ${t.textSub} mb-2`}>
                    Add Fee Cap
                  </p>
                  <div className="flex flex-col sm:flex-row items-start sm:items-end gap-2">
                    <div className="flex-1 min-w-0">
                      <label
                        className={`text-[10px] ${t.textMuted} block mb-0.5`}
                      >
                        Effective Date
                      </label>
                      <input
                        type="date"
                        value={capDate}
                        onChange={(e) => setCapDate(e.target.value)}
                        className={`${inputClass} sm:w-40`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <label
                        className={`text-[10px] ${t.textMuted} block mb-0.5`}
                      >
                        Cap Amount ($)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={capAmount}
                        onChange={(e) => setCapAmount(e.target.value)}
                        placeholder="9200.00"
                        className={`${inputClass} sm:w-36`}
                      />
                    </div>
                    <div className="flex-2 min-w-0">
                      <label
                        className={`text-[10px] ${t.textMuted} block mb-0.5`}
                      >
                        Notes (optional)
                      </label>
                      <input
                        type="text"
                        value={capNotes}
                        onChange={(e) => setCapNotes(e.target.value)}
                        placeholder="e.g. Updated per SSA notice"
                        className={inputClass}
                      />
                    </div>
                    <button
                      onClick={handleAddCap}
                      disabled={addingCap || !capDate || !capAmount}
                      className={`h-9 px-4 rounded-lg text-xs font-semibold flex items-center gap-1.5 shrink-0 ${t.ctaBtn} disabled:opacity-40`}
                    >
                      {addingCap ? (
                        <RefreshCw className="h-3 w-3 animate-spin" />
                      ) : (
                        <Plus className="h-3 w-3" />
                      )}
                      Add
                    </button>
                  </div>
                </div>

                {/* Cap list */}
                {feeCaps.length === 0 ? (
                  <div className={`p-8 text-center ${t.textMuted} text-xs`}>
                    No fee cap entries yet. The default is $9,200.
                  </div>
                ) : (
                  <div
                    className={`divide-y ${dark ? "divide-neutral-800/50" : "divide-neutral-100"}`}
                  >
                    {feeCaps.map((fc) => (
                      <div
                        key={fc.id}
                        className={`flex items-center justify-between px-4 py-3 ${dark ? "hover:bg-neutral-800/30" : "hover:bg-neutral-50"} transition-colors`}
                      >
                        <div className="flex items-center gap-4">
                          <div
                            className={`w-24 text-xs font-mono tabular-nums ${t.text}`}
                          >
                            {fc.effectiveDate}
                          </div>
                          <div
                            className={`text-sm font-bold tabular-nums ${dark ? "text-emerald-400" : "text-emerald-600"}`}
                          >
                            $
                            {fc.capAmount.toLocaleString("en-US", {
                              minimumFractionDigits: 2,
                            })}
                          </div>
                          {fc.notes && (
                            <span className={`text-[11px] ${t.textMuted}`}>
                              {fc.notes}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => handleDeleteCap(fc.id)}
                          className={`h-7 w-7 rounded-md flex items-center justify-center ${dark ? "hover:bg-red-900/30 text-red-400" : "hover:bg-red-50 text-red-500"} opacity-50 hover:opacity-100 transition-opacity`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── INTEGRATIONS TAB ── */}
          {activeTab === "integrations" && (
            <div className={sectionCard}>
              <div
                className={`p-4 border-b ${t.borderLight} flex items-center justify-between`}
              >
                <div>
                  <h4
                    className={`text-xs font-bold ${t.text} flex items-center gap-2`}
                  >
                    <Shield className="h-3.5 w-3.5" /> Service Connections
                  </h4>
                  <p className={`text-[11px] ${t.textMuted} mt-0.5`}>
                    API keys and URLs are managed via environment variables in
                    Vercel
                  </p>
                </div>
                <button
                  onClick={handleTestConnections}
                  disabled={testing}
                  className={`h-8 px-3 rounded-md text-xs font-medium flex items-center gap-1.5 border ${t.outlineBtn} disabled:opacity-40`}
                >
                  {testing ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Wifi className="h-3 w-3" />
                  )}
                  Test Connections
                </button>
              </div>

              <div
                className={`divide-y ${dark ? "divide-neutral-800/50" : "divide-neutral-100"}`}
              >
                {connections.map((conn) => {
                  const style = STATUS_STYLE[conn.status];
                  const StatusIcon = style.icon;
                  const colorClass = dark ? style.dark : style.light;

                  return (
                    <div key={conn.service} className="p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <h5 className={`text-[13px] font-semibold ${t.text}`}>
                          {conn.label}
                        </h5>
                        <span
                          className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1 ${colorClass}`}
                        >
                          <StatusIcon className="h-2.5 w-2.5" />
                          {conn.status === "connected"
                            ? "Connected"
                            : conn.status === "error"
                              ? "Error"
                              : conn.status === "not_configured"
                                ? "Not Configured"
                                : "Untested"}
                        </span>
                      </div>
                      <p className={`text-[11px] ${t.textSub}`}>
                        {conn.message}
                      </p>

                      <div className={`mt-2 flex flex-wrap items-center gap-3`}>
                        <div className="flex items-center gap-1.5">
                          <Key className={`h-3 w-3 ${t.textMuted}`} />
                          <span className={`text-[10px] ${t.textMuted}`}>
                            <code
                              className={`px-1 py-0.5 rounded ${dark ? "bg-neutral-800" : "bg-neutral-100"}`}
                            >
                              {ENV_VAR_NAMES[conn.service]}
                            </code>
                          </span>
                          {conn.keyConfigured ? (
                            <span
                              className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${dark ? "bg-emerald-900/30 text-emerald-400" : "bg-emerald-50 text-emerald-700"}`}
                            >
                              SET
                            </span>
                          ) : (
                            <span
                              className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${dark ? "bg-neutral-800 text-neutral-500" : "bg-neutral-100 text-neutral-400"}`}
                            >
                              NOT SET
                            </span>
                          )}
                        </div>
                        {conn.baseUrl && (
                          <div className="flex items-center gap-1.5">
                            <Link2 className={`h-3 w-3 ${t.textMuted}`} />
                            <span className={`text-[10px] ${t.textMuted}`}>
                              {conn.baseUrl}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Help note */}
              <div className={`p-4 border-t ${t.borderLight}`}>
                <p className={`text-[11px] ${t.textMuted}`}>
                  To update API keys or URLs, go to{" "}
                  <span className={`font-semibold ${t.text}`}>
                    Vercel Dashboard → Project Settings → Environment Variables
                  </span>{" "}
                  and set the values listed above. Changes take effect on next
                  deployment.
                </p>
              </div>
            </div>
          )}

          {/* ── TARGETS TAB ── */}
          {activeTab === "targets" && (
            <div className={sectionCard}>
              <div className={`p-4 border-b ${t.borderLight}`}>
                <h4
                  className={`text-xs font-bold ${t.text} flex items-center gap-2`}
                >
                  <Target className="h-3.5 w-3.5" /> Daily Call Targets
                </h4>
                <p className={`text-[11px] ${t.textMuted} mt-0.5`}>
                  Agents below these thresholds trigger &qout;Missed Calls&qout;
                  notifications.
                </p>
              </div>
              <div className="p-4 space-y-4">
                {categorySettings.map((s) => (
                  <div
                    key={s.key}
                    className="flex flex-col sm:flex-row sm:items-center gap-2"
                  >
                    <label
                      className={`text-xs font-medium ${t.text} sm:w-64 shrink-0`}
                    >
                      {s.label || s.key}
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={edits[s.key] || ""}
                      onChange={(e) => editValue(s.key, e.target.value)}
                      className={`${inputClass} sm:w-32`}
                    />
                    <span className={`text-[11px] ${t.textMuted}`}>
                      calls/day
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── NOTIFICATIONS TAB ── */}
          {activeTab === "notifications" && (
            <div className={sectionCard}>
              <div className={`p-4 border-b ${t.borderLight}`}>
                <h4
                  className={`text-xs font-bold ${t.text} flex items-center gap-2`}
                >
                  <Bell className="h-3.5 w-3.5" /> Notification Settings
                </h4>
              </div>
              <div className="p-4 space-y-4">
                {categorySettings.map((s) => (
                  <div
                    key={s.key}
                    className="flex flex-col sm:flex-row sm:items-center gap-2"
                  >
                    <label
                      className={`text-xs font-medium ${t.text} sm:w-64 shrink-0`}
                    >
                      {s.label || s.key}
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={edits[s.key] || ""}
                      onChange={(e) => editValue(s.key, e.target.value)}
                      className={`${inputClass} sm:w-32`}
                    />
                    <span className={`text-[11px] ${t.textMuted}`}>
                      seconds
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
