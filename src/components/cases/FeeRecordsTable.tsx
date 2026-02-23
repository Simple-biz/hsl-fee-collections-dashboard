"use client";

import { useState, useMemo } from "react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
// import { Search, ChevronDown, MoreHorizontal, ArrowUpDown } from "lucide-react";
import { Search, ArrowUpDown } from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import {
  fmtFull,
  fmtDate,
  fmtClaim,
  STATUS_LABELS,
  getStatusColor,
} from "@/lib/formatters";
import type { CaseRow } from "@/types";

interface FeeRecordsTableProps {
  cases: CaseRow[];
}

const currency = (v: number) => (v > 0 ? fmtFull(v) : "—");
const dateStr = (d: string | null) => (d ? fmtDate(d) : "—");

const PIF_COLORS = (pif: string | null, dark: boolean) => {
  if (pif === "YES")
    return dark
      ? "bg-emerald-900/40 text-emerald-400"
      : "bg-emerald-50 text-emerald-700";
  if (pif === "PENDING")
    return dark
      ? "bg-amber-900/40 text-amber-400"
      : "bg-amber-50 text-amber-700";
  if (pif === "NO")
    return dark ? "bg-red-900/40 text-red-400" : "bg-red-50 text-red-700";
  return dark
    ? "bg-neutral-800 text-neutral-500"
    : "bg-neutral-100 text-neutral-400";
};

const AGING_COLORS = (cat: string | null, dark: boolean) => {
  if (cat === ">60") return dark ? "text-red-400" : "text-red-600";
  if (cat === "≤60") return dark ? "text-emerald-400" : "text-emerald-600";
  return dark ? "text-neutral-500" : "text-neutral-400";
};

type SortKey = "name" | "date" | "expected" | "paid" | "daysAfterApproval";
type SortDir = "asc" | "desc";

