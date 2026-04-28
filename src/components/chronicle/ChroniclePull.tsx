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
  FileSearch,
  Stethoscope,
  Shield,
  DollarSign,
  // Mail,
  // Phone,
  Gavel,
  // Building2,
} from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import { fmtClaim, fmtDate } from "@/lib/formatters";
import type { PdfExtractedData } from "@/lib/chronicle-pdf-parser";

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
  allFileLink: string | null;
}

interface PullResult {
  parsed: ParsedCase;
  existsInDb: boolean;
  matchedClientId: number | null;
  usingMock: boolean;
}

// ============================================================================
// PDF field groups — defines selectable fields for import
// ============================================================================

interface PdfFieldDef {
  key: string;
  label: string;
  value: (d: PdfExtractedData) => string | number | null | undefined;
  display: (d: PdfExtractedData) => string | null;
}

interface PdfFieldGroup {
  label: string;
  icon: React.ElementType;
  fields: PdfFieldDef[];
}

const PDF_FIELD_GROUPS: PdfFieldGroup[] = [
  {
    label: "Identity & Contact",
    icon: Shield,
    fields: [
      {
        key: "fullSsn",
        label: "Full SSN",
        value: (d) => d.fullSsn,
        display: (d) => d.fullSsn,
      },
      {
        key: "dob",
        label: "Date of Birth",
        value: (d) => d.dob,
        display: (d) => d.dob,
      },
      {
        key: "email",
        label: "Email",
        value: (d) => d.email,
        display: (d) => d.email,
      },
      {
        key: "phone",
        label: "Phone",
        value: (d) => d.phone,
        display: (d) => d.phone,
      },
    ],
  },
  {
    label: "Medical",
    icon: Stethoscope,
    fields: [
      {
        key: "primaryDiagnosis",
        label: "Primary Diagnosis",
        value: (d) => d.primaryDiagnosis,
        display: (d) =>
          d.primaryDiagnosis
            ? `${d.primaryDiagnosis} (${d.primaryDiagnosisCode})`
            : null,
      },
      {
        key: "secondaryDiagnosis",
        label: "Secondary Diagnosis",
        value: (d) => d.secondaryDiagnosis,
        display: (d) =>
          d.secondaryDiagnosis
            ? `${d.secondaryDiagnosis} (${d.secondaryDiagnosisCode})`
            : null,
      },
      {
        key: "dateLastInsured",
        label: "DLI",
        value: (d) => d.dateLastInsured,
        display: (d) => d.dateLastInsured,
      },
      {
        key: "blindDli",
        label: "Blind DLI",
        value: (d) => d.blindDli,
        display: (d) => d.blindDli,
      },
      {
        key: "allegations",
        label: "Allegations",
        value: (d) => d.allegations,
        display: (d) =>
          d.allegations
            ? d.allegations.length > 60
              ? d.allegations.slice(0, 60) + "…"
              : d.allegations
            : null,
      },
    ],
  },
  {
    label: "Fee & Representation",
    icon: DollarSign,
    fields: [
      {
        key: "feeMethod",
        label: "Fee Method",
        value: (d) => d.feeMethod,
        display: (d) =>
          d.feeMethod === "fee_agreement"
            ? "Fee Agreement"
            : d.feeMethod === "fee_petition"
              ? "Fee Petition"
              : null,
      },
      {
        key: "feeCapAtSigning",
        label: "Fee Cap",
        value: (d) => d.feeCapAtSigning,
        display: (d) =>
          d.feeCapAtSigning ? `$${d.feeCapAtSigning.toLocaleString()}` : null,
      },
      {
        key: "feeAgreementDate",
        label: "Fee Agreement Date",
        value: (d) => d.feeAgreementDate,
        display: (d) => d.feeAgreementDate,
      },
      {
        key: "firmName",
        label: "Firm Name",
        value: (d) => d.firmName,
        display: (d) => d.firmName,
      },
      {
        key: "firmEin",
        label: "Firm EIN",
        value: (d) => d.firmEin,
        display: (d) => d.firmEin,
      },
      {
        key: "hearingOffice",
        label: "Hearing Office",
        value: (d) => d.hearingOffice,
        display: (d) => d.hearingOffice,
      },
    ],
  },
  {
    label: "Representatives",
    icon: User,
    fields: [
      {
        key: "representatives",
        label: "Representatives",
        value: (d) =>
          d.representatives?.length ? d.representatives.length : null,
        display: (d) =>
          d.representatives?.length
            ? d.representatives
                .map((r) => r.name + (r.repId ? ` (${r.repId})` : ""))
                .join(", ")
            : null,
      },
    ],
  },
  {
    label: "Decision History",
    icon: Gavel,
    fields: [
      {
        key: "decisionHistory",
        label: "Decision History",
        value: (d) =>
          d.decisionHistory?.length ? d.decisionHistory.length : null,
        display: (d) =>
          d.decisionHistory?.length
            ? d.decisionHistory
                .map((h) => `${h.level}/${h.claimType}: ${h.result}`)
                .join("; ")
            : null,
      },
    ],
  },
];

