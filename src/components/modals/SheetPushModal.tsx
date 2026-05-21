"use client";

import { useEffect, useState } from "react";
import {
  X,
  RefreshCw,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CloudUpload,
} from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import { fmtFull, fmtDate } from "@/lib/formatters";

interface PushPreviewRow {
  "CASE LINK": string;
  "ASSIGNED TO": string | null;
  "CASE LEVEL": string | null;
  "CLAIM TYPE": string | null;
  "APPROVAL DATE": string | null;
  "WIN SHEET STATUS": string;
  "T16 FEE DUE": string | null;
  "T2 FEE DUE": string | null;
  "AUX FEE DUE": string | null;
}

interface PushPreviewResponse {
  total: number;
  sample: PushPreviewRow[];
}

interface SheetPushModalProps {
  dark: boolean;
  onClose: () => void;
  onPushed: () => void;
}

type Step = 1 | 2;

const STEPS: { n: Step; title: string; subtitle: string }[] = [
  { n: 1, title: "Step 1", subtitle: "Preview" },
  { n: 2, title: "Step 2", subtitle: "Push to Sheets" },
];

const STATUS_PILL: Record<string, string> = {
  not_started: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400",
  started: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
  in_progress: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400",
  pending_payment: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400",
  partially_paid: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
  paid_in_full: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  closed: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400",
};

