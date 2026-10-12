"use client";

import { useState, useRef } from "react";
import {
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Database,
  User,
  Calendar,
  Scale,
  FileText,
  Clock,
  Shield,
  ExternalLink,
} from "lucide-react";
import { fmtDate } from "@/lib/formatters";
import { CASEWELL_URL_RE } from "@/lib/import/case-link";
import type { CasewellParsedCase, CasewellDocument } from "@/lib/casewell-client";

interface PullResult {
  parsed: CasewellParsedCase;
  documents: CasewellDocument[];
  exhibitCount: number;
  existsInDb: boolean;
  matchedCaseId: number | null;
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value || "—"}</span>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        {title}
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
        {children}
      </div>
    </div>
  );
}

export function CasewellPull() {
  const [urlInput, setUrlInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PullResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  function extractId(raw: string): string | null {
    const trimmed = raw.trim();
    // Plain numeric ID
    if (/^\d+$/.test(trimmed)) return trimmed;
    // URL
    const m = trimmed.match(CASEWELL_URL_RE);
    return m?.[1] ?? null;
  }

  async function handleFetch() {
    const id = extractId(urlInput);
    if (!id) {
      setError("Enter a Casewell case URL or numeric ID.");
      return;
    }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/casewell/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ casewellId: id }),
        signal: ctrl.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      setResult(data as PullResult);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError((err as Error).message);
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }

  const p = result?.parsed;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* URL input */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <p className="text-sm text-muted-foreground">
          Paste a Casewell case URL or numeric ID to preview its data.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleFetch()}
            placeholder="https://casewell.simple.biz/cases/26539  or  26539"
            className="flex-1 rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            onClick={handleFetch}
            disabled={loading || !urlInput.trim()}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
            {loading ? "Fetching…" : "Fetch"}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {/* Result */}
      {result && p && (
        <div className="space-y-4">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3">
            <div>
              <h2 className="text-base font-semibold">
                {p.lastName}, {p.firstName}
              </h2>
              <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span>Casewell #{p.casewellId}</span>
                {p.legacyClientId && <span>Chronicle #{p.legacyClientId}</span>}
                <a
                  href={`https://casewell.simple.biz/cases/${p.casewellId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  Open in Casewell
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              </div>
            </div>
            {result.existsInDb ? (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                Linked to case #{result.matchedCaseId}
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                <Database className="h-3.5 w-3.5" aria-hidden="true" />
                Not linked in DB
              </div>
            )}
          </div>

          {/* Claimant */}
          <Section title="Claimant" icon={User}>
            <Field label="SSN Last 4" value={p.last4Ssn} />
            <Field label="Date of Birth" value={fmtDate(p.dob)} />
            <Field label="Assigned Agent" value={p.assignedUserName} />
            <Field label="Attorney Account" value={p.ssaAccountName} />
            <Field
              label="Invalid SSN"
              value={p.invalidSsn ? "Yes" : "No"}
            />
            <Field
              label="On Roster"
              value={p.onRoster ? `Yes (${fmtDate(p.rosterCheckedAt)})` : "No"}
            />
          </Section>

          {/* Claim */}
          <Section title="Claim" icon={Scale}>
            <Field label="Claim Type" value={p.claimTypeLabel || "—"} />
            <Field label="Level" value={p.caseLevel} />
            <Field label="Status Date" value={fmtDate(p.statusDate)} />
            <Field label="Application Date" value={fmtDate(p.applicationDate)} />
            <Field label="Alleged Onset" value={fmtDate(p.allegedOnsetDate)} />
            <Field label="Last Insured" value={fmtDate(p.lastInsuredDate)} />
          </Section>

          {/* Documents */}
          <Section title={`Documents (${p.caseDocumentCount})`} icon={FileText}>
            {result.documents.length === 0 ? (
              <p className="col-span-full text-sm text-muted-foreground">No documents available.</p>
            ) : (
              <div className="col-span-full space-y-1.5">
                {result.documents.slice(0, 10).map((doc) => (
                  <div key={doc.id} className="flex items-start justify-between gap-2 text-xs">
                    <span className="truncate text-foreground">{doc.document_name.trim()}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {doc.ef_received_date ? fmtDate(doc.ef_received_date) : "—"} · {doc.page_count}p
                    </span>
                  </div>
                ))}
                {result.documents.length > 10 && (
                  <p className="text-xs text-muted-foreground">
                    + {result.documents.length - 10} more
                  </p>
                )}
              </div>
            )}
          </Section>

          {/* Timestamps */}
          <Section title="Record" icon={Clock}>
            <Field label="Last Changed" value={fmtDate(p.lastChangeDate)} />
            <Field label="Created in Casewell" value={fmtDate(p.createdAt)} />
            <Field label="Last Updated" value={fmtDate(p.updatedAt)} />
          </Section>

          {/* Pending fields notice */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/40 dark:bg-amber-900/10">
            <div className="flex items-start gap-2">
              <Shield className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  Pending from Casewell API
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  The following fields are not yet exposed by the API and will be available in a future update:
                  hearing dates, ALJ name &amp; office, T2/T16 decisions, office with jurisdiction,
                  claimant contact info (email, phone, address), fee agreement details,
                  and document download links.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
