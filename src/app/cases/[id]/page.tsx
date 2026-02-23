"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  Clock,
  User,
  MapPin,
  FileText,
  DollarSign,
  CheckCircle2,
  XCircle,
  CalendarDays,
  MessageSquare,
} from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import {
  fmtFull,
  fmtDate,
  fmtClaim,
  STATUS_LABELS_DETAIL,
  getStatusColor,
} from "@/lib/formatters";
import type { WinSheetStatus } from "@/types";

interface Activity {
  id: string;
  message: string;
  createdBy: string;
  createdAt: string;
}

interface CaseDetail {
  id: number;
  externalId: string | null;
  name: string;
  firstName: string;
  lastName: string;
  claim: string;
  level: string;
  t2Decision: string | null;
  t16Decision: string | null;
  approvalDate: string | null;
  office: string;
  assigned: string;
  status: string;
  t16Retro: number;
  t16FeeDue: number;
  t16FeeReceived: number;
  t16Pending: number;
  t16FeeReceivedDate: string | null;
  t2Retro: number;
  t2FeeDue: number;
  t2FeeReceived: number;
  t2Pending: number;
  t2FeeReceivedDate: string | null;
  auxRetro: number;
  auxFeeDue: number;
  auxFeeReceived: number;
  auxPending: number;
  auxFeeReceivedDate: string | null;
  totalRetroDue: number;
  expected: number;
  paid: number;
  outstanding: number;
  pif: string | null;
  approvedBy: string | null;
  feeMethod: string;
  applicableFeeCap: number;
  feeCapApplied: boolean;
  feeComputed: boolean;
  feeComputedAt: string | null;
  syncStatus: string;
  syncedAt: string | null;
  daysAfterApproval: number | null;
  approvalCategory: string | null;
  activities: Activity[];
}

const currency = (v: number) => (v > 0 ? fmtFull(v) : "—");

const PIF_BADGE = (pif: string | null, dark: boolean) => {
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
  return "";
};

const CaseDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const t = themeClasses(dark);

  const [caseData, setCaseData] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCase = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/cases/${id}`);
        if (!res.ok)
          throw new Error(
            res.status === 404 ? "Case not found" : "Failed to load case",
          );
        const json = await res.json();
        setCaseData({ ...json.data, activities: json.data.activities || [] });
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };
    fetchCase();
  }, [id]);

  const sectionCard = `rounded-xl border ${t.card} p-4 md:p-5`;
  const label = `text-[10px] font-semibold uppercase tracking-wider ${t.textMuted}`;
  const value = `text-[13px] font-semibold ${t.text} mt-0.5`;

  // Fee section card
  const FeeSection = ({
    title,
    color,
    retro,
    due,
    received,
    pending,
    dateReceived,
  }: {
    title: string;
    color: string;
    retro: number;
    due: number;
    received: number;
    pending: number;
    dateReceived: string | null;
  }) => (
    <div className={sectionCard}>
      <h4 className={`text-xs font-bold mb-3 ${color}`}>{title}</h4>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div>
          <p className={label}>Retro Amount</p>
          <p className={value}>{currency(retro)}</p>
        </div>
        <div>
          <p className={label}>Fee Due</p>
          <p className={value}>{currency(due)}</p>
        </div>
        <div>
          <p className={label}>Fee Received</p>
          <p
            className={`text-[13px] font-semibold mt-0.5 ${received > 0 ? "text-emerald-500" : t.textMuted}`}
          >
            {currency(received)}
          </p>
        </div>
        <div>
          <p className={label}>Pending</p>
          <p
            className={`text-[13px] font-semibold mt-0.5 ${pending > 0 ? (dark ? "text-amber-400" : "text-amber-600") : t.textMuted}`}
          >
            {currency(pending)}
          </p>
        </div>
        <div>
          <p className={label}>Date Received</p>
          <p className={value}>{dateReceived ? fmtDate(dateReceived) : "—"}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className={`min-h-screen ${dark ? "bg-neutral-950" : "bg-neutral-50"}`}
    >
      {/* Top bar */}
      <div className={`sticky top-0 z-10 border-b ${t.bg} ${t.border}`}>
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-14 flex items-center gap-3">
          <button
            onClick={() => router.push("/")}
            className={`h-8 w-8 rounded-md flex items-center justify-center ${t.hover} ${t.textSub}`}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          {caseData && (
            <>
              <h1 className={`text-sm font-bold ${t.text} truncate`}>
                {caseData.name}
              </h1>
              <span
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${t.pillBg}`}
              >
                {fmtClaim(caseData.claim)}
              </span>
              <span
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${t.pillBg}`}
              >
                {caseData.level}
              </span>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${getStatusColor(caseData.status as WinSheetStatus, dark)}`}
              >
                {STATUS_LABELS_DETAIL[caseData.status] || caseData.status}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 space-y-4">
        {/* Error */}
        {error && (
          <div
            className={`rounded-xl border p-4 flex items-center gap-3 ${dark ? "bg-red-900/20 border-red-800 text-red-400" : "bg-red-50 border-red-200 text-red-700"}`}
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="text-sm">{error}</span>
            <button
              onClick={() => router.push("/")}
              className="ml-auto text-xs font-medium underline"
            >
              Back to dashboard
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className={`h-6 w-6 animate-spin ${t.textMuted}`} />
          </div>
        )}

        {caseData && (
          <>
            {/* Case Info + Summary row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Case Information */}
              <div className={`${sectionCard} lg:col-span-2`}>
                <h4
                  className={`text-xs font-bold ${t.text} mb-3 flex items-center gap-2`}
                >
                  <FileText className="h-3.5 w-3.5" /> Case Information
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <p className={label}>Case ID</p>
                    <p className={value}>#{caseData.id}</p>
                  </div>
                  <div>
                    <p className={label}>External ID</p>
                    <p className={value}>{caseData.externalId || "—"}</p>
                  </div>
                  <div>
                    <p className={label}>Claimant</p>
                    <p className={value}>
                      {caseData.firstName} {caseData.lastName}
                    </p>
                  </div>
                  <div>
                    <p className={label}>Assigned To</p>
                    <p className={`${value} flex items-center gap-1`}>
                      <User className="h-3 w-3" /> {caseData.assigned}
                    </p>
                  </div>
                  <div>
                    <p className={label}>Office</p>
                    <p className={`${value} flex items-center gap-1`}>
                      <MapPin className="h-3 w-3" /> {caseData.office}
                    </p>
                  </div>
                  <div>
                    <p className={label}>Approval Date</p>
                    <p className={`${value} flex items-center gap-1`}>
                      <CalendarDays className="h-3 w-3" />{" "}
                      {caseData.approvalDate
                        ? fmtDate(caseData.approvalDate)
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className={label}>Claim Type</p>
                    <p className={value}>{fmtClaim(caseData.claim)}</p>
                  </div>
                  <div>
                    <p className={label}>Level Won</p>
                    <p className={value}>{caseData.level}</p>
                  </div>
                  {caseData.t2Decision && (
                    <div>
                      <p className={label}>T2 Decision</p>
                      <p className={value}>{caseData.t2Decision}</p>
                    </div>
                  )}
                  {caseData.t16Decision && (
                    <div>
                      <p className={label}>T16 Decision</p>
                      <p className={value}>{caseData.t16Decision}</p>
                    </div>
                  )}
                  <div>
                    <p className={label}>Fee Method</p>
                    <p className={value}>
                      {caseData.feeMethod?.replace("_", " ") || "—"}
                    </p>
                  </div>
                  <div>
                    <p className={label}>Fee Cap</p>
                    <p className={value}>
                      {fmtFull(caseData.applicableFeeCap)}
                      {caseData.feeCapApplied ? " (applied)" : ""}
                    </p>
                  </div>
                </div>
              </div>

              {/* Financial Summary */}
              <div className={sectionCard}>
                <h4
                  className={`text-xs font-bold ${t.text} mb-3 flex items-center gap-2`}
                >
                  <DollarSign className="h-3.5 w-3.5" /> Financial Summary
                </h4>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className={`text-xs ${t.textMuted}`}>
                      Total Retro Due
                    </span>
                    <span className={`text-sm font-semibold ${t.text}`}>
                      {currency(caseData.totalRetroDue)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className={`text-xs ${t.textMuted}`}>
                      Fees Expected
                    </span>
                    <span className={`text-sm font-bold ${t.text}`}>
                      {currency(caseData.expected)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className={`text-xs ${t.textMuted}`}>Fees Paid</span>
                    <span
                      className={`text-sm font-bold ${caseData.paid > 0 ? "text-emerald-500" : t.textMuted}`}
                    >
                      {currency(caseData.paid)}
                    </span>
                  </div>
                  <div className={`border-t pt-3 ${t.borderLight}`}>
                    <div className="flex justify-between items-center">
                      <span className={`text-xs font-semibold ${t.text}`}>
                        Outstanding
                      </span>
                      <span
                        className={`text-sm font-bold ${caseData.outstanding > 0 ? (dark ? "text-amber-400" : "text-amber-600") : "text-emerald-500"}`}
                      >
                        {caseData.outstanding > 0
                          ? currency(caseData.outstanding)
                          : "Fully Paid"}
                      </span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  {caseData.expected > 0 && (
                    <div>
                      <div
                        className={`h-2 rounded-full overflow-hidden ${dark ? "bg-neutral-800" : "bg-neutral-200"}`}
                      >
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-all"
                          style={{
                            width: `${Math.min(100, (caseData.paid / caseData.expected) * 100)}%`,
                          }}
                        />
                      </div>
                      <p className={`text-[10px] ${t.textMuted} mt-1`}>
                        {((caseData.paid / caseData.expected) * 100).toFixed(1)}
                        % collected
                      </p>
                    </div>
                  )}

                  {/* Status badges */}
                  <div className="flex flex-wrap gap-2 pt-2">
                    {caseData.pif && (
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${PIF_BADGE(caseData.pif, dark)}`}
                      >
                        {caseData.pif === "YES" ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <XCircle className="h-3 w-3" />
                        )}
                        PIF: {caseData.pif}
                      </span>
                    )}
                    {caseData.daysAfterApproval !== null && (
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          caseData.approvalCategory === ">60"
                            ? dark
                              ? "bg-red-900/40 text-red-400"
                              : "bg-red-50 text-red-700"
                            : dark
                              ? "bg-emerald-900/40 text-emerald-400"
                              : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        <Clock className="h-3 w-3" />
                        {caseData.daysAfterApproval}d{" "}
                        {caseData.approvalCategory}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Fee Breakdown — T16 / T2 / AUX */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FeeSection
                title="T16 (SSI)"
                color={dark ? "text-indigo-400" : "text-indigo-600"}
                retro={caseData.t16Retro}
                due={caseData.t16FeeDue}
                received={caseData.t16FeeReceived}
                pending={caseData.t16Pending}
                dateReceived={caseData.t16FeeReceivedDate}
              />
              <FeeSection
                title="T2 (SSDI)"
                color={dark ? "text-blue-400" : "text-blue-600"}
                retro={caseData.t2Retro}
                due={caseData.t2FeeDue}
                received={caseData.t2FeeReceived}
                pending={caseData.t2Pending}
                dateReceived={caseData.t2FeeReceivedDate}
              />
              <FeeSection
                title="AUX (Auxiliary)"
                color={dark ? "text-violet-400" : "text-violet-600"}
                retro={caseData.auxRetro}
                due={caseData.auxFeeDue}
                received={caseData.auxFeeReceived}
                pending={caseData.auxPending}
                dateReceived={caseData.auxFeeReceivedDate}
              />
            </div>

            {/* Activity Log */}
            <div className={sectionCard}>
              <h4
                className={`text-xs font-bold ${t.text} mb-4 flex items-center gap-2`}
              >
                <MessageSquare className="h-3.5 w-3.5" /> Activity Log
                <span className={`ml-1 text-[10px] font-normal ${t.textMuted}`}>
                  ({caseData.activities?.length ?? 0}{" "}
                  {caseData.activities?.length === 1 ? "entry" : "entries"})
                </span>
              </h4>

              {!caseData.activities || caseData.activities.length === 0 ? (
                <p className={`text-sm ${t.textMuted} text-center py-8`}>
                  No activity recorded yet.
                </p>
              ) : (
                <div className="relative">
                  {/* Timeline line */}
                  <div
                    className={`absolute left-2.75 top-2 bottom-2 w-px ${dark ? "bg-neutral-800" : "bg-neutral-200"}`}
                  />

                  <div className="space-y-4">
                    {caseData.activities.map((a) => (
                      <div key={a.id} className="flex gap-3 relative">
                        {/* Timeline dot */}
                        <div
                          className={`w-5.75 h-5.75 rounded-full border-2 flex items-center justify-center shrink-0 z-10 ${
                            dark
                              ? "bg-neutral-900 border-neutral-700"
                              : "bg-white border-neutral-300"
                          }`}
                        >
                          <div
                            className={`w-2 h-2 rounded-full ${dark ? "bg-neutral-500" : "bg-neutral-400"}`}
                          />
                        </div>

                        <div className="flex-1 min-w-0 pb-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[11px] font-semibold ${t.text}`}
                            >
                              {a.createdBy}
                            </span>
                            <span className={`text-[10px] ${t.textMuted}`}>
                              {new Date(a.createdAt).toLocaleDateString(
                                "en-US",
                                {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                                },
                              )}
                            </span>
                          </div>
                          <p
                            className={`text-[12px] ${t.textSub} mt-0.5 leading-relaxed`}
                          >
                            {a.message}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CaseDetailPage;