export default function SheetPushModal({
  dark,
  onClose,
  onPushed,
}: SheetPushModalProps) {
  const t = themeClasses(dark);
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<PushPreviewResponse | null>(null);
  const [pushing, setPushing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushed, setPushed] = useState<number | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 30_000);
    setLoading(true);
    setPreviewError(null);
    setPushError(null);
    setPreview(null);
    setStep(1);
    (async () => {
      try {
        const res = await fetch("/api/sheets/push?mode=preview", {
          method: "POST",
          signal: controller.signal,
        });
        let json: Record<string, unknown> = {};
        try { json = await res.json(); } catch { /* non-JSON body */ }
        if (!res.ok) throw new Error((json.error as string) || `Preview failed (${res.status})`);
        setPreview(json as unknown as PushPreviewResponse);
        setLoading(false);
      } catch (e) {
        const err = e as Error;
        if (err.name === "AbortError") {
          if (!timedOut) return; // intentional cleanup abort
          setPreviewError("Preview timed out — please try again.");
          setLoading(false);
          return;
        }
        setPreviewError(err.message);
        setLoading(false);
      } finally {
        clearTimeout(timer);
      }
    })();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [retryCount]);

  const runPush = async () => {
    setPushing(true);
    setPushError(null);
    try {
      const res = await fetch("/api/sheets/push?mode=push", {
        method: "POST",
        signal: AbortSignal.timeout(60_000),
      });
      let json: Record<string, unknown> = {};
      try { json = await res.json(); } catch { /* non-JSON body */ }
      if (!res.ok) throw new Error((json.error as string) || `Push failed (${res.status})`);
      setPushed((json as unknown as { pushed: number }).pushed ?? 0);
      onPushed();
    } catch (e) {
      const err = e as Error;
      setPushError(err.name === "AbortError" ? "Push timed out — please try again." : err.message);
    } finally {
      setPushing(false);
    }
  };

  const canAdvance = step === 1 && !!preview;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50" />
      <div
        className={`relative w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col rounded-xl border ${t.card} mx-4`}
        onClick={(e) => e.stopPropagation()}
      >

        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-3 border-b ${t.borderLight}`}>
          <div className="flex items-center gap-2">
            <CloudUpload
              className={`h-4 w-4 ${dark ? "text-blue-400" : "text-blue-600"}`}
              aria-hidden="true"
            />
            <h3 className={`text-sm font-bold ${t.text}`}>Push to Google Sheets</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className={`h-7 w-7 rounded-md flex items-center justify-center ${t.hover} ${t.textSub}`}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Stepper */}
        <div className={`grid grid-cols-2 gap-1 p-1 ${dark ? "bg-neutral-900/50" : "bg-neutral-50"}`}>
          {STEPS.map((s) => {
            const active = s.n === step;
            const completed = s.n < step;
            return (
              <button
                key={s.n}
                onClick={() => { if (s.n <= step || canAdvance) setStep(s.n); }}
                className={`text-left px-3 py-2 rounded-md transition-colors ${
                  active
                    ? dark ? "bg-neutral-100 text-neutral-900" : "bg-neutral-900 text-white"
                    : completed
                      ? dark ? "text-neutral-200 hover:bg-neutral-800" : "text-neutral-700 hover:bg-neutral-200"
                      : dark ? "text-neutral-500" : "text-neutral-400"
                }`}
              >
                <div className="text-[10px] font-bold uppercase tracking-wider">{s.title}</div>
                <div className="text-[12px] font-medium">{s.subtitle}</div>
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20">
              <RefreshCw className={`h-8 w-8 animate-spin ${dark ? "text-blue-400" : "text-blue-600"}`} aria-hidden="true" />
              <div className="text-center">
                <p className={`text-sm font-semibold ${t.text}`}>Fetching case data…</p>
                <p className={`text-xs mt-1 ${t.textMuted}`}>Querying database, please wait</p>
              </div>
            </div>
          ) : (
          <>
          {previewError && step === 1 && (
            <div
              role="alert"
              className={`mb-4 rounded-md border p-3 text-xs flex items-start justify-between gap-3 ${dark ? "bg-red-900/20 border-red-800 text-red-300" : "bg-red-50 border-red-200 text-red-700"}`}
            >
              <span>{previewError}</span>
              <button
                onClick={() => setRetryCount((c) => c + 1)}
                className="shrink-0 underline font-semibold"
              >
                Retry
              </button>
            </div>
          )}
          {pushError && step === 2 && (
            <div
              role="alert"
              className={`mb-4 rounded-md border p-3 text-xs flex items-start justify-between gap-3 ${dark ? "bg-red-900/20 border-red-800 text-red-300" : "bg-red-50 border-red-200 text-red-700"}`}
            >
              <span>{pushError}</span>
              <button
                onClick={runPush}
                className="shrink-0 underline font-semibold"
              >
                Retry
              </button>
            </div>
          )}

          {/* STEP 1: Preview */}
          {step === 1 && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <FileSpreadsheet className={`h-4 w-4 ${t.textSub}`} aria-hidden="true" />
                <h4 className={`text-sm font-semibold ${t.text}`}>Preview</h4>
              </div>
              <p className={`text-[11px] ${t.textMuted} mb-4`}>
                All cases from the database will be pushed to Google Sheets.
                Existing rows are matched by <span className="font-semibold">CASE LINK</span> and
                updated in place. Cases not found in the sheet are appended as new rows.
              </p>

              {preview && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className={`rounded-lg border ${t.borderLight} p-3`}>
                      <p className={`text-[10px] font-semibold uppercase tracking-wider ${t.textMuted}`}>
                        Cases to push
                      </p>
                      <p className={`text-[24px] font-bold mt-0.5 tabular-nums ${dark ? "text-blue-400" : "text-blue-600"}`}>
                        {preview.total.toLocaleString()}
                      </p>
                    </div>
                    <div className={`rounded-lg border ${t.borderLight} p-3`}>
                      <p className={`text-[10px] font-semibold uppercase tracking-wider ${t.textMuted}`}>
                        Fields per row
                      </p>
                      <p className={`text-[24px] font-bold mt-0.5 tabular-nums ${t.text}`}>27</p>
                    </div>
                  </div>

                  <div className={`rounded-md border p-3 flex items-start gap-2 text-[11px] ${dark ? "bg-blue-900/20 border-blue-800 text-blue-300" : "bg-blue-50 border-blue-200 text-blue-700"}`}>
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>
                      <span className="font-semibold">Note:</span> Win Sheet Link is not pushed —
                      existing hyperlinks in the sheet are preserved.
                      New rows will be appended at the bottom of the sheet.
                    </span>
                  </div>

                  {/* Sample table */}
                  <div>
                    <p className={`text-[10px] font-semibold uppercase tracking-wider ${t.textMuted} mb-2`}>
                      Sample (first 10 rows)
                    </p>
                    <div className={`rounded-lg border ${t.borderLight} overflow-hidden`}>
                      <div className="overflow-x-auto">
                        <table className="w-full text-[12px]">
                          <thead>
                            <tr className={`border-b ${t.borderLight} ${dark ? "bg-neutral-900/40" : "bg-neutral-50"}`}>
                              {["Case", "Assigned", "Level", "Claim", "Approval Date", "Win Sheet Status", "T16 Due", "T2 Due", "AUX Due"].map((h) => (
                                <th key={h} className={`text-[10px] font-semibold uppercase tracking-wider px-3 py-2 text-left`}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {preview.sample.map((r, i) => (
                              <tr key={i} className={`border-b ${t.borderLight}`}>
                                <td className={`${t.text} px-3 py-1.5 font-medium max-w-64 truncate`} title={r["CASE LINK"]}>
                                  {r["CASE LINK"]}
                                </td>
                                <td className={`${t.textSub} px-3 py-1.5`}>{r["ASSIGNED TO"] ?? "—"}</td>
                                <td className={`${t.textSub} px-3 py-1.5`}>{r["CASE LEVEL"] ?? "—"}</td>
                                <td className={`${t.textSub} px-3 py-1.5`}>{r["CLAIM TYPE"] ?? "—"}</td>
                                <td className={`${t.textSub} px-3 py-1.5 tabular-nums`}>{fmtDate(r["APPROVAL DATE"])}</td>
                                <td className="px-3 py-1.5">
                                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${STATUS_PILL[r["WIN SHEET STATUS"]] ?? STATUS_PILL.not_started}`}>
                                    {r["WIN SHEET STATUS"].replace(/_/g, " ")}
                                  </span>
                                </td>
                                <td className={`${t.textSub} px-3 py-1.5 tabular-nums`}>
                                  {r["T16 FEE DUE"] ? fmtFull(Number(r["T16 FEE DUE"])) : "—"}
                                </td>
                                <td className={`${t.textSub} px-3 py-1.5 tabular-nums`}>
                                  {r["T2 FEE DUE"] ? fmtFull(Number(r["T2 FEE DUE"])) : "—"}
                                </td>
                                <td className={`${t.textSub} px-3 py-1.5 tabular-nums`}>
                                  {r["AUX FEE DUE"] ? fmtFull(Number(r["AUX FEE DUE"])) : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {preview.total > 10 && (
                        <div className={`text-[11px] px-3 py-2 ${t.textMuted} ${dark ? "bg-neutral-900/40" : "bg-neutral-50"} border-t ${t.borderLight}`}>
                          Showing 10 of {preview.total.toLocaleString()} rows. All will be pushed.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: Push */}
          {step === 2 && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <CloudUpload className={`h-4 w-4 ${t.textSub}`} aria-hidden="true" />
                <h4 className={`text-sm font-semibold ${t.text}`}>Push to Sheets</h4>
              </div>
              <p className={`text-[11px] ${t.textMuted} mb-6`}>
                Ready to push{" "}
                <span className={`font-semibold ${t.text}`}>
                  {preview?.total.toLocaleString() ?? "—"} cases
                </span>{" "}
                to Google Sheets. The n8n workflow will match each row by CASE LINK,
                update existing rows, and append new ones.
              </p>

              {pushed == null ? (
                <div className={`rounded-xl border p-6 flex flex-col items-center gap-4 ${t.card}`}>
                  <div className={`w-14 h-14 rounded-full flex items-center justify-center ${dark ? "bg-blue-900/30" : "bg-blue-50"}`}>
                    <CloudUpload className={`h-7 w-7 ${dark ? "text-blue-400" : "text-blue-600"}`} aria-hidden="true" />
                  </div>
                  <div className="text-center">
                    <p className={`text-sm font-semibold ${t.text}`}>
                      Push {preview?.total.toLocaleString()} cases to Google Sheets
                    </p>
                    <p className={`text-[11px] ${t.textMuted} mt-1`}>
                      This will overwrite matching rows and append new ones.
                    </p>
                  </div>
                  <button
                    onClick={runPush}
                    disabled={pushing}
                    className={`h-10 px-6 rounded-lg text-sm font-semibold flex items-center gap-2 ${dark ? "bg-blue-600 hover:bg-blue-500 text-white" : "bg-blue-600 hover:bg-blue-700 text-white"} transition-colors disabled:opacity-50`}
                  >
                    {pushing ? (
                      <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <CloudUpload className="h-4 w-4" aria-hidden="true" />
                    )}
                    {pushing ? "Pushing…" : `Push ${preview?.total.toLocaleString()} Cases`}
                  </button>
                </div>
              ) : (
                <div className={`max-w-md mx-auto rounded-lg border p-5 ${dark ? "bg-emerald-900/20 border-emerald-800 text-emerald-300" : "bg-emerald-50 border-emerald-200 text-emerald-800"}`}>
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0" aria-hidden="true" />
                    <div className="text-[13px]">
                      <p className="font-bold">Push complete.</p>
                      <p className="opacity-90 mt-1">
                        <span className="font-semibold">{pushed.toLocaleString()}</span> case
                        {pushed === 1 ? "" : "s"} pushed to Google Sheets successfully.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          </>
          )}
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-between px-5 py-3 border-t ${t.borderLight}`}>
          <button
            onClick={() => { if (step === 1) onClose(); else setStep(1); }}
            className={`h-8 px-3 text-xs font-medium ${t.textSub} hover:underline flex items-center gap-1`}
          >
            <ArrowLeft className="h-3 w-3" aria-hidden="true" />
            {step === 1 ? "Cancel" : "Back"}
          </button>

          {step === 1 ? (
            <button
              onClick={() => setStep(2)}
              disabled={!canAdvance}
              className={`h-8 px-4 rounded-md text-xs font-semibold flex items-center gap-1.5 ${dark ? "bg-blue-600 hover:bg-blue-500 text-white" : "bg-blue-600 hover:bg-blue-700 text-white"} transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
            >
                Next: Push to Sheets
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </button>
          ) : (
            pushed != null && (
              <button
                onClick={onClose}
                className={`h-8 px-4 rounded-md text-xs font-semibold ${dark ? "bg-blue-600 hover:bg-blue-500 text-white" : "bg-blue-600 hover:bg-blue-700 text-white"} transition-colors`}
              >
                Done
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
