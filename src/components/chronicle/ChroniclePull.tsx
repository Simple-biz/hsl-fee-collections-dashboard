"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import {
  Download,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  Database,
  Search,
  User,
  MapPin,
  Calendar,
  Scale,
  FileText,
} from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import { fmtClaim, fmtDate } from "@/lib/formatters";

interface ParsedCase {
  chronicleClientId: number;
  externalId: string;
  firstName: string;
  lastName: string;
  last4Ssn: string;
  dob: string | null;
  claimType: string;
  claimTypeRaw: string[];
  reportType: string;
  officeWithJurisdiction: string;
  statusOfCase: string;
  statusDate: string | null;
  applicationDate: string | null;
  allegedOnset: string | null;
  receiptDate: string | null;
  closureDate: string | null;
  lastChange: string | null;
  hearingRequestDate: string | null;
  hearingScheduledDate: string | null;
  hearingHeldDate: string | null;
  aljName: string | null;
  hearingTimezone: string | null;
  t2Decision: string | null;
  t16Decision: string | null;
  isFavorable: boolean;
  favorableTypes: string[];
  isUnfavorable: boolean;
  decisionPending: boolean;
  caseLevel: string;
}

interface PullResult {
  parsed: ParsedCase;
  existsInDb: boolean;
  matchedClientId: number | null;
  usingMock: boolean;
}

