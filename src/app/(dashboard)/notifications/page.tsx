"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useTheme } from "next-themes";
import Link from "next/link";
import {
  Bell,
  BellOff,
  Clock,
  AlertTriangle,
  DollarSign,
  Phone,
  UserPlus,
  CheckCheck,
  RefreshCw,
  ChevronRight,
  Eye,
} from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";

// ============================================================================
// Types
// ============================================================================

interface Notification {
  id: string;
  type: "case_aging" | "fee_payment" | "call_target_missed" | "case_assigned";
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  caseId: number | null;
  agentName: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

type FilterType = "all" | Notification["type"];

const TYPE_META: Record<
  Notification["type"],
  { label: string; icon: React.ElementType; color: string; darkColor: string }
> = {
  case_aging: {
    label: "Case Aging",
    icon: Clock,
    color: "text-red-600 bg-red-50 border-red-200",
    darkColor: "text-red-400 bg-red-900/20 border-red-800/50",
  },
  fee_payment: {
    label: "Fee Payment",
    icon: DollarSign,
    color: "text-emerald-600 bg-emerald-50 border-emerald-200",
    darkColor: "text-emerald-400 bg-emerald-900/20 border-emerald-800/50",
  },
  call_target_missed: {
    label: "Missed Calls",
    icon: Phone,
    color: "text-amber-600 bg-amber-50 border-amber-200",
    darkColor: "text-amber-400 bg-amber-900/20 border-amber-800/50",
  },
  case_assigned: {
    label: "New Assignment",
    icon: UserPlus,
    color: "text-blue-600 bg-blue-50 border-blue-200",
    darkColor: "text-blue-400 bg-blue-900/20 border-blue-800/50",
  },
};

const SEVERITY_DOT: Record<
  Notification["severity"],
  { light: string; dark: string }
> = {
  info: { light: "bg-blue-400", dark: "bg-blue-500" },
  warning: { light: "bg-amber-400", dark: "bg-amber-500" },
  critical: { light: "bg-red-500", dark: "bg-red-500" },
};

const FILTER_TABS: { key: FilterType; label: string }[] = [
  { key: "all", label: "All" },
  { key: "case_aging", label: "Case Aging" },
  { key: "fee_payment", label: "Payments" },
  { key: "call_target_missed", label: "Missed Calls" },
  { key: "case_assigned", label: "Assignments" },
];

// ============================================================================
// Helpers
// ============================================================================

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// ============================================================================
// Component
// ============================================================================

export default function NotificationsPage() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted ? resolvedTheme === "dark" : false;
  const t = themeClasses(dark);

  const [stored, setStored] = useState<Notification[]>([]);
  const [live, setLive] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");
  const [markingAll, setMarkingAll] = useState(false);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/notifications?limit=100&computeLive=true");
      if (!res.ok) throw new Error("Failed to fetch notifications");
      const json = await res.json();
      setStored(json.notifications || []);
      setLive(json.liveAlerts || []);
      setUnreadCount(json.unreadCount || 0);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Combine stored + live, dedupe by id, sort desc
  const all = useMemo(() => {
    const map = new Map<string, Notification>();
    for (const n of stored) map.set(n.id, n);
    for (const n of live) if (!map.has(n.id)) map.set(n.id, n);
    return Array.from(map.values()).sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [stored, live]);

  const filtered =
    filter === "all" ? all : all.filter((n) => n.type === filter);
  const unread = all.filter((n) => !n.isRead);

  const countByType: Record<string, number> = {};
  for (const n of all) countByType[n.type] = (countByType[n.type] || 0) + 1;

  // Mark single as read
  const markRead = async (id: string) => {
    setStored((prev) =>
      prev.map((n) =>
        n.id === id
          ? { ...n, isRead: true, readAt: new Date().toISOString() }
          : n,
      ),
    );
    setLive((prev) =>
      prev.map((n) =>
        n.id === id
          ? { ...n, isRead: true, readAt: new Date().toISOString() }
          : n,
      ),
    );
    setUnreadCount((c) => Math.max(0, c - 1));
    if (id.startsWith("live-")) return;
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
    } catch {
      /* silent */
    }
  };

