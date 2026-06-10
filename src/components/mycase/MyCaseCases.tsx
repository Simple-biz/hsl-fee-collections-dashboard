"use client";

import { useTheme } from "next-themes";
import { Scale, ExternalLink, AlertCircle } from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import { fmtDate, fmtFull } from "@/lib/formatters";

export type MyCaseRow = {
  id: number;
  name: string;
  caseNumber: string | null;
  status: string | null;
  openedDate: string | null;
  closedDate: string | null;
  outstandingBalance: number | null;
  updatedAt: string | null;
};

interface MyCaseCasesProps {
  cases: MyCaseRow[];
  error: string | null;
}

// The firm's MyCase subdomain (matches the deep-link in CaseDetailSheet).
const MYCASE_BASE = "https://rgdr.mycase.com/court_cases";

export function MyCaseCases({ cases, error }: MyCaseCasesProps) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const t = themeClasses(dark);

  const sectionCard = `rounded-xl border ${t.card}`;
  const thBase = `py-2 px-3 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap ${t.textSub}`;
  const tdBase = `py-2 px-3 text-[12px] whitespace-nowrap`;
  const rowBorder = dark ? "border-neutral-800/50" : "border-neutral-100";
  const rowHover = dark ? "hover:bg-neutral-800/40" : "hover:bg-neutral-50/80";

  return (
    <div className="space-y-4">
      {error ? (
        <div
          role="alert"
          className={`rounded-xl border p-4 flex items-center gap-3 ${dark ? "bg-red-900/20 border-red-800 text-red-400" : "bg-red-50 border-red-200 text-red-700"}`}
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      ) : (
        <div className={sectionCard}>
          {/* Toolbar */}
          <div className={`p-4 border-b ${t.borderLight}`}>
            <h3 className={`text-sm font-bold ${t.text}`}>Cases</h3>
            <p className={`text-[11px] ${t.textMuted} mt-0.5`}>
              {cases.length === 1 ? "1 case" : `${cases.length} cases`}
            </p>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-200">
              <thead>
                <tr className={`border-b ${t.borderLight}`}>
                  <th className={`${thBase} text-left`}>Case</th>
                  <th className={`${thBase} text-left`}>Case #</th>
                  <th className={`${thBase} text-left`}>Status</th>
                  <th className={`${thBase} text-left`}>Opened</th>
                  <th className={`${thBase} text-left`}>Closed</th>
                  <th className={`${thBase} text-right`}>Outstanding</th>
                  <th className={`${thBase} text-left`}>Updated</th>
                  <th className={`${thBase} text-right`}>MyCase</th>
                </tr>
              </thead>
              <tbody>
                {cases.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className={`${tdBase} text-center py-12 ${t.textMuted}`}
                    >
                      <div className="flex flex-col items-center gap-2">
                        <Scale aria-hidden="true" className="h-8 w-8 opacity-30" />
                        <p className="text-sm font-medium">
                          No matching cases found in MyCase.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  cases.map((c) => (
                    <tr
                      key={c.id}
                      className={`border-b ${rowBorder} ${rowHover} transition-colors`}
                    >
                      <td className={`${tdBase} ${t.text} font-semibold`}>
                        {c.name}
                      </td>
                      <td className={`${tdBase} ${t.textMuted}`}>
                        {c.caseNumber || "—"}
                      </td>
                      <td className={`${tdBase} ${t.textSub}`}>
                        {c.status || "—"}
                      </td>
                      <td className={`${tdBase} ${t.textMuted}`}>
                        {fmtDate(c.openedDate)}
                      </td>
                      <td className={`${tdBase} ${t.textMuted}`}>
                        {fmtDate(c.closedDate)}
                      </td>
                      <td className={`${tdBase} text-right font-semibold ${t.text}`}>
                        {c.outstandingBalance != null
                          ? fmtFull(c.outstandingBalance)
                          : "—"}
                      </td>
                      <td className={`${tdBase} ${t.textMuted}`}>
                        {fmtDate(c.updatedAt)}
                      </td>
                      <td className={`${tdBase} text-right`}>
                        <a
                          href={`${MYCASE_BASE}/${c.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`inline-flex items-center gap-1 ${dark ? "text-indigo-400" : "text-indigo-600"} hover:underline`}
                        >
                          Open
                          <ExternalLink aria-hidden="true" className="h-3 w-3" />
                        </a>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