export const ChroniclePull = () => {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const t = themeClasses(dark);

  const [clientId, setClientId] = useState("");
  const [pulling, setPulling] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PullResult | null>(null);
  const [pullHistory, setPullHistory] = useState<PullResult[]>([]);
  const [importResult, setImportResult] = useState<string | null>(null);

  const handlePull = async () => {
    if (!clientId.trim()) return;
    setPulling(true);
    setError(null);
    setResult(null);
    setImportResult(null);

    try {
      const res = await fetch("/api/chronicle/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: clientId.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to pull");

      setResult(data);
      setPullHistory((prev) => {
        const filtered = prev.filter(
          (p) => p.parsed.chronicleClientId !== data.parsed.chronicleClientId,
        );
        return [data, ...filtered].slice(0, 20);
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPulling(false);
    }
  };

  const handleImport = async () => {
    if (!result?.parsed) return;
    setImporting(true);
    setError(null);

    try {
      const res = await fetch("/api/chronicle/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cases: [result.parsed] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to import");

      setImportResult(
        `Imported ${result.parsed.lastName}, ${result.parsed.firstName} successfully.`,
      );
      setResult({
        ...result,
        existsInDb: true,
        matchedClientId: data.details?.imported?.[0]?.clientId || null,
      });
      setPullHistory((prev) =>
        prev.map((p) =>
          p.parsed.chronicleClientId === result.parsed.chronicleClientId
            ? { ...p, existsInDb: true }
            : p,
        ),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const decisionBadge = (label: string, decision: string | null) => {
    if (!decision)
      return (
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs ${dark ? "bg-neutral-800/60 text-neutral-500" : "bg-neutral-50 text-neutral-400"}`}
        >
          <span className="font-medium">{label}:</span> <span>N/A</span>
        </div>
      );
    const lower = decision.toLowerCase();
    const fav = lower.includes("favorable") && !lower.includes("unfavorable");
    const unfav = lower.includes("unfavorable");
    return (
      <div
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium ${
          fav
            ? dark
              ? "bg-emerald-900/30 text-emerald-400"
              : "bg-emerald-50 text-emerald-700"
            : unfav
              ? dark
                ? "bg-red-900/30 text-red-400"
                : "bg-red-50 text-red-700"
              : dark
                ? "bg-neutral-800/60 text-neutral-400"
                : "bg-neutral-100 text-neutral-600"
        }`}
      >
        {fav ? (
          <CheckCircle2 className="h-3.5 w-3.5" />
        ) : unfav ? (
          <XCircle className="h-3.5 w-3.5" />
        ) : (
          <Clock className="h-3.5 w-3.5" />
        )}
        <span>{label}:</span> <span>{decision}</span>
      </div>
    );
  };

  const infoRow = (
    Icon: React.ElementType,
    label: string,
    value: string | null,
  ) => (
    <div className="flex items-center gap-2">
      <Icon className={`h-3.5 w-3.5 ${t.textMuted} shrink-0`} />
      <span className={`text-[11px] ${t.textMuted} w-28 shrink-0`}>
        {label}
      </span>
      <span className={`text-[12px] ${t.text}`}>{value || "\u2014"}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className={`rounded-xl border ${t.card}`}>
        <div className="p-4 md:p-5">
          <div className="flex items-center gap-3 mb-3">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center ${dark ? "bg-indigo-900/40" : "bg-indigo-50"}`}
            >
              <Database
                className={`h-5 w-5 ${dark ? "text-indigo-400" : "text-indigo-600"}`}
              />
            </div>
            <div>
              <h3 className={`text-sm font-bold ${t.text}`}>
                Chronicle Legal Lookup
              </h3>
              <p className={`text-[11px] ${t.textMuted} mt-0.5`}>
                Enter a Chronicle Client ID to pull case data
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search
                className={`absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 ${t.textMuted}`}
              />
              <input
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handlePull()}
                placeholder="Enter Chronicle Client ID (e.g. 112221)"
                className={`w-full h-9 pl-9 pr-3 rounded-lg border text-sm outline-none ${t.inputBg}`}
              />
            </div>
            <button
              onClick={handlePull}
              disabled={pulling || !clientId.trim()}
              className={`h-9 px-4 rounded-lg text-xs font-semibold flex items-center gap-2 ${t.ctaBtn} disabled:opacity-40`}
            >
              {pulling ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              {pulling ? "Pulling..." : "Pull"}
            </button>
          </div>
        </div>
      </div>

      {/* Notices */}
      {error && (
        <div
          className={`rounded-xl border p-3 flex items-center gap-2.5 ${dark ? "bg-red-900/20 border-red-800 text-red-400" : "bg-red-50 border-red-200 text-red-700"}`}
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}
      {importResult && (
        <div
          className={`rounded-xl border p-3 flex items-center gap-2.5 ${dark ? "bg-emerald-900/20 border-emerald-800 text-emerald-400" : "bg-emerald-50 border-emerald-200 text-emerald-700"}`}
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span className="text-sm">{importResult}</span>
        </div>
      )}
      {result?.usingMock && (
        <div
          className={`rounded-xl border p-3 flex items-center gap-2.5 ${dark ? "bg-amber-900/20 border-amber-800 text-amber-400" : "bg-amber-50 border-amber-200 text-amber-700"}`}
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="text-[11px]">
            Using mock data \u2014 set CHRONICLE_API_URL and CHRONICLE_API_KEY
            in .env.local
          </span>
        </div>
      )}

      {/* Loading */}
      {pulling && (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className={`h-5 w-5 animate-spin ${t.textMuted}`} />
          <span className={`ml-2 text-sm ${t.textSub}`}>
            Fetching from Chronicle...
          </span>
        </div>
      )}

      {/* Result card */}
      {result && !pulling && (
        <div className={`rounded-xl border overflow-hidden ${t.card}`}>
          {/* Decision banner */}
          <div
            className={`px-4 py-3 flex items-center justify-between ${
              result.parsed.isFavorable
                ? dark
                  ? "bg-emerald-900/20 border-b border-emerald-800/50"
                  : "bg-emerald-50 border-b border-emerald-200"
                : result.parsed.isUnfavorable
                  ? dark
                    ? "bg-red-900/20 border-b border-red-800/50"
                    : "bg-red-50 border-b border-red-200"
                  : dark
                    ? "bg-amber-900/20 border-b border-amber-800/50"
                    : "bg-amber-50 border-b border-amber-200"
            }`}
          >
            <div className="flex items-center gap-2.5">
              {result.parsed.isFavorable ? (
                <CheckCircle2
                  className={`h-5 w-5 ${dark ? "text-emerald-400" : "text-emerald-600"}`}
                />
              ) : result.parsed.isUnfavorable ? (
                <XCircle
                  className={`h-5 w-5 ${dark ? "text-red-400" : "text-red-600"}`}
                />
              ) : (
                <Clock
                  className={`h-5 w-5 ${dark ? "text-amber-400" : "text-amber-600"}`}
                />
              )}
              <div>
                <span className={`text-sm font-bold ${t.text}`}>
                  {result.parsed.isFavorable
                    ? "Favorable Decision"
                    : result.parsed.isUnfavorable
                      ? "Unfavorable Decision"
                      : "Decision Pending"}
                </span>
                {result.parsed.isFavorable && (
                  <span
                    className={`ml-2 text-xs ${dark ? "text-emerald-400" : "text-emerald-600"}`}
                  >
                    ({result.parsed.favorableTypes.join(" + ")})
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {result.existsInDb ? (
                <span
                  className={`text-[10px] font-semibold px-2 py-1 rounded ${dark ? "bg-blue-900/40 text-blue-400" : "bg-blue-100 text-blue-700"}`}
                >
                  Already in DB #{result.matchedClientId}
                </span>
              ) : result.parsed.isFavorable ? (
                <button
                  onClick={handleImport}
                  disabled={importing}
                  className={`h-8 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${t.ctaBtn} disabled:opacity-50`}
                >
                  {importing ? (
                    <RefreshCw className="h-3 w-3 animate-spin" />
                  ) : (
                    <ArrowRight className="h-3 w-3" />
                  )}
                  Import to Dashboard
                </button>
              ) : null}
            </div>
          </div>

          {/* Info grid */}
          <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              <p
                className={`text-[10px] font-semibold uppercase tracking-wider ${t.textMuted}`}
              >
                Client Information
              </p>
              {infoRow(
                User,
                "Name",
                `${result.parsed.lastName}, ${result.parsed.firstName}`,
              )}
              {infoRow(
                Database,
                "Chronicle ID",
                String(result.parsed.chronicleClientId),
              )}
              {infoRow(FileText, "External ID", result.parsed.externalId)}
              {infoRow(User, "Last 4 SSN", result.parsed.last4Ssn)}
              {infoRow(
                Calendar,
                "DOB",
                result.parsed.dob ? fmtDate(result.parsed.dob) : null,
              )}
              {infoRow(MapPin, "Office", result.parsed.officeWithJurisdiction)}
              <div className="pt-2">
                <p
                  className={`text-[10px] font-semibold uppercase tracking-wider ${t.textMuted} mb-2`}
                >
                  Claim Details
                </p>
                {infoRow(
                  Scale,
                  "Claim Type",
                  fmtClaim(result.parsed.claimType),
                )}
                {infoRow(Scale, "Level", result.parsed.caseLevel)}
                {infoRow(Scale, "Report Type", result.parsed.reportType)}
                {infoRow(Scale, "Case Status", result.parsed.statusOfCase)}
                {infoRow(
                  Calendar,
                  "Status Date",
                  result.parsed.statusDate
                    ? fmtDate(result.parsed.statusDate)
                    : null,
                )}
              </div>
            </div>

            <div className="space-y-3">
              <p
                className={`text-[10px] font-semibold uppercase tracking-wider ${t.textMuted}`}
              >
                Decisions
              </p>
              <div className="flex flex-col gap-2">
                {decisionBadge("T2", result.parsed.t2Decision)}
                {decisionBadge("T16", result.parsed.t16Decision)}
              </div>
              <div className="pt-2">
                <p
                  className={`text-[10px] font-semibold uppercase tracking-wider ${t.textMuted} mb-2`}
                >
                  Key Dates
                </p>
                {infoRow(
                  Calendar,
                  "Application",
                  result.parsed.applicationDate
                    ? fmtDate(result.parsed.applicationDate)
                    : null,
                )}
                {infoRow(
                  Calendar,
                  "Alleged Onset",
                  result.parsed.allegedOnset
                    ? fmtDate(result.parsed.allegedOnset)
                    : null,
                )}
                {infoRow(
                  Calendar,
                  "Hearing Requested",
                  result.parsed.hearingRequestDate
                    ? fmtDate(result.parsed.hearingRequestDate)
                    : null,
                )}
                {infoRow(
                  Calendar,
                  "Hearing Held",
                  result.parsed.hearingHeldDate
                    ? fmtDate(result.parsed.hearingHeldDate)
                    : null,
                )}
                {infoRow(
                  Calendar,
                  "Closure Date",
                  result.parsed.closureDate
                    ? fmtDate(result.parsed.closureDate)
                    : null,
                )}
                {infoRow(
                  Calendar,
                  "Last Change",
                  result.parsed.lastChange
                    ? fmtDate(result.parsed.lastChange)
                    : null,
                )}
              </div>
              {result.parsed.aljName && (
                <div className="pt-2">
                  <p
                    className={`text-[10px] font-semibold uppercase tracking-wider ${t.textMuted} mb-2`}
                  >
                    Hearing Info
                  </p>
                  {infoRow(User, "ALJ", result.parsed.aljName)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Pull history */}
      {pullHistory.length > 0 && (
        <div className={`rounded-xl border ${t.card}`}>
          <div className={`px-4 py-3 border-b ${t.borderLight}`}>
            <h4 className={`text-xs font-semibold ${t.text}`}>Pull History</h4>
          </div>
          <div
            className={`divide-y ${dark ? "divide-neutral-800" : "divide-neutral-100"}`}
          >
            {pullHistory.map((pr, i) => (
              <button
                key={i}
                onClick={() => {
                  setClientId(String(pr.parsed.chronicleClientId));
                  setResult(pr);
                  setError(null);
                  setImportResult(null);
                }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${dark ? "hover:bg-neutral-800/40" : "hover:bg-neutral-50"} transition-colors`}
              >
                {pr.parsed.isFavorable ? (
                  <CheckCircle2
                    className={`h-4 w-4 shrink-0 ${dark ? "text-emerald-400" : "text-emerald-600"}`}
                  />
                ) : pr.parsed.isUnfavorable ? (
                  <XCircle
                    className={`h-4 w-4 shrink-0 ${dark ? "text-red-400" : "text-red-600"}`}
                  />
                ) : (
                  <Clock
                    className={`h-4 w-4 shrink-0 ${dark ? "text-amber-400" : "text-amber-600"}`}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <span className={`text-[12px] font-semibold ${t.text}`}>
                    {pr.parsed.lastName}, {pr.parsed.firstName}
                  </span>
                  <span className={`ml-2 text-[10px] ${t.textMuted}`}>
                    #{pr.parsed.chronicleClientId}
                  </span>
                </div>
                <span
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${t.pillBg}`}
                >
                  {fmtClaim(pr.parsed.claimType)}
                </span>
                <span className={`text-[10px] ${t.textMuted}`}>
                  {pr.parsed.caseLevel}
                </span>
                {pr.existsInDb ? (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded ${dark ? "bg-blue-900/30 text-blue-400" : "bg-blue-50 text-blue-600"}`}
                  >
                    In DB
                  </span>
                ) : (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded ${dark ? "bg-emerald-900/30 text-emerald-400" : "bg-emerald-50 text-emerald-600"}`}
                  >
                    New
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!result && !pulling && pullHistory.length === 0 && (
        <div className={`rounded-xl border p-12 text-center ${t.card}`}>
          <Database className={`h-10 w-10 mx-auto ${t.textMuted} mb-3`} />
          <p className={`text-sm font-semibold ${t.text}`}>
            Look up a case from Chronicle
          </p>
          <p className={`text-xs ${t.textMuted} mt-1 max-w-md mx-auto`}>
            Enter a Chronicle Client ID above to pull case data. Favorable
            decisions can be imported directly into the dashboard.
          </p>
          <p className={`text-[10px] ${t.textMuted} mt-3`}>
            Mock IDs for testing: 112221, 112222, 112223, 112224
          </p>
        </div>
      )}
    </div>
  );
};