  // Mark all as read
  const markAllRead = async () => {
    setMarkingAll(true);
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
      });
      setStored((prev) =>
        prev.map((n) => ({
          ...n,
          isRead: true,
          readAt: new Date().toISOString(),
        })),
      );
      setLive((prev) =>
        prev.map((n) => ({
          ...n,
          isRead: true,
          readAt: new Date().toISOString(),
        })),
      );
      setUnreadCount(0);
    } catch {
      /* silent */
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className={`rounded-xl border ${t.card}`}>
        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Bell
                className={`h-5 w-5 ${dark ? "text-indigo-400" : "text-indigo-500"}`}
              />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </div>
            <div>
              <h3 className={`text-sm font-bold ${t.text}`}>Notifications</h3>
              <p className={`text-[11px] ${t.textMuted} mt-0.5`}>
                {all.length} total · {unread.length} unread
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={markAllRead}
              disabled={markingAll || unread.length === 0}
              className={`h-8 px-3 rounded-md text-xs font-medium flex items-center gap-1.5 border ${t.outlineBtn} disabled:opacity-40`}
            >
              {markingAll ? (
                <RefreshCw className="h-3 w-3 animate-spin" />
              ) : (
                <CheckCheck className="h-3 w-3" />
              )}
              Mark all read
            </button>
            <button
              onClick={fetchNotifications}
              disabled={loading}
              className={`h-8 w-8 rounded-md flex items-center justify-center border ${t.outlineBtn}`}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              />
            </button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className={`px-4 pb-3 flex items-center gap-1 overflow-x-auto`}>
          {FILTER_TABS.map(({ key, label }) => {
            const active = filter === key;
            const count = key === "all" ? all.length : countByType[key] || 0;
            return (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`h-7 px-3 rounded-md text-[11px] font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                  active
                    ? dark
                      ? "bg-neutral-800 text-neutral-100"
                      : "bg-neutral-100 text-neutral-900"
                    : dark
                      ? "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50"
                      : "text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50"
                }`}
              >
                {label}
                {count > 0 && (
                  <span
                    className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
                      active
                        ? dark
                          ? "bg-neutral-700 text-neutral-300"
                          : "bg-neutral-200 text-neutral-700"
                        : dark
                          ? "bg-neutral-800 text-neutral-500"
                          : "bg-neutral-100 text-neutral-400"
                    }`}
                  >
                    {count}
                  </span>
                )}
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
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="text-xs">{error}</span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div
          className={`rounded-xl border ${t.card} flex items-center justify-center py-16`}
        >
          <RefreshCw className={`h-5 w-5 animate-spin ${t.textMuted}`} />
          <span className={`ml-2 text-sm ${t.textSub}`}>
            Loading notifications...
          </span>
        </div>
      )}

      {/* Empty */}
      {!loading && filtered.length === 0 && (
        <div
          className={`rounded-xl border ${t.card} flex flex-col items-center justify-center py-16`}
        >
          <BellOff className={`h-8 w-8 ${t.textMuted} mb-3`} />
          <p className={`text-sm font-medium ${t.text}`}>
            {filter === "all"
              ? "No notifications yet"
              : `No ${FILTER_TABS.find((f) => f.key === filter)?.label.toLowerCase()} notifications`}
          </p>
          <p className={`text-xs ${t.textMuted} mt-1`}>
            Notifications will appear here as events occur.
          </p>
        </div>
      )}

      {/* Notification list */}
      {!loading && filtered.length > 0 && (
        <div
          className={`rounded-xl border ${t.card} divide-y ${dark ? "divide-neutral-800/50" : "divide-neutral-100"}`}
        >
          {filtered.map((n) => {
            const meta = TYPE_META[n.type];
            const Icon = meta.icon;
            const isLive = n.id.startsWith("live-");
            const colorClass = dark ? meta.darkColor : meta.color;
            const dotColor = dark
              ? SEVERITY_DOT[n.severity].dark
              : SEVERITY_DOT[n.severity].light;

            return (
              <div
                key={n.id}
                className={`group flex items-start gap-3 p-4 transition-colors ${
                  !n.isRead
                    ? dark
                      ? "bg-neutral-900"
                      : "bg-white"
                    : dark
                      ? "bg-neutral-900/50 opacity-60"
                      : "bg-neutral-50/50 opacity-60"
                } ${dark ? "hover:bg-neutral-800/50" : "hover:bg-neutral-50"}`}
              >
                {/* Icon */}
                <div
                  className={`shrink-0 w-9 h-9 rounded-lg border flex items-center justify-center ${colorClass}`}
                >
                  <Icon className="h-4 w-4" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {!n.isRead && (
                        <span
                          className={`shrink-0 w-2 h-2 rounded-full ${dotColor}`}
                        />
                      )}
                      <h4
                        className={`text-[13px] font-semibold truncate ${t.text}`}
                      >
                        {n.title}
                      </h4>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isLive && (
                        <span
                          className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
                            dark
                              ? "bg-indigo-900/40 text-indigo-300 border border-indigo-700/50"
                              : "bg-indigo-50 text-indigo-600 border border-indigo-200"
                          }`}
                        >
                          LIVE
                        </span>
                      )}
                      <span
                        className={`text-[10px] ${t.textMuted} whitespace-nowrap`}
                      >
                        {timeAgo(n.createdAt)}
                      </span>
                    </div>
                  </div>
                  <p
                    className={`text-[12px] ${t.textSub} mt-0.5 leading-relaxed`}
                  >
                    {n.message}
                  </p>
                  <div className="flex items-center gap-3 mt-2">
                    <span
                      className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${colorClass}`}
                    >
                      {meta.label}
                    </span>
                    {n.agentName && (
                      <span
                        className={`text-[10px] font-medium ${t.textMuted}`}
                      >
                        {n.agentName}
                      </span>
                    )}
                    {n.caseId && (
                      <Link
                        href={`/cases/${n.caseId}`}
                        className={`text-[10px] font-medium flex items-center gap-0.5 ${dark ? "text-indigo-400 hover:text-indigo-300" : "text-indigo-600 hover:text-indigo-700"}`}
                      >
                        View case <ChevronRight className="h-3 w-3" />
                      </Link>
                    )}
                    {!n.isRead && !isLive && (
                      <button
                        onClick={() => markRead(n.id)}
                        className={`text-[10px] font-medium flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ${
                          dark
                            ? "text-neutral-400 hover:text-neutral-200"
                            : "text-neutral-500 hover:text-neutral-700"
                        }`}
                      >
                        <Eye className="h-3 w-3" /> Mark read
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