export const FeeRecordsTable = ({ cases }: FeeRecordsTableProps) => {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const t = themeClasses(dark);
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [assignedFilter, setAssignedFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Unique assignees for filter dropdown
  const assignees = useMemo(() => {
    const set = new Set(cases.map((c) => c.assigned).filter((a) => a !== "—"));
    return Array.from(set).sort();
  }, [cases]);

  const filtered = useMemo(() => {
    let d = [...cases];
    if (search) {
      const q = search.toLowerCase();
      d = d.filter(
        (c) => c.name.toLowerCase().includes(q) || String(c.id).includes(q),
      );
    }
    if (statusFilter !== "all") {
      if (statusFilter === "finished") {
        d = d.filter((c) =>
          ["pending_payment", "partially_paid", "paid_in_full"].includes(
            c.status,
          ),
        );
      } else if (statusFilter === "started") {
        d = d.filter((c) => ["started", "in_progress"].includes(c.status));
      } else {
        d = d.filter((c) => c.status === statusFilter);
      }
    }
    if (assignedFilter !== "all")
      d = d.filter((c) => c.assigned === assignedFilter);

    d.sort((a, b) => {
      let av: string | number, bv: string | number;
      switch (sortKey) {
        case "name":
          av = a.name;
          bv = b.name;
          break;
        case "date":
          av = a.date || "";
          bv = b.date || "";
          break;
        case "expected":
          av = a.expected;
          bv = b.expected;
          break;
        case "paid":
          av = a.paid;
          bv = b.paid;
          break;
        case "daysAfterApproval":
          av = a.daysAfterApproval ?? 0;
          bv = b.daysAfterApproval ?? 0;
          break;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return d;
  }, [cases, search, statusFilter, assignedFilter, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const rowBorder = dark ? "border-neutral-800/50" : "border-neutral-100";
  const rowHover = dark ? "hover:bg-neutral-800/40" : "hover:bg-neutral-50/80";
  const thBase = `py-2 px-3 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap`;
  const tdBase = `py-2 px-3 text-[12px] whitespace-nowrap`;
  const groupBorder = dark
    ? "border-l border-neutral-700/50"
    : "border-l border-neutral-200";
  // const groupHeaderBg = (color: string) =>
  //   dark ? `bg-${color}-900/20` : `bg-${color}-50/60`;

  return (
    <div className={`rounded-xl border ${t.card}`}>
      {/* Header */}
      <div
        className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b ${t.borderLight}`}
      >
        <div>
          <h3 className={`text-sm font-bold ${t.text}`}>Master Fee Records</h3>
          <p className={`text-[11px] ${t.textMuted} mt-0.5`}>
            {filtered.length} of {cases.length} cases
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 sm:flex-none">
            <Search
              className={`absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 ${t.textMuted}`}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search cases..."
              className={`h-8 pl-8 pr-3 w-full sm:w-48 rounded-md border text-xs outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-600 ${t.inputBg}`}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={`h-8 px-2 rounded-md border text-xs outline-none cursor-pointer ${t.inputBg}`}
          >
            <option value="all">All Status</option>
            <option value="not_started">Not Started</option>
            <option value="started">Started</option>
            <option value="finished">Finished</option>
            <option value="closed">Closed</option>
          </select>
          <select
            value={assignedFilter}
            onChange={(e) => setAssignedFilter(e.target.value)}
            className={`h-8 px-2 rounded-md border text-xs outline-none cursor-pointer ${t.inputBg}`}
          >
            <option value="all">All Agents</option>
            {assignees.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-400">
          {/* Group headers */}
          <thead>
            <tr className={`border-b ${t.borderLight}`}>
              <th colSpan={6} className={`${thBase} ${t.textSub} text-left`}>
                Case Info
              </th>
              <th
                colSpan={5}
                className={`${thBase} text-center ${groupBorder} ${dark ? "text-indigo-400" : "text-indigo-600"}`}
              >
                T16
              </th>
              <th
                colSpan={5}
                className={`${thBase} text-center ${groupBorder} ${dark ? "text-blue-400" : "text-blue-600"}`}
              >
                T2
              </th>
              <th
                colSpan={5}
                className={`${thBase} text-center ${groupBorder} ${dark ? "text-violet-400" : "text-violet-600"}`}
              >
                AUX
              </th>
              <th
                colSpan={3}
                className={`${thBase} text-center ${groupBorder} ${t.textSub}`}
              >
                Totals
              </th>
              <th
                colSpan={4}
                className={`${thBase} text-center ${groupBorder} ${t.textSub}`}
              >
                Workflow
              </th>
            </tr>
            {/* Column headers */}
            <tr className={`border-b ${t.borderLight}`}>
              {/* Case Info */}
              <th
                className={`${thBase} ${t.textSub} text-left cursor-pointer`}
                onClick={() => toggleSort("name")}
              >
                <span className="flex items-center gap-1">
                  Case Name <ArrowUpDown className="h-3 w-3" />
                </span>
              </th>
              <th className={`${thBase} ${t.textSub} text-left`}>Assigned</th>
              <th className={`${thBase} ${t.textSub} text-left`}>Level</th>
              <th className={`${thBase} ${t.textSub} text-left`}>Claim</th>
              <th
                className={`${thBase} ${t.textSub} text-left cursor-pointer`}
                onClick={() => toggleSort("date")}
              >
                <span className="flex items-center gap-1">
                  Approval <ArrowUpDown className="h-3 w-3" />
                </span>
              </th>
              <th className={`${thBase} ${t.textSub} text-left`}>Status</th>

              {/* T16 */}
              <th
                className={`${thBase} ${t.textSub} text-right ${groupBorder}`}
              >
                Retro
              </th>
              <th className={`${thBase} ${t.textSub} text-right`}>Fee Due</th>
              <th className={`${thBase} ${t.textSub} text-right`}>
                Rec&apos;d
              </th>
              <th className={`${thBase} ${t.textSub} text-right`}>Pending</th>
              <th className={`${thBase} ${t.textSub} text-left`}>
                Date Rec&apos;d
              </th>

              {/* T2 */}
              <th
                className={`${thBase} ${t.textSub} text-right ${groupBorder}`}
              >
                Retro
              </th>
              <th className={`${thBase} ${t.textSub} text-right`}>Fee Due</th>
              <th className={`${thBase} ${t.textSub} text-right`}>
                Rec&apos;d
              </th>
              <th className={`${thBase} ${t.textSub} text-right`}>Pending</th>
              <th className={`${thBase} ${t.textSub} text-left`}>
                Date Rec&apos;d
              </th>

              {/* AUX */}
              <th
                className={`${thBase} ${t.textSub} text-right ${groupBorder}`}
              >
                Retro
              </th>
              <th className={`${thBase} ${t.textSub} text-right`}>Fee Due</th>
              <th className={`${thBase} ${t.textSub} text-right`}>
                Rec&apos;d
              </th>
              <th className={`${thBase} ${t.textSub} text-right`}>Pending</th>
              <th className={`${thBase} ${t.textSub} text-left`}>
                Date Rec&apos;d
              </th>

              {/* Totals */}
              <th
                className={`${thBase} ${t.textSub} text-right ${groupBorder}`}
              >
                Retro Due
              </th>
              <th
                className={`${thBase} ${t.textSub} text-right cursor-pointer`}
                onClick={() => toggleSort("expected")}
              >
                <span className="flex items-center justify-end gap-1">
                  Expected <ArrowUpDown className="h-3 w-3" />
                </span>
              </th>
              <th
                className={`${thBase} ${t.textSub} text-right cursor-pointer`}
                onClick={() => toggleSort("paid")}
              >
                <span className="flex items-center justify-end gap-1">
                  Paid <ArrowUpDown className="h-3 w-3" />
                </span>
              </th>

              {/* Workflow */}
              <th
                className={`${thBase} ${t.textSub} text-center ${groupBorder}`}
              >
                PIF
              </th>
              <th className={`${thBase} ${t.textSub} text-left`}>
                Approved By
              </th>
              <th className={`${thBase} ${t.textSub} text-left`}>
                Recent Update
              </th>
              <th
                className={`${thBase} ${t.textSub} text-right cursor-pointer`}
                onClick={() => toggleSort("daysAfterApproval")}
              >
                <span className="flex items-center justify-end gap-1">
                  Days <ArrowUpDown className="h-3 w-3" />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr
                key={c.id}
                onClick={() => router.push(`/cases/${c.id}`)}
                className={`border-b ${rowBorder} ${rowHover} transition-colors cursor-pointer group`}
              >
                {/* Case Info */}
                <td
                  className={`${tdBase} ${t.text} font-semibold max-w-45 truncate`}
                  title={c.name}
                >
                  {c.name}
                </td>
                <td className={`${tdBase} ${t.textSub}`}>{c.assigned}</td>
                <td className={`${tdBase}`}>
                  <span
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${t.pillBg}`}
                  >
                    {c.level}
                  </span>
                </td>
                <td className={`${tdBase}`}>
                  <span
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${t.pillBg}`}
                  >
                    {fmtClaim(c.claim)}
                  </span>
                </td>
                <td className={`${tdBase} ${t.textSub} tabular-nums`}>
                  {dateStr(c.date)}
                </td>
                <td className={`${tdBase}`}>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${getStatusColor(c.status, dark)}`}
                  >
                    {STATUS_LABELS[c.status]}
                  </span>
                </td>

                {/* T16 */}
                <td
                  className={`${tdBase} text-right tabular-nums ${t.text} ${groupBorder}`}
                >
                  {currency(c.t16Retro)}
                </td>
                <td className={`${tdBase} text-right tabular-nums ${t.text}`}>
                  {currency(c.t16FeeDue)}
                </td>
                <td
                  className={`${tdBase} text-right tabular-nums ${c.t16FeeReceived > 0 ? "text-emerald-500 font-medium" : t.textMuted}`}
                >
                  {currency(c.t16FeeReceived)}
                </td>
                <td
                  className={`${tdBase} text-right tabular-nums ${c.t16Pending > 0 ? (dark ? "text-amber-400" : "text-amber-600") : t.textMuted}`}
                >
                  {currency(c.t16Pending)}
                </td>
                <td className={`${tdBase} ${t.textSub} tabular-nums`}>
                  {dateStr(c.t16FeeReceivedDate)}
                </td>

                {/* T2 */}
                <td
                  className={`${tdBase} text-right tabular-nums ${t.text} ${groupBorder}`}
                >
                  {currency(c.t2Retro)}
                </td>
                <td className={`${tdBase} text-right tabular-nums ${t.text}`}>
                  {currency(c.t2FeeDue)}
                </td>
                <td
                  className={`${tdBase} text-right tabular-nums ${c.t2FeeReceived > 0 ? "text-emerald-500 font-medium" : t.textMuted}`}
                >
                  {currency(c.t2FeeReceived)}
                </td>
                <td
                  className={`${tdBase} text-right tabular-nums ${c.t2Pending > 0 ? (dark ? "text-amber-400" : "text-amber-600") : t.textMuted}`}
                >
                  {currency(c.t2Pending)}
                </td>
                <td className={`${tdBase} ${t.textSub} tabular-nums`}>
                  {dateStr(c.t2FeeReceivedDate)}
                </td>

                {/* AUX */}
                <td
                  className={`${tdBase} text-right tabular-nums ${t.text} ${groupBorder}`}
                >
                  {currency(c.auxRetro)}
                </td>
                <td className={`${tdBase} text-right tabular-nums ${t.text}`}>
                  {currency(c.auxFeeDue)}
                </td>
                <td
                  className={`${tdBase} text-right tabular-nums ${c.auxFeeReceived > 0 ? "text-emerald-500 font-medium" : t.textMuted}`}
                >
                  {currency(c.auxFeeReceived)}
                </td>
                <td
                  className={`${tdBase} text-right tabular-nums ${c.auxPending > 0 ? (dark ? "text-amber-400" : "text-amber-600") : t.textMuted}`}
                >
                  {currency(c.auxPending)}
                </td>
                <td className={`${tdBase} ${t.textSub} tabular-nums`}>
                  {dateStr(c.auxFeeReceivedDate)}
                </td>

                {/* Totals */}
                <td
                  className={`${tdBase} text-right tabular-nums font-medium ${t.text} ${groupBorder}`}
                >
                  {currency(c.totalRetroDue)}
                </td>
                <td
                  className={`${tdBase} text-right tabular-nums font-semibold ${t.text}`}
                >
                  {currency(c.expected)}
                </td>
                <td
                  className={`${tdBase} text-right tabular-nums font-semibold ${c.paid > 0 ? "text-emerald-500" : t.textMuted}`}
                >
                  {currency(c.paid)}
                </td>

                {/* Workflow */}
                <td className={`${tdBase} text-center ${groupBorder}`}>
                  {c.pif && (
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${PIF_COLORS(c.pif, dark)}`}
                    >
                      {c.pif}
                    </span>
                  )}
                </td>
                <td className={`${tdBase} ${t.textSub}`}>
                  {c.approvedBy || "—"}
                </td>
                <td
                  className={`${tdBase} ${t.textSub} max-w-65 truncate`}
                  title={c.update}
                >
                  {c.update}
                </td>
                <td
                  className={`${tdBase} text-right tabular-nums font-medium ${AGING_COLORS(c.approvalCategory, dark)}`}
                >
                  {c.daysAfterApproval !== null ? (
                    <span>
                      {c.daysAfterApproval}d{" "}
                      <span className="text-[9px] opacity-70">
                        {c.approvalCategory}
                      </span>
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <div className={`py-12 text-center text-sm ${t.textMuted}`}>
          No cases match your filters.
        </div>
      )}
    </div>
  );
};