// ============================================================================

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

  // PDF parsing state
  const [parsingPdf, setParsingPdf] = useState(false);
  const [pdfData, setPdfData] = useState<PdfExtractedData | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [selectedPdfFields, setSelectedPdfFields] = useState<Set<string>>(
    new Set(),
  );

  // Toggle a single PDF field checkbox
  const togglePdfField = (key: string) => {
    setSelectedPdfFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Select / deselect all available PDF fields
  const selectAllPdfFields = () => {
    if (!pdfData) return;
    const all = new Set<string>();
    for (const g of PDF_FIELD_GROUPS) {
      for (const f of g.fields) {
        if (f.value(pdfData) != null) all.add(f.key);
      }
    }
    setSelectedPdfFields(all);
  };
  const deselectAllPdfFields = () => setSelectedPdfFields(new Set());

  // Count how many PDF fields have data
  const availablePdfFieldCount = pdfData
    ? PDF_FIELD_GROUPS.flatMap((g) => g.fields).filter(
        (f) => f.value(pdfData) != null,
      ).length
    : 0;

  const handleParsePdf = async () => {
    if (!result?.parsed?.allFileLink) return;
    setParsingPdf(true);
    setPdfError(null);
    setPdfData(null);

    try {
      const res = await fetch("/api/chronicle/pdf-parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allFileLink: result.parsed.allFileLink }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to parse PDF");
      setPdfData(data.data);
      // Auto-select all fields that have data
      const auto = new Set<string>();
      for (const g of PDF_FIELD_GROUPS) {
        for (const f of g.fields) {
          if (f.value(data.data) != null) auto.add(f.key);
        }
      }
      setSelectedPdfFields(auto);
    } catch (err) {
      setPdfError((err as Error).message);
    } finally {
      setParsingPdf(false);
    }
  };

  const handlePull = async () => {
    if (!clientId.trim()) return;
    setPulling(true);
    setError(null);
    setResult(null);
    setImportResult(null);
    setPdfData(null);
    setPdfError(null);
    setSelectedPdfFields(new Set());

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
      // Build pdfFields object from selected checkboxes
      let pdfFields: Record<string, unknown> | null = null;
      if (pdfData && selectedPdfFields.size > 0) {
        pdfFields = {};
        const sel = selectedPdfFields;
        if (sel.has("fullSsn")) pdfFields.fullSsn = pdfData.fullSsn;
        if (sel.has("dob")) pdfFields.dob = pdfData.dob;
        if (sel.has("email")) pdfFields.email = pdfData.email;
        if (sel.has("phone")) pdfFields.phone = pdfData.phone;
        if (sel.has("primaryDiagnosis")) {
          pdfFields.primaryDiagnosis = pdfData.primaryDiagnosis;
          pdfFields.primaryDiagnosisCode = pdfData.primaryDiagnosisCode;
        }
        if (sel.has("secondaryDiagnosis")) {
          pdfFields.secondaryDiagnosis = pdfData.secondaryDiagnosis;
          pdfFields.secondaryDiagnosisCode = pdfData.secondaryDiagnosisCode;
        }
        if (sel.has("dateLastInsured"))
          pdfFields.dateLastInsured = pdfData.dateLastInsured;
        if (sel.has("blindDli")) pdfFields.blindDli = pdfData.blindDli;
        if (sel.has("allegations")) pdfFields.allegations = pdfData.allegations;
        if (sel.has("feeMethod")) pdfFields.feeMethod = pdfData.feeMethod;
        if (sel.has("feeCapAtSigning"))
          pdfFields.feeCapAtSigning = pdfData.feeCapAtSigning;
        if (sel.has("feeAgreementDate"))
          pdfFields.feeAgreementDate = pdfData.feeAgreementDate;
        if (sel.has("firmName")) pdfFields.firmName = pdfData.firmName;
        if (sel.has("firmEin")) pdfFields.firmEin = pdfData.firmEin;
        if (sel.has("hearingOffice"))
          pdfFields.hearingOffice = pdfData.hearingOffice;
        if (sel.has("representatives"))
          pdfFields.representatives = pdfData.representatives;
        if (sel.has("decisionHistory"))
          pdfFields.decisionHistory = pdfData.decisionHistory;
      }

      const res = await fetch("/api/chronicle/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cases: [result.parsed], pdfFields }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to import");

      const pdfCount = pdfFields ? Object.keys(pdfFields).length : 0;
      const pdfNote = pdfCount > 0 ? ` (+ ${pdfCount} PDF fields)` : "";
      setImportResult(
        `Imported ${result.parsed.lastName}, ${result.parsed.firstName} successfully${pdfNote}.`,
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

      {/* PDF Parse button + results */}
      {result && !pulling && result.parsed.allFileLink && (
        <div className={`rounded-xl border overflow-hidden ${t.card}`}>
          <div
            className={`px-4 py-3 flex items-center justify-between border-b ${t.borderLight}`}
          >
            <div className="flex items-center gap-2.5">
              <FileSearch
                className={`h-4 w-4 ${dark ? "text-violet-400" : "text-violet-600"}`}
              />
              <div>
                <span className={`text-xs font-bold ${t.text}`}>
                  PDF Data Extraction
                </span>
                <span className={`ml-2 text-[10px] ${t.textMuted}`}>
                  Fields not available from API
                </span>
              </div>
            </div>
            {!pdfData && (
              <button
                onClick={handleParsePdf}
                disabled={parsingPdf}
                className={`h-8 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${
                  dark
                    ? "bg-violet-600 hover:bg-violet-500 text-white"
                    : "bg-violet-600 hover:bg-violet-700 text-white"
                } disabled:opacity-50 transition-colors`}
              >
                {parsingPdf ? (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                ) : (
                  <FileSearch className="h-3 w-3" />
                )}
                {parsingPdf ? "Parsing PDF..." : "Parse PDF"}
              </button>
            )}
            {pdfData && (
              <span
                className={`text-[10px] font-medium px-2 py-1 rounded ${dark ? "bg-emerald-900/30 text-emerald-400" : "bg-emerald-50 text-emerald-700"}`}
              >
                ✓ {pdfData.totalPages} pages parsed
              </span>
            )}
          </div>

          {/* Loading */}
          {parsingPdf && (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className={`h-4 w-4 animate-spin ${t.textMuted}`} />
              <span className={`ml-2 text-xs ${t.textSub}`}>
                Downloading & parsing PDF (this may take a moment)...
              </span>
            </div>
          )}

          {/* Error */}
          {pdfError && (
            <div
              className={`mx-4 my-3 rounded-lg p-2.5 flex items-center gap-2 text-xs ${dark ? "bg-red-900/20 text-red-400" : "bg-red-50 text-red-700"}`}
            >
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {pdfError}
            </div>
          )}

          {/* Results with selectable checkboxes */}
          {pdfData && (
            <div className="px-4 pb-4">
              {/* Select all / none toolbar */}
              <div
                className={`flex items-center justify-between py-2 mb-2 border-b ${t.borderLight}`}
              >
                <span className={`text-[11px] ${t.textMuted}`}>
                  {selectedPdfFields.size} of {availablePdfFieldCount} fields
                  selected for import
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={selectAllPdfFields}
                    className={`text-[10px] font-medium ${dark ? "text-violet-400 hover:text-violet-300" : "text-violet-600 hover:text-violet-700"}`}
                  >
                    Select All
                  </button>
                  <span className={`text-[10px] ${t.textMuted}`}>|</span>
                  <button
                    onClick={deselectAllPdfFields}
                    className={`text-[10px] font-medium ${dark ? "text-neutral-400 hover:text-neutral-300" : "text-neutral-500 hover:text-neutral-600"}`}
                  >
                    None
                  </button>
                </div>
              </div>

              {/* Field groups */}
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {PDF_FIELD_GROUPS.map((group) => {
                  const fieldsWithData = group.fields.filter(
                    (f) => f.value(pdfData) != null,
                  );
                  if (fieldsWithData.length === 0) return null;
                  const GroupIcon = group.icon;
                  return (
                    <div
                      key={group.label}
                      className={`rounded-lg border p-3 ${dark ? "border-neutral-800 bg-neutral-900/40" : "border-neutral-200 bg-neutral-50/50"}`}
                    >
                      <div className="flex items-center gap-1.5 mb-2">
                        <GroupIcon
                          className={`h-3.5 w-3.5 ${dark ? "text-violet-400" : "text-violet-600"}`}
                        />
                        <span
                          className={`text-[10px] font-semibold uppercase tracking-wider ${t.textMuted}`}
                        >
                          {group.label}
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {fieldsWithData.map((field) => {
                          const checked = selectedPdfFields.has(field.key);
                          const displayVal = field.display(pdfData);
                          return (
                            <label
                              key={field.key}
                              className={`flex items-start gap-2 py-1 px-1.5 rounded cursor-pointer transition-colors ${
                                checked
                                  ? dark
                                    ? "bg-violet-900/20"
                                    : "bg-violet-50"
                                  : dark
                                    ? "hover:bg-neutral-800/40"
                                    : "hover:bg-neutral-100"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => togglePdfField(field.key)}
                                className="mt-0.5 h-3.5 w-3.5 rounded border-neutral-300 text-violet-600 focus:ring-violet-500 shrink-0"
                              />
                              <div className="min-w-0 flex-1">
                                <span
                                  className={`text-[11px] font-medium ${t.text}`}
                                >
                                  {field.label}
                                </span>
                                {displayVal && (
                                  <p
                                    className={`text-[10px] ${t.textMuted} truncate`}
                                  >
                                    {displayVal}
                                  </p>
                                )}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Import button with PDF field count */}
              {result && !result.existsInDb && result.parsed.isFavorable && (
                <div
                  className={`mt-4 pt-3 border-t ${t.borderLight} flex items-center justify-between`}
                >
                  <span className={`text-[11px] ${t.textMuted}`}>
                    {selectedPdfFields.size > 0
                      ? `${selectedPdfFields.size} PDF fields will be saved with import`
                      : "No PDF fields selected — only Chronicle API data will be imported"}
                  </span>
                  <button
                    onClick={handleImport}
                    disabled={importing}
                    className={`h-9 px-4 rounded-lg text-xs font-semibold flex items-center gap-2 ${t.ctaBtn} disabled:opacity-50`}
                  >
                    {importing ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ArrowRight className="h-3.5 w-3.5" />
                    )}
                    {importing
                      ? "Importing..."
                      : `Import to Dashboard${selectedPdfFields.size > 0 ? ` + ${selectedPdfFields.size} PDF fields` : ""}`}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Not yet parsed hint */}
          {!pdfData && !parsingPdf && !pdfError && (
            <div className={`px-4 py-3 text-[11px] ${t.textMuted}`}>
              Click &quot;Parse PDF&quot; to extract diagnoses, fee info, DLI,
              representative details, and more from the Chronicle file.
            </div>
          )}
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
