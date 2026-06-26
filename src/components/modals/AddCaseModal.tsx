"use client";

import { useState, useRef } from "react";
import { X, RefreshCw, Plus, CheckCircle2, ExternalLink, AlertCircle } from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import {
  parseCaseLink,
  extractMyCaseId,
  extractChronicleId,
} from "@/lib/import/case-link";
import type { DropdownOptionsByCategory } from "@/hooks/useDashboard";

interface AddCaseModalProps {
  dark: boolean;
  onClose: () => void;
  onCreated: () => Promise<void> | void;
  dropdownOptions?: DropdownOptionsByCategory;
}

interface FormState {
  // Worksheet-style entry: the visible CASE LINK text + the MyCase hyperlink.
  // `caseLink` is a transient parse source (not sent to the API).
  caseLink: string;
  clientId: string;
  firstName: string;
  lastName: string;
  externalId: string;
  // Chronicle deep link: `chronicleUrl` is the raw input shown to the user;
  // `chronicleId` is the numeric id extracted from it (what the API persists).
  chronicleUrl: string;
  chronicleId: string;
  aljFirstName: string;
  aljLastName: string;
  claimTypeLabel: string;
  levelWon: string;
  approvalDate: string;
  officeWithJurisdiction: string;
  assignedTo: string;
  winSheetStatus: string;
}

const EMPTY: FormState = {
  caseLink: "",
  clientId: "",
  firstName: "",
  lastName: "",
  externalId: "",
  chronicleUrl: "",
  chronicleId: "",
  aljFirstName: "",
  aljLastName: "",
  claimTypeLabel: "",
  levelWon: "",
  approvalDate: "",
  officeWithJurisdiction: "",
  assignedTo: "",
  winSheetStatus: "",
};

