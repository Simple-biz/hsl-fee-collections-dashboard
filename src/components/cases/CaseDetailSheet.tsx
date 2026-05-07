"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import {
  X,
  RefreshCw,
  FileText,
  DollarSign,
  CalendarDays,
  CheckCircle2,
  Shield,
  ChevronRight,
  ExternalLink,
  User,
  MapPin,
  Phone,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { themeClasses } from "@/lib/theme-classes";
import {
  fmtFull,
  fmtDate,
  fmtClaim,
  STATUS_LABELS_DETAIL,
  getStatusColor,
} from "@/lib/formatters";
import type { WinSheetStatus, CaseDetailData, UserDetails } from "@/types";

interface CaseDetailSheetProps {
  caseId: number;
  isOpen: boolean;
  onClose: () => void;
}

const currency = (v: number) => (v > 0 ? fmtFull(v) : "—");
const dateStr = (d: string | null) => (d ? fmtDate(d) : "—");

function ClientDetailsSection({
  ud,
  textMuted,
  lbl,
  val,
  sectionCls,
}: {
  ud: UserDetails;
  textMuted: string;
  lbl: string;
  val: string;
  sectionCls: string;
}) {
  const addressParts = [ud.addressLine1, ud.addressLine2, ud.city, ud.state, ud.zipCode, ud.country].filter(Boolean);
  const address = addressParts.length > 0 ? addressParts.join(", ") : null;

  const hasAny = ud.fullName || address || ud.cellPhone || ud.email || ud.ssn ||
    ud.dateOfBirth || ud.ageAtApproval != null || ud.placeOfBirth || ud.mothersName || ud.fathersName;

  if (!hasAny) return null;

  return (
    <div className={sectionCls}>
      <h4 className={`text-[10px] font-bold uppercase tracking-widest ${textMuted} mb-3 flex items-center gap-1.5`}>
        <User className="h-3 w-3" /> Client Details
      </h4>
      <div className="space-y-3">
        {ud.fullName && (
          <div>
            <p className={lbl}>Full Name</p>
            <p className={val}>{ud.fullName}</p>
          </div>
        )}
        {address && (
          <div>
            <p className={`${lbl} flex items-center gap-1`}><MapPin className="h-3 w-3" /> Address</p>
            <p className={`${val} text-wrap leading-snug`}>{address}</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          {ud.cellPhone && (
            <div>
              <p className={`${lbl} flex items-center gap-1`}><Phone className="h-3 w-3" /> Cell Phone</p>
              <p className={val}>{ud.cellPhone}</p>
            </div>
          )}
          {ud.email && (
            <div>
              <p className={lbl}>Email</p>
              <a
                href={`mailto:${ud.email}`}
                className={`${val} truncate hover:underline block`}
                title={ud.email}
              >
                {ud.email}
              </a>
            </div>
          )}
          {ud.ssn && (
            <div>
              <p className={lbl}>SSN</p>
              <p className={val}>{ud.ssn}</p>
            </div>
          )}
          {ud.dateOfBirth && (
            <div>
              <p className={lbl}>Date of Birth</p>
              <p className={val}>{ud.dateOfBirth}</p>
            </div>
          )}
          {ud.ageAtApproval != null && (
            <div>
              <p className={lbl}>Age at Approval</p>
              <p className={val}>{ud.ageAtApproval}</p>
            </div>
          )}
          {ud.placeOfBirth && (
            <div>
              <p className={lbl}>Place of Birth</p>
              <p className={val}>{ud.placeOfBirth}</p>
            </div>
          )}
        </div>
        {ud.mothersName && (
          <div>
            <p className={lbl}>Mother&apos;s First & Maiden Name</p>
            <p className={val}>{ud.mothersName}</p>
          </div>
        )}
        {ud.fathersName && (
          <div>
            <p className={lbl}>Father&apos;s First & Last Name</p>
            <p className={val}>{ud.fathersName}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CaseDetailSheet({
  caseId,
  isOpen,
  onClose,
}: CaseDetailSheetProps) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const t = themeClasses(dark);
  const router = useRouter();

  const [data, setData] = useState<CaseDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchCase = useCallback(async () => {
    if (!caseId) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/cases/${caseId}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("Failed to load case details");
      const json = await res.json();
      setData(json.data);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError((err as Error).message);
    } finally {
      if (abortRef.current === controller) {
        setLoading(false);
      }
    }
  }, [caseId]);

  useEffect(() => {
    if (isOpen) {
      fetchCase();
    } else {
      setData(null);
    }
    return () => {
      abortRef.current?.abort();
    };
  }, [isOpen, fetchCase]);

  const lbl = `text-[10px] font-semibold uppercase tracking-wider ${t.textMuted}`;
  const val = `text-[13px] font-semibold ${t.text} mt-0.5`;
  const sectionCls = `p-4 border-b ${t.borderLight}`;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        overlayClassName="bg-black/0 backdrop-blur-none"
        className={`w-full sm:max-w-md p-0 overflow-y-auto ${t.bg} border-l ${t.border} shadow-2xl transition-all duration-300 ease-in-out scrollbar-none`}
      >
        <SheetHeader className={`sticky top-0 p-4 border-b ${t.borderLight} ${t.bg} z-10`}>
          <div className="flex items-center justify-between">
            <SheetTitle className={`text-sm font-bold ${t.text}`}>
              Win Sheet Quick Look
            </SheetTitle>
            <button
              onClick={onClose}
              className={`h-7 w-7 rounded-md flex items-center justify-center ${t.hover} ${t.textSub}`}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <SheetDescription className={`text-[11px] ${t.textMuted}`}>
            Details needed for processing the win sheet for this case.
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <RefreshCw className={`h-6 w-6 animate-spin ${t.textMuted}`} />
            <span className={`text-xs ${t.textSub}`}>Loading case details...</span>
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <p className="text-sm text-red-500 mb-4">{error}</p>
            <button
              onClick={fetchCase}
              className={`h-8 px-4 rounded-md border text-xs font-medium ${t.outlineBtn}`}
            >
              Retry
            </button>
          </div>
        ) : data ? (
          <div className="flex flex-col">
            {/* Case Header Info */}
            <div className={`${sectionCls} bg-neutral-50/50 dark:bg-neutral-900/30`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className={`text-base font-bold ${t.text} truncate`}>
                    {data.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${t.pillBg}`}>
                      {fmtClaim(data.claim)}
                    </span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${t.pillBg}`}>
                      {data.level}
                    </span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${getStatusColor(data.status as WinSheetStatus, dark)}`}
                    >
                      {STATUS_LABELS_DETAIL[data.status] || data.status}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0 flex flex-col items-end gap-3">
                  <div>
                    <p className={lbl}>Case ID</p>
                    <p className={`${val} text-indigo-500`}>#{data.id}</p>
                  </div>
                  {data.externalId && (
                    <div>
                      <p className={lbl}>External ID</p>
                      <p className={`${val} text-indigo-500`}>{data.externalId}</p>
                    </div>
                  )}
                  <a
                    href={`https://rgdr.mycase.com/court_cases/${data.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase transition-all ${dark ? "bg-indigo-900/30 text-indigo-400 hover:bg-indigo-900/50" : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"}`}
                  >
                    MyCase <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </div>

            {/* Core Identification */}
            <div className={sectionCls}>
              <h4 className={`text-[10px] font-bold uppercase tracking-widest ${t.textMuted} mb-3 flex items-center gap-1.5`}>
                <Shield className="h-3 w-3" /> Identity & Verification
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className={lbl}>Approval Date</p>
                  <p className={`${val} flex items-center gap-1`}>
                    <CalendarDays className="h-3 w-3 text-indigo-500" /> {dateStr(data.approvalDate)}
                  </p>
                </div>
                <div>
                  <p className={lbl}>Aging</p>
                  <p className={`${val} ${data.approvalCategory === ">60" ? "text-red-500" : "text-emerald-500"}`}>
                    {data.daysAfterApproval != null ? `${data.daysAfterApproval} days` : "—"}
                  </p>
                </div>
              </div>
            </div>

            {/* Client Details */}
            {data.userDetails && (
              <ClientDetailsSection ud={data.userDetails} textMuted={t.textMuted} lbl={lbl} val={val} sectionCls={sectionCls} />
            )}

            {/* Decisions */}
            <div className={sectionCls}>
              <h4 className={`text-[10px] font-bold uppercase tracking-widest ${t.textMuted} mb-3 flex items-center gap-1.5`}>
                <FileText className="h-3 w-3" /> Decisions
              </h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className={lbl}>T2 (SSDI) Decision</p>
                  <p className={`${val} capitalize`}>{data.t2Decision?.replace(/_/g, " ") || "—"}</p>
                </div>
                <div className="flex items-center justify-between">
                  <p className={lbl}>T16 (SSI) Decision</p>
                  <p className={`${val} capitalize`}>{data.t16Decision?.replace(/_/g, " ") || "—"}</p>
                </div>
                <div className="flex items-center justify-between">
                  <p className={lbl}>Win Sheet Status</p>
                  <p className={val}>{STATUS_LABELS_DETAIL[data.status] || data.status}</p>
                </div>
              </div>
            </div>

            {/* Financial Totals */}
            <div className={sectionCls}>
              <h4 className={`text-[10px] font-bold uppercase tracking-widest ${t.textMuted} mb-3 flex items-center gap-1.5`}>
                <DollarSign className="h-3 w-3" /> Financial Summary
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className={lbl}>Total Retro Due</p>
                  <p className={`${val} text-lg`}>{currency(data.totalRetroDue)}</p>
                </div>
                <div>
                  <p className={lbl}>PIF Status</p>
                  <div className="mt-1">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        data.pif === "YES"
                          ? dark ? "bg-emerald-900/40 text-emerald-400" : "bg-emerald-50 text-emerald-700"
                          : data.pif === "PENDING"
                          ? dark ? "bg-amber-900/40 text-amber-400" : "bg-amber-50 text-amber-700"
                          : dark ? "bg-red-900/40 text-red-400" : "bg-red-50 text-red-700"
                      }`}
                    >
                      {data.pif === "YES" && <CheckCircle2 className="h-3 w-3 mr-1" />}
                      {data.pif || "NO"}
                    </span>
                  </div>
                </div>
                <div>
                  <p className={lbl}>Expected Fees</p>
                  <p className={val}>{currency(data.expected)}</p>
                </div>
                <div>
                  <p className={lbl}>Outstanding</p>
                  <p className={`${val} ${data.outstanding > 0 ? "text-red-500" : "text-emerald-500"}`}>
                    {currency(data.outstanding)}
                  </p>
                </div>
              </div>
            </div>

            {/* Detailed Fee Breakdown */}
            <div className={sectionCls}>
              <h4 className={`text-[10px] font-bold uppercase tracking-widest ${t.textMuted} mb-3`}>
                Fee Breakdown
              </h4>
              <div className="space-y-4">
                {[
                  {
                    key: "t16",
                    label: "T16 (SSI)",
                    titleColor: "text-indigo-500",
                    received: data.t16FeeReceived,
                    retro: data.t16Retro,
                    pending: data.t16Pending,
                  },
                  {
                    key: "t2",
                    label: "T2 (SSDI)",
                    titleColor: "text-blue-500",
                    received: data.t2FeeReceived,
                    retro: data.t2Retro,
                    pending: data.t2Pending,
                  },
                  {
                    key: "aux",
                    label: "AUX (Auxiliary)",
                    titleColor: "text-violet-500",
                    received: data.auxFeeReceived,
                    retro: data.auxRetro,
                    pending: data.auxPending,
                  },
                ].map((b) => (
                  <div key={b.key} className={`p-3 rounded-lg border ${t.borderLight} bg-neutral-50/30 dark:bg-neutral-900/20`}>
                    <div className="flex items-center justify-between mb-2">
                      <p className={`text-[11px] font-bold uppercase ${b.titleColor}`}>{b.label}</p>
                      <p className="text-[10px] font-medium text-emerald-500">Rec: {currency(b.received)}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className={lbl}>Retro</p>
                        <p className="text-xs font-semibold">{currency(b.retro)}</p>
                      </div>
                      <div>
                        <p className={lbl}>Pending</p>
                        <p className={`text-xs font-semibold ${b.pending > 0 ? "text-amber-500" : ""}`}>{currency(b.pending)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="p-4 mt-auto">
              <button
                onClick={() => router.push(`/cases/${data.id}`)}
                className={`w-full h-10 rounded-xl flex items-center justify-center gap-2 text-sm font-bold transition-all ${t.ctaBtn} shadow-lg shadow-indigo-500/20`}
              >
                Go to Case Page <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