export default function AddCaseModal({
  dark,
  onClose,
  onCreated,
  dropdownOptions,
}: AddCaseModalProps) {
  const t = themeClasses(dark);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [clientIdStatus, setClientIdStatus] = useState<"idle" | "checking" | "duplicate" | "clear">("idle");
  const [duplicateName, setDuplicateName] = useState<string | null>(null);
  const checkAbortRef = useRef<AbortController | null>(null);

  const set = (key: keyof FormState, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const checkClientId = async (id: string) => {
    const trimmed = id.trim();
    if (!trimmed) { setClientIdStatus("idle"); setDuplicateName(null); return; }
    checkAbortRef.current?.abort();
    const controller = new AbortController();
    checkAbortRef.current = controller;
    setClientIdStatus("checking");
    try {
      const res = await fetch(`/api/cases/${trimmed}`, { signal: controller.signal });
      if (res.ok) {
        const json = await res.json();
        const { firstName, lastName } = json.data ?? {};
        setDuplicateName(lastName && firstName ? `${lastName}, ${firstName}` : `Client ID ${trimmed}`);
        setClientIdStatus("duplicate");
      } else if (res.status === 404) {
        setClientIdStatus("clear");
        setDuplicateName(null);
      } else {
        setClientIdStatus("idle");
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setClientIdStatus("idle");
    }
  };

  // Paste the worksheet "CASE LINK" text — e.g.
  // "2026.05.22 Watson, Katrina v. ALJ WENDY HOLLINGSWORTH" — and fill the
  // name/date/ALJ fields from it. Existing values are kept when the line has
  // nothing to offer for that field, so manual edits aren't wiped.
  const onCaseLink = (value: string) => {
    const p = parseCaseLink(value);
    setForm((f) => ({
      ...f,
      caseLink: value,
      firstName: p.firstName || f.firstName,
      lastName: p.lastName || f.lastName,
      approvalDate: p.approvalDate ?? f.approvalDate,
      aljFirstName: p.aljFirstName ?? f.aljFirstName,
      aljLastName: p.aljLastName ?? f.aljLastName,
    }));
  };

  // The MyCase hyperlink is stored as the external id; the numeric id in the
  // URL doubles as the Client ID (the fee_records/activity_log join key).
  const onMyCaseUrl = (value: string) => {
    const id = extractMyCaseId(value);
    setForm((f) => ({
      ...f,
      externalId: value,
      clientId: id ? String(id) : f.clientId,
    }));
    if (id) {
      setClientIdStatus("idle");
      setDuplicateName(null);
      checkClientId(String(id));
    }
  };

  // Paste a Chronicle URL (or a bare client id); we store the raw value for
  // display and the extracted numeric id as what the API persists.
  const onChronicleUrl = (value: string) => {
    const id = extractChronicleId(value);
    setForm((f) => ({
      ...f,
      chronicleUrl: value,
      chronicleId: id ? String(id) : "",
    }));
  };

  // Surfaced as a hint when a case link was entered but has no "v"/"vs"
  // separator, so the user knows the ALJ wasn't captured.
  const caseLinkMissingAlj =
    form.caseLink.trim() !== "" && parseCaseLink(form.caseLink).missingVSeparator;

  const claimTypes = dropdownOptions?.claim_type ?? [];
  const levels = dropdownOptions?.case_level ?? [];
  const assignees = dropdownOptions?.assigned_to ?? [];
  const statuses = dropdownOptions?.win_sheet_status ?? [];

  const canSubmit =
    form.clientId.trim() !== "" &&
    form.firstName.trim() !== "" &&
    form.lastName.trim() !== "" &&
    clientIdStatus !== "duplicate" &&
    !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Failed (${res.status})`);
      setDone(true);
      await onCreated();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const lblCls = `block text-[10px] font-semibold uppercase tracking-wider mb-1 ${t.textMuted}`;
  const inputCls = `h-9 w-full px-3 rounded-md border text-sm outline-none ${t.inputBg}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50" />
      <div
        className={`relative w-full max-w-lg max-h-[92vh] overflow-hidden flex flex-col rounded-xl border ${t.card} mx-4`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-5 py-3 border-b ${t.borderLight}`}
        >
          <h3 className={`text-sm font-bold ${t.text}`}>Add New Case</h3>
          <button
            onClick={onClose}
            className={`h-7 w-7 rounded-md flex items-center justify-center ${t.hover} ${t.textSub}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {done ? (
            <div
              className={`rounded-lg border p-5 ${dark ? "bg-emerald-900/20 border-emerald-800 text-emerald-300" : "bg-emerald-50 border-emerald-200 text-emerald-800"}`}
            >
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0" />
                <div className="text-[13px]">
                  <p className="font-bold">
                    Case created for {form.firstName} {form.lastName}.
                  </p>
                  <p className="opacity-90 mt-1">
                    Client ID {form.clientId} has been added to the dashboard.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              {error && (
                <div
                  className={`mb-4 rounded-md border p-3 text-xs ${dark ? "bg-red-900/20 border-red-800 text-red-300" : "bg-red-50 border-red-200 text-red-700"}`}
                >
                  {error}
                </div>
              )}

              {/* Worksheet-style entry — paste the CASE LINK line + MyCase URL
                  and the fields below fill in automatically. */}
              <div
                className={`mb-4 rounded-lg border p-3 ${t.borderLight} ${dark ? "bg-white/2" : "bg-neutral-50"}`}
              >
                <label className={lblCls}>Case Entry (worksheet format)</label>
                <input
                  value={form.caseLink}
                  onChange={(e) => onCaseLink(e.target.value)}
                  placeholder="2026.05.22 Watson, Katrina v. ALJ WENDY HOLLINGSWORTH"
                  className={inputCls}
                />
                <label className={`${lblCls} mt-3`}>MyCase URL</label>
                <div className="relative">
                  <input
                    value={form.externalId}
                    onChange={(e) => onMyCaseUrl(e.target.value)}
                    placeholder="https://…mycase.com/court_cases/12345678"
                    className={`${inputCls} pr-9`}
                  />
                  {extractMyCaseId(form.externalId) && (
                    <a
                      href={form.externalId}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`absolute right-2 top-1/2 -translate-y-1/2 ${t.textSub} hover:opacity-80`}
                      title="Open in MyCase"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
                <label className={`${lblCls} mt-3`}>Chronicle Link</label>
                <div className="relative">
                  <input
                    value={form.chronicleUrl}
                    onChange={(e) => onChronicleUrl(e.target.value)}
                    placeholder="https://app.chroniclelegal.com/dashboard/clients/12345"
                    className={`${inputCls} pr-9`}
                  />
                  {form.chronicleId && (
                    <a
                      href={`https://app.chroniclelegal.com/dashboard/clients/${form.chronicleId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`absolute right-2 top-1/2 -translate-y-1/2 ${t.textSub} hover:opacity-80`}
                      title="Open in Chronicle"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
                {form.chronicleUrl.trim() !== "" && !form.chronicleId && (
                  <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
                    Couldn’t read a Chronicle client id from that — paste the
                    full client URL or just the numeric id.
                  </p>
                )}
                {caseLinkMissingAlj && (
                  <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
                    No “v.” separator found — ALJ wasn’t captured. Add it as
                    “… v. ALJ NAME” or fill the ALJ fields below.
                  </p>
                )}
                <p className={`mt-2 text-[11px] ${t.textMuted}`}>
                  Fills Client ID, name, approval date, and ALJ below — all
                  editable.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lblCls}>Client ID *</label>
                  <input
                    type="number"
                    value={form.clientId}
                    onChange={(e) => { set("clientId", e.target.value); setClientIdStatus("idle"); setDuplicateName(null); }}
                    onBlur={(e) => checkClientId(e.target.value)}
                    placeholder="MyCase ID"
                    className={`${inputCls} ${clientIdStatus === "duplicate" ? "border-red-500 dark:border-red-600" : ""}`}
                  />
                  {clientIdStatus === "checking" && (
                    <p className={`mt-1 text-[11px] flex items-center gap-1 ${t.textMuted}`}>
                      <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" />
                      Checking…
                    </p>
                  )}
                  {clientIdStatus === "duplicate" && (
                    <p className="mt-1 text-[11px] text-red-600 dark:text-red-400 flex items-center gap-1" role="alert">
                      <AlertCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
                      Already exists: {duplicateName}
                    </p>
                  )}
                </div>
                <div>
                  <label className={lblCls}>First Name *</label>
                  <input
                    value={form.firstName}
                    onChange={(e) => set("firstName", e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={lblCls}>Last Name *</label>
                  <input
                    value={form.lastName}
                    onChange={(e) => set("lastName", e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={lblCls}>ALJ First Name</label>
                  <input
                    value={form.aljFirstName}
                    onChange={(e) => set("aljFirstName", e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={lblCls}>ALJ Last Name</label>
                  <input
                    value={form.aljLastName}
                    onChange={(e) => set("aljLastName", e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={lblCls}>Claim Type</label>
                  <select
                    value={form.claimTypeLabel}
                    onChange={(e) => set("claimTypeLabel", e.target.value)}
                    className={`${inputCls} cursor-pointer`}
                  >
                    <option value="">—</option>
                    {claimTypes.map((o) => (
                      <option key={o.id} value={o.name}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={lblCls}>Case Level</label>
                  <select
                    value={form.levelWon}
                    onChange={(e) => set("levelWon", e.target.value)}
                    className={`${inputCls} cursor-pointer`}
                  >
                    <option value="">—</option>
                    {levels.map((o) => (
                      <option key={o.id} value={o.name}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={lblCls}>Approval Date</label>
                  <input
                    type="date"
                    value={form.approvalDate}
                    onChange={(e) => set("approvalDate", e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={lblCls}>Assigned To</label>
                  <select
                    value={form.assignedTo}
                    onChange={(e) => set("assignedTo", e.target.value)}
                    className={`${inputCls} cursor-pointer`}
                  >
                    <option value="">—</option>
                    {assignees.map((o) => (
                      <option key={o.id} value={o.name}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={lblCls}>Win Sheet Status</label>
                  <select
                    value={form.winSheetStatus}
                    onChange={(e) => set("winSheetStatus", e.target.value)}
                    className={`${inputCls} cursor-pointer`}
                  >
                    <option value="">not started</option>
                    {statuses.map((o) => (
                      <option key={o.id} value={o.name}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={lblCls}>Office w/ Jurisdiction</label>
                  <input
                    value={form.officeWithJurisdiction}
                    onChange={(e) =>
                      set("officeWithJurisdiction", e.target.value)
                    }
                    className={inputCls}
                  />
                </div>
              </div>
              <p className={`mt-4 text-[11px] ${t.textMuted}`}>
                Fees and amounts start at zero — edit them from the case row
                after creating it.
              </p>
            </>
          )}
        </div>

        {/* Footer */}
        <div
          className={`flex items-center justify-end gap-2 px-5 py-3 border-t ${t.borderLight}`}
        >
          {done ? (
            <button
              onClick={onClose}
              className={`h-8 px-4 rounded-md text-xs font-semibold ${t.ctaBtn}`}
            >
              Done
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                className={`h-8 px-3 rounded-md border text-xs font-medium ${t.outlineBtn}`}
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={!canSubmit}
                className={`h-8 px-4 rounded-md text-xs font-semibold flex items-center gap-1.5 ${t.ctaBtn} disabled:opacity-50`}
              >
                {busy ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                Create Case
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
