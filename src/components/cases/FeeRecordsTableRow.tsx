"use client";

import {
  RefreshCw,
  ExternalLink,
  Pencil,
  Check,
  Clipboard,
  Loader2,
  X,
  MessageSquare,
} from "lucide-react";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { Listbox } from "@/components/shared/Listbox";
import { FeePaymentPanel } from "@/components/cases/FeePaymentPanel";
import { FeeAmountCell } from "@/components/cases/FeeAmountCell";
import { FeesConfBadge } from "@/components/cases/FeesConfBadge";
import { ClaimTypeBadge } from "@/components/cases/ClaimTypeBadge";
import { WinSheetStatusBadge } from "@/components/cases/WinSheetStatusBadge";
import { CaseStatusBadge } from "@/components/cases/CaseStatusBadge";
import { FeePetitionIndicator } from "@/components/cases/FeePetitionIndicator";
import { buildMyCaseUrl, buildCasewellUrl } from "@/lib/import/case-link";
import { buildListboxOptions } from "@/lib/listbox-options";
import { teamRowTint } from "@/lib/team-colors";
import { memberRowTint } from "@/lib/member-colors";
import { caseLevelVisual } from "@/lib/case-level-icons";
import {
  caseLevelLabel,
  winSheetStatusLabel,
  fmtClaimLong,
  fmtFull,
  fmtDate,
} from "@/lib/formatters";
import type { themeClasses } from "@/lib/theme-classes";
import type { CaseRow, ApprovedByOption } from "@/types";
import type { CaseField, FeeField, DropdownRowKey } from "./fee-records-types";
import type { WinSheetEditState } from "@/hooks/useWinSheetEdit";
import type { FeeAmountEditState } from "@/hooks/useFeeAmountEdit";

type ThemeClasses = ReturnType<typeof themeClasses>;

const currency = (v: number | null) => (
  <span
    className="select-all cursor-text"
    onClick={(e) => e.stopPropagation()}
  >
    {(v ?? 0) > 0 ? fmtFull(v as number) : "—"}
  </span>
);

const pendingDisplay = (v: number) => (v === 0 ? "—" : fmtFull(v));
const dateStr = (d: string | null | undefined) => (d ? fmtDate(d) : "—");

const AGING_COLORS = (cat: string | null, dark: boolean) => {
  if (cat === ">60") return dark ? "text-red-400" : "text-red-600";
  if (cat === "≤60") return dark ? "text-emerald-400" : "text-emerald-600";
  return dark ? "text-neutral-500" : "text-neutral-400";
};

interface TdCssClasses {
  tdBase: string;
  groupBorder: string;
  rowBorder: string;
  rowHover: string;
  checkTd: string;
  tdRefresh: string;
  tdClosedOn: string;
  td1: string;
  td2: string;
  td3: string;
}

interface RowOptions {
  assigned: ApprovedByOption[];
  approvedBy: ApprovedByOption[];
  feesConfirmation: ApprovedByOption[];
  caseLevel: ApprovedByOption[];
  claimType: ApprovedByOption[];
  winSheetStatus: ApprovedByOption[];
  caseStatus: ApprovedByOption[];
}

interface Props {
  c: CaseRow;

  dark: boolean;
  isClosedMode: boolean;
  canSeeLeaderNotes: boolean;
  canFinalize: boolean;
  canEditFeeDue: boolean;
  canEditFees: boolean;
  canEditFeesConf: boolean;
  mode: string;

  isSelected: boolean;
  isRefreshing: boolean;

  collapsedGroups: Set<"caseStatus" | "t16" | "t2" | "aux">;

  feesConfEditId: number | null;
  claimEditId: number | null;
  winSheetStatusEditId: number | null;
  caseStatusEditId: number | null;
  copiedDateId: number | null;

  winSheet: WinSheetEditState;
  feeAmount: FeeAmountEditState;

  onRowClick: () => void;
  onToggleSelection: () => void;
  onRowRefresh: () => void;
  onVarcharChange: (
    target: "case" | "fee",
    field: CaseField | FeeField,
    rowKey: DropdownRowKey,
    label: string,
    value: string,
  ) => void;
  setFeesConfEditId: (id: number | null) => void;
  setClaimEditId: (id: number | null) => void;
  setWinSheetStatusEditId: (id: number | null) => void;
  setCaseStatusEditId: (id: number | null) => void;
  setCopiedDateId: (id: number | null) => void;
  copyDateTimerRef: React.RefObject<ReturnType<typeof setTimeout> | null>;
  cellValue: (key: DropdownRowKey) => string;
  onReopenConfirm: () => void;
  onLeaderNotes: () => void;
  onLogsClick: () => void;
  onT16FeeAdded: (amount: number, receivedDate: string) => void;
  onT16FeeDeleted: (amount: number) => void;
  onT2FeeAdded: (amount: number, receivedDate: string) => void;
  onT2FeeDeleted: (amount: number) => void;
  onAuxFeeAdded: (amount: number, receivedDate: string) => void;
  onAuxFeeDeleted: (amount: number) => void;

  options: RowOptions;
  leaders: { name: string; team: string | null }[];
  t: ThemeClasses;
  tdCls: TdCssClasses;
}

export function FeeRecordsTableRow({
  c,
  dark, isClosedMode, canSeeLeaderNotes, canFinalize,
  canEditFeeDue, canEditFees, canEditFeesConf, mode,
  isSelected, isRefreshing,
  collapsedGroups,
  feesConfEditId, claimEditId, winSheetStatusEditId, caseStatusEditId, copiedDateId,
  winSheet, feeAmount,
  onRowClick, onToggleSelection, onRowRefresh, onVarcharChange,
  setFeesConfEditId, setClaimEditId, setWinSheetStatusEditId, setCaseStatusEditId, setCopiedDateId,
  copyDateTimerRef, cellValue,
  onReopenConfirm, onLeaderNotes, onLogsClick,
  onT16FeeAdded, onT16FeeDeleted, onT2FeeAdded, onT2FeeDeleted, onAuxFeeAdded, onAuxFeeDeleted,
  options, leaders, t, tdCls,
}: Props) {
  const { tdBase, groupBorder } = tdCls;
  const {
    feeAmountEdit, setFeeAmountEdit, feeAmountSaving, feeAmountError, setFeeAmountError, handleFeeAmountSave,
  } = feeAmount;
  const {
    winSheetEditing, setWinSheetEditing, winSheetDraft, setWinSheetDraft,
    winSheetSaving, winSheetError, setWinSheetError, handleWinSheetSave,
  } = winSheet;

  const isOverpaid = c.markedOverpaid;

  return (
    <tr
      onClick={onRowClick}
      className={`border-b ${tdCls.rowBorder} ${tdCls.rowHover} transition-colors cursor-pointer group ${isOverpaid ? "border-l-2 border-l-amber-500" : ""}`}
    >
      {/* Checkbox */}
      <td
        className={`${tdCls.checkTd} px-3 text-center`}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelection}
          aria-label={`Select ${c.name}`}
          className="h-3.5 w-3.5 cursor-pointer accent-indigo-500"
        />
      </td>

      {/* Refresh */}
      <td
        className={`${tdBase} text-center ${tdCls.tdRefresh}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onRowRefresh}
          disabled={isRefreshing}
          aria-label={`Refresh ${c.name}`}
          title="Refresh this case's fee data from the server"
          className={`inline-flex items-center justify-center h-6 w-6 rounded ${t.hover} ${t.textSub} disabled:opacity-50`}
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
        </button>
      </td>

      {/* Closed On — frozen, closed mode only */}
      {isClosedMode && (
        <td className={`${tdBase} ${t.textSub} ${tdCls.tdClosedOn}`}>
          {dateStr(c.closedAt ? c.closedAt.slice(0, 10) : null)}
        </td>
      )}

      {/* Case Name */}
      <td className={`${tdBase} ${tdCls.td1}`} title={c.name}>
        <div className="flex flex-col gap-0.5 overflow-hidden">
          <a
            href={c.externalId || buildMyCaseUrl(c.id)}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={`inline-flex items-center gap-1 max-w-full ${t.text} font-semibold hover:underline`}
          >
            <span className="truncate">{c.name}</span>
            <ExternalLink
              className="h-3 w-3 shrink-0 opacity-50"
              aria-hidden="true"
            />
          </a>
          <div className="flex items-center gap-2 text-[13px] leading-none min-w-0">
            {(() => {
              const claim = cellValue("claim");
              return claim && claim !== "—" ? (
                <span className={`${t.textMuted} truncate`}>
                  {fmtClaimLong(claim)}
                </span>
              ) : null;
            })()}
            {c.winSheetLink && (
              <a
                href={c.winSheetLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className={`inline-flex items-center gap-0.5 hover:underline shrink-0 ${dark ? "text-blue-400" : "text-blue-600"}`}
              >
                Win Sheet
                <ExternalLink
                  className="h-2.5 w-2.5"
                  aria-hidden="true"
                />
              </a>
            )}
            {c.casewellId && (
              <a
                href={buildCasewellUrl(c.casewellId)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className={`inline-flex items-center gap-0.5 hover:underline shrink-0 ${dark ? "text-violet-400" : "text-violet-600"}`}
              >
                Casewell
                <ExternalLink
                  className="h-2.5 w-2.5"
                  aria-hidden="true"
                />
              </a>
            )}
          </div>
        </div>
      </td>

      {/* Assigned */}
      <td
        className={`${tdBase} ${t.textSub} ${tdCls.td2}`}
        onClick={(e) => e.stopPropagation()}
      >
        <Listbox
          value={cellValue("assigned")}
          onChange={(v) =>
            onVarcharChange("fee", "assignedTo", "assigned", "Assigned To", v)
          }
          dark={dark}
          t={t}
          aria-label="Assigned To"
          className="w-full"
          title={
            options.assigned.length === 0
              ? "No options configured — add them in Settings"
              : undefined
          }
          options={buildListboxOptions(
            options.assigned,
            cellValue("assigned"),
            undefined,
            (name) => memberRowTint(name, dark),
          )}
        />
      </td>

      {/* PIF / Fees Confirmation — frozen */}
      <td
        className={`${tdBase} ${t.textSub} ${tdCls.td3}`}
        onClick={(e) => e.stopPropagation()}
      >
        {canEditFeesConf && feesConfEditId === c.id ? (
          <select
            autoFocus
            value={cellValue("feesConfirmation")}
            onClick={(e) => e.stopPropagation()}
            onBlur={() => setFeesConfEditId(null)}
            onChange={(e) => {
              onVarcharChange("fee", "feesConfirmation", "feesConfirmation", "PIF", e.target.value);
              setFeesConfEditId(null);
            }}
            className={`w-full h-7 px-2 rounded-md border text-[13px] outline-none cursor-pointer ${t.inputBg}`}
            title={
              options.feesConfirmation.length === 0
                ? "No options configured — add them in Settings"
                : undefined
            }
          >
            <option value="">— Select —</option>
            {(() => {
              const v = cellValue("feesConfirmation");
              return (
                v &&
                !options.feesConfirmation.some((o) => o.name === v) && (
                  <option value={v}>{v}</option>
                )
              );
            })()}
            {options.feesConfirmation
              .filter((o) => o.isActive || o.name === cellValue("feesConfirmation"))
              .map((o) => (
                <option key={o.id} value={o.name}>
                  {o.name}
                </option>
              ))}
          </select>
        ) : canEditFeesConf ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setFeesConfEditId(c.id); }}
            className="cursor-pointer"
          >
            <FeesConfBadge value={cellValue("feesConfirmation")} dark={dark} />
          </button>
        ) : (
          <FeesConfBadge value={cellValue("feesConfirmation")} dark={dark} />
        )}
      </td>

      {/* Case Status group */}
      {collapsedGroups.has("caseStatus") ? (
        <td aria-hidden="true" className={`${tdBase} ${groupBorder}`} />
      ) : (
        <>
          {/* Reopen checkbox — closed mode only */}
          {isClosedMode && (
            <td
              className={`${tdBase} text-center ${groupBorder}`}
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="checkbox"
                checked
                className={`h-4 w-4 ${canFinalize ? "cursor-pointer" : "cursor-default opacity-60"}`}
                aria-label="Reopen case — move back to active dashboard"
                disabled={!canFinalize}
                onChange={onReopenConfirm}
              />
            </td>
          )}

          {/* Level */}
          <td
            className={`${tdBase} ${isClosedMode ? "" : groupBorder}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-1.5">
              <Listbox
                value={cellValue("level")}
                onChange={(v) =>
                  onVarcharChange("case", "levelWon", "level", "Case Level", v)
                }
                dark={dark}
                t={t}
                aria-label="Case Level"
                title={
                  options.caseLevel.length === 0
                    ? "No options configured — add them in Settings"
                    : undefined
                }
                options={buildListboxOptions(
                  options.caseLevel,
                  cellValue("level"),
                  (name) => {
                    const visual = caseLevelVisual(name, dark);
                    return visual
                      ? { icon: visual.Icon, iconBg: visual.bg, iconFg: visual.fg }
                      : undefined;
                  },
                  undefined,
                  caseLevelLabel,
                )}
              />
              <FeePetitionIndicator
                inFeePetition={c.inFeePetition}
                level={cellValue("level") || null}
                dark={dark}
              />
            </div>
          </td>

          {/* Claim */}
          <td
            className={`${tdBase}`}
            onClick={(e) => e.stopPropagation()}
          >
            {claimEditId === c.id ? (
              <select
                autoFocus
                value={cellValue("claim")}
                onClick={(e) => e.stopPropagation()}
                onBlur={() => setClaimEditId(null)}
                onChange={(e) => {
                  onVarcharChange("case", "claimTypeLabel", "claim", "Claim Type", e.target.value);
                  setClaimEditId(null);
                }}
                className={`h-7 px-2 rounded-md border text-[13px] outline-none cursor-pointer ${t.inputBg}`}
                title={
                  options.claimType.length === 0
                    ? "No options configured — add them in Settings"
                    : undefined
                }
              >
                <option value="">— Select —</option>
                {(() => {
                  const v = cellValue("claim");
                  return (
                    v &&
                    !options.claimType.some((o) => o.name === v) && (
                      <option value={v}>{v}</option>
                    )
                  );
                })()}
                {options.claimType
                  .filter((o) => o.isActive || o.name === cellValue("claim"))
                  .map((o) => (
                    <option key={o.id} value={o.name}>
                      {o.name}
                    </option>
                  ))}
              </select>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); setClaimEditId(c.id); }}
                className="rounded focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
                aria-label={`Edit claim type: ${cellValue("claim") || "not set"}`}
              >
                <ClaimTypeBadge value={cellValue("claim")} dark={dark} />
              </button>
            )}
          </td>

          {/* Approval date */}
          <td
            className={`${tdBase} ${t.textSub} tabular-nums`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-1">
              <span>{dateStr(c.date)}</span>
              {c.date && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(dateStr(c.date)).then(() => {
                      setCopiedDateId(c.id);
                      if (copyDateTimerRef.current) clearTimeout(copyDateTimerRef.current);
                      copyDateTimerRef.current = setTimeout(() => setCopiedDateId(null), 1500);
                    });
                  }}
                  aria-label="Copy approval date"
                  className={`opacity-0 group-hover:opacity-100 transition-colors shrink-0 p-0.5 rounded ${t.hover}`}
                >
                  {copiedDateId === c.id
                    ? <Check className="h-3 w-3 text-emerald-500" aria-hidden="true" />
                    : <Clipboard className={`h-3 w-3 ${t.textMuted}`} aria-hidden="true" />
                  }
                </button>
              )}
            </div>
          </td>

          {/* Win Sheet Status */}
          <td
            className={`${tdBase}`}
            onClick={(e) => e.stopPropagation()}
          >
            {winSheetStatusEditId === c.id ? (
              <select
                autoFocus
                value={cellValue("status")}
                onClick={(e) => e.stopPropagation()}
                onBlur={() => setWinSheetStatusEditId(null)}
                onChange={(e) => {
                  onVarcharChange("fee", "winSheetStatus", "status", "Win Sheet Status", e.target.value);
                  setWinSheetStatusEditId(null);
                }}
                className={`h-7 px-2 rounded-md border text-[13px] outline-none cursor-pointer ${t.inputBg}`}
                title={
                  options.winSheetStatus.length === 0
                    ? "No options configured — add them in Settings"
                    : undefined
                }
              >
                {buildListboxOptions(
                  options.winSheetStatus,
                  cellValue("status"),
                  undefined,
                  undefined,
                  winSheetStatusLabel,
                ).map((o) => (
                  <option key={o.value || "__none__"} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); setWinSheetStatusEditId(c.id); }}
                className="rounded focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
                aria-label={`Edit Win Sheet Status: ${winSheetStatusLabel(cellValue("status")) || "not set"}`}
              >
                <WinSheetStatusBadge value={cellValue("status")} dark={dark} />
              </button>
            )}
          </td>

          {/* Win Sheet Link */}
          <td
            className={`${tdBase}`}
            onClick={(e) => e.stopPropagation()}
          >
            {winSheetEditing === c.id ? (
              <div
                className="flex flex-col gap-1 min-w-[200px]"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="url"
                  placeholder="https://..."
                  value={winSheetDraft.url}
                  autoFocus
                  onChange={(e) =>
                    setWinSheetDraft((d) => ({ ...d, url: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleWinSheetSave(c);
                    if (e.key === "Escape") setWinSheetEditing(null);
                  }}
                  className={`h-6 px-2 rounded border text-[13px] outline-none w-full ${t.inputBg}`}
                />
                <input
                  type="text"
                  placeholder="Display text (optional)"
                  value={winSheetDraft.text}
                  onChange={(e) =>
                    setWinSheetDraft((d) => ({ ...d, text: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleWinSheetSave(c);
                    if (e.key === "Escape") setWinSheetEditing(null);
                  }}
                  className={`h-6 px-2 rounded border text-[13px] outline-none w-full ${t.inputBg}`}
                />
                {winSheetError && (
                  <p role="alert" className="text-[12px] text-red-500">
                    {winSheetError}
                  </p>
                )}
                <div className="flex gap-1 justify-end">
                  {winSheetSaving === c.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin self-center" aria-hidden="true" />
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => handleWinSheetSave(c)}
                        className="inline-flex items-center gap-0.5 h-5 px-1.5 rounded text-[12px] font-semibold bg-blue-500 text-white hover:bg-blue-600"
                      >
                        <Check className="h-3 w-3" aria-hidden="true" />
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => { setWinSheetEditing(null); setWinSheetError(null); }}
                        className={`inline-flex items-center gap-0.5 h-5 px-1.5 rounded text-[12px] font-semibold border ${t.outlineBtn}`}
                      >
                        <X className="h-3 w-3" aria-hidden="true" />
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                {c.winSheetLink ? (
                  <HoverCard openDelay={150} closeDelay={50}>
                    <HoverCardTrigger asChild>
                      <a
                        href={c.winSheetLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-[13px] font-medium text-blue-500 hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        {c.winSheetLinkText || "Open"}
                      </a>
                    </HoverCardTrigger>
                    <HoverCardContent
                      align="start"
                      collisionPadding={12}
                      className="w-72 p-3 space-y-2 text-[13px]"
                    >
                      <p>
                        <span className="font-semibold">Display text: </span>
                        {c.winSheetLinkText || "Open"}
                      </p>
                      <p className="break-all">
                        <span className="font-semibold">URL: </span>
                        {c.winSheetLink}
                      </p>
                    </HoverCardContent>
                  </HoverCard>
                ) : (
                  <span className={`text-[13px] ${t.textMuted}`}>—</span>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setWinSheetEditing(c.id);
                    setWinSheetDraft({
                      url: c.winSheetLink ?? "",
                      text: c.winSheetLinkText ?? "",
                    });
                  }}
                  className={`opacity-0 group-hover:opacity-100 transition-colors shrink-0 p-0.5 rounded ${t.hover}`}
                  aria-label="Edit win sheet link"
                >
                  <Pencil className={`h-3 w-3 ${t.textMuted}`} aria-hidden="true" />
                </button>
              </div>
            )}
          </td>

          {/* Leader Notes */}
          {canSeeLeaderNotes && (
            <td
              className={`${tdBase} text-center`}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={(e) => { e.stopPropagation(); onLeaderNotes(); }}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[12px] font-semibold ${
                  c.leaderNotesCount > 0
                    ? dark
                      ? "bg-violet-900/40 text-violet-400 hover:bg-violet-900/60"
                      : "bg-violet-50 text-violet-700 hover:bg-violet-100"
                    : dark
                      ? "bg-neutral-800 text-neutral-500 hover:bg-neutral-700"
                      : "bg-neutral-100 text-neutral-400 hover:bg-neutral-200"
                }`}
                title={
                  c.leaderNotesCount > 0
                    ? `View ${c.leaderNotesCount} leader note${c.leaderNotesCount === 1 ? "" : "s"}`
                    : "No leader notes yet"
                }
              >
                <MessageSquare className="h-3 w-3" aria-hidden="true" />
                {c.leaderNotesCount}
              </button>
            </td>
          )}
        </>
      )}

      {/* Approved By */}
      <td
        className={`${tdBase} ${t.textSub} ${groupBorder}`}
        onClick={(e) => e.stopPropagation()}
      >
        {mode === "closed" || !canFinalize ? (
          cellValue("approvedBy") || "—"
        ) : (
          <Listbox
            value={cellValue("approvedBy")}
            onChange={(v) =>
              onVarcharChange("fee", "approvedBy", "approvedBy", "Approved By", v)
            }
            dark={dark}
            t={t}
            aria-label="Approved By"
            title={
              options.approvedBy.length === 0
                ? "No options configured — add them in Settings"
                : undefined
            }
            options={buildListboxOptions(
              options.approvedBy,
              cellValue("approvedBy"),
              undefined,
              (name) => {
                const leader = leaders.find((l) => l.name === name);
                return leader ? teamRowTint(leader.team, dark) : undefined;
              },
            )}
          />
        )}
      </td>

      {/* Remarks */}
      <td
        className={`${tdBase} ${t.textSub}`}
        onClick={(e) => e.stopPropagation()}
      >
        {caseStatusEditId === c.id ? (
          <select
            autoFocus
            value={cellValue("caseStatus")}
            onClick={(e) => e.stopPropagation()}
            onBlur={() => setCaseStatusEditId(null)}
            onChange={(e) => {
              onVarcharChange("fee", "caseStatus", "caseStatus", "Remarks", e.target.value);
              setCaseStatusEditId(null);
            }}
            className={`h-7 px-2 rounded-md border text-[13px] outline-none cursor-pointer ${t.inputBg}`}
            title={
              options.caseStatus.length === 0
                ? "No options configured — add them in Settings"
                : undefined
            }
          >
            <option value="">— Select —</option>
            {(() => {
              const v = cellValue("caseStatus");
              return (
                v &&
                !options.caseStatus.some((o) => o.name === v) && (
                  <option value={v}>{v}</option>
                )
              );
            })()}
            {options.caseStatus
              .filter((o) => o.isActive || o.name === cellValue("caseStatus"))
              .map((o) => (
                <option key={o.id} value={o.name}>
                  {o.name}
                </option>
              ))}
          </select>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); setCaseStatusEditId(c.id); }}
            className="rounded focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
            aria-label={`Edit Remarks: ${cellValue("caseStatus") || "not set"}`}
          >
            <CaseStatusBadge value={cellValue("caseStatus")} dark={dark} />
          </button>
        )}
      </td>

      {/* T16 */}
      {collapsedGroups.has("t16") ? (
        <td
          className={`${tdBase} text-right tabular-nums ${t.textMuted} ${groupBorder}`}
          title="Minimized — expand T16 to edit"
        >
          {currency(c.t16FeeDue)}
        </td>
      ) : (
        <>
          <td
            className={`${tdBase} text-right tabular-nums ${t.text} ${groupBorder}`}
            onClick={canEditFeeDue ? (e) => e.stopPropagation() : undefined}
          >
            <FeeAmountCell
              active={canEditFeeDue && feeAmountEdit?.caseId === c.id && feeAmountEdit.field === "t16Retro"}
              value={c.t16Retro} draft={feeAmountEdit?.draft ?? ""} saving={feeAmountSaving} error={feeAmountError}
              canEdit={canEditFeeDue} saveLabel="T16 retro" inputBg={t.inputBg} hoverCls={t.hover} textMuted={t.textMuted}
              onEdit={() => { setFeeAmountEdit({ caseId: c.id, field: "t16Retro", draft: String(c.t16Retro) }); setFeeAmountError(null); }}
              onDraftChange={(v) => setFeeAmountEdit((p) => p ? { ...p, draft: v } : p)}
              onSave={handleFeeAmountSave}
              onCancel={() => { setFeeAmountEdit(null); setFeeAmountError(null); }}
            />
          </td>
          <td
            className={`${tdBase} text-right tabular-nums ${t.text}`}
            onClick={canEditFeeDue ? (e) => e.stopPropagation() : undefined}
          >
            <FeeAmountCell
              active={canEditFeeDue && feeAmountEdit?.caseId === c.id && feeAmountEdit.field === "t16FeeDue"}
              value={c.t16FeeDue} draft={feeAmountEdit?.draft ?? ""} saving={feeAmountSaving} error={feeAmountError}
              canEdit={canEditFeeDue} saveLabel="T16 fee due" inputBg={t.inputBg} hoverCls={t.hover} textMuted={t.textMuted} allowExplicitZero
              onEdit={() => { setFeeAmountEdit({ caseId: c.id, field: "t16FeeDue", draft: c.t16FeeDue != null ? String(c.t16FeeDue) : "" }); setFeeAmountError(null); }}
              onDraftChange={(v) => setFeeAmountEdit((p) => p ? { ...p, draft: v } : p)}
              onSave={handleFeeAmountSave}
              onCancel={() => { setFeeAmountEdit(null); setFeeAmountError(null); }}
            />
          </td>
          <td
            className={`${tdBase} text-right tabular-nums ${c.t16FeeReceived > 0 ? "text-emerald-500 font-medium" : t.textMuted}`}
          >
            {currency(c.t16FeeReceived)}
          </td>
          <td
            className={`${tdBase} text-right tabular-nums ${c.t16Pending > 0 ? (dark ? "text-amber-400" : "text-amber-600") : c.t16Pending < 0 ? (dark ? "text-red-400" : "text-red-600") : t.textMuted}`}
            title="Auto-calculated: Fee Due − Rec'd"
          >
            {pendingDisplay(c.t16Pending)}
          </td>
        </>
      )}
      <td className={`${tdBase} ${t.textSub}`} onClick={(e) => e.stopPropagation()}>
        <FeePaymentPanel
          caseId={c.id}
          feeType="t16"
          currentTotal={c.t16FeeReceived}
          mostRecentDate={c.t16FeeReceivedDate}
          canEdit={canEditFees}
          dark={dark}
          onAdded={onT16FeeAdded}
          onDeleted={onT16FeeDeleted}
        />
      </td>

      {/* T2 */}
      {collapsedGroups.has("t2") ? (
        <td
          className={`${tdBase} text-right tabular-nums ${t.textMuted} ${groupBorder}`}
          title="Minimized — expand T2 to edit"
        >
          {currency(c.t2FeeDue)}
        </td>
      ) : (
        <>
          <td
            className={`${tdBase} text-right tabular-nums ${t.text} ${groupBorder}`}
            onClick={canEditFeeDue ? (e) => e.stopPropagation() : undefined}
          >
            <FeeAmountCell
              active={canEditFeeDue && feeAmountEdit?.caseId === c.id && feeAmountEdit.field === "t2Retro"}
              value={c.t2Retro} draft={feeAmountEdit?.draft ?? ""} saving={feeAmountSaving} error={feeAmountError}
              canEdit={canEditFeeDue} saveLabel="T2 retro" inputBg={t.inputBg} hoverCls={t.hover} textMuted={t.textMuted}
              onEdit={() => { setFeeAmountEdit({ caseId: c.id, field: "t2Retro", draft: String(c.t2Retro) }); setFeeAmountError(null); }}
              onDraftChange={(v) => setFeeAmountEdit((p) => p ? { ...p, draft: v } : p)}
              onSave={handleFeeAmountSave}
              onCancel={() => { setFeeAmountEdit(null); setFeeAmountError(null); }}
            />
          </td>
          <td
            className={`${tdBase} text-right tabular-nums ${t.text}`}
            onClick={canEditFeeDue ? (e) => e.stopPropagation() : undefined}
          >
            <FeeAmountCell
              active={canEditFeeDue && feeAmountEdit?.caseId === c.id && feeAmountEdit.field === "t2FeeDue"}
              value={c.t2FeeDue} draft={feeAmountEdit?.draft ?? ""} saving={feeAmountSaving} error={feeAmountError}
              canEdit={canEditFeeDue} saveLabel="T2 fee due" inputBg={t.inputBg} hoverCls={t.hover} textMuted={t.textMuted} allowExplicitZero
              onEdit={() => { setFeeAmountEdit({ caseId: c.id, field: "t2FeeDue", draft: c.t2FeeDue != null ? String(c.t2FeeDue) : "" }); setFeeAmountError(null); }}
              onDraftChange={(v) => setFeeAmountEdit((p) => p ? { ...p, draft: v } : p)}
              onSave={handleFeeAmountSave}
              onCancel={() => { setFeeAmountEdit(null); setFeeAmountError(null); }}
            />
          </td>
          <td
            className={`${tdBase} text-right tabular-nums ${c.t2FeeReceived > 0 ? "text-emerald-500 font-medium" : t.textMuted}`}
          >
            {currency(c.t2FeeReceived)}
          </td>
          <td
            className={`${tdBase} text-right tabular-nums ${c.t2Pending > 0 ? (dark ? "text-amber-400" : "text-amber-600") : c.t2Pending < 0 ? (dark ? "text-red-400" : "text-red-600") : t.textMuted}`}
            title="Auto-calculated: Fee Due − Rec'd"
          >
            {pendingDisplay(c.t2Pending)}
          </td>
        </>
      )}
      <td className={`${tdBase} ${t.textSub}`} onClick={(e) => e.stopPropagation()}>
        <FeePaymentPanel
          caseId={c.id}
          feeType="t2"
          currentTotal={c.t2FeeReceived}
          mostRecentDate={c.t2FeeReceivedDate}
          canEdit={canEditFees}
          dark={dark}
          onAdded={onT2FeeAdded}
          onDeleted={onT2FeeDeleted}
        />
      </td>

      {/* AUX */}
      {collapsedGroups.has("aux") ? (
        <td
          className={`${tdBase} text-right tabular-nums ${t.textMuted} ${groupBorder}`}
          title="Minimized — expand AUX to edit"
        >
          {currency(c.auxFeeDue)}
        </td>
      ) : (
        <>
          <td
            className={`${tdBase} text-right tabular-nums ${t.text} ${groupBorder}`}
            onClick={canEditFeeDue ? (e) => e.stopPropagation() : undefined}
          >
            <FeeAmountCell
              active={canEditFeeDue && feeAmountEdit?.caseId === c.id && feeAmountEdit.field === "auxRetro"}
              value={c.auxRetro} draft={feeAmountEdit?.draft ?? ""} saving={feeAmountSaving} error={feeAmountError}
              canEdit={canEditFeeDue} saveLabel="AUX retro" inputBg={t.inputBg} hoverCls={t.hover} textMuted={t.textMuted}
              onEdit={() => { setFeeAmountEdit({ caseId: c.id, field: "auxRetro", draft: String(c.auxRetro) }); setFeeAmountError(null); }}
              onDraftChange={(v) => setFeeAmountEdit((p) => p ? { ...p, draft: v } : p)}
              onSave={handleFeeAmountSave}
              onCancel={() => { setFeeAmountEdit(null); setFeeAmountError(null); }}
            />
          </td>
          <td
            className={`${tdBase} text-right tabular-nums ${t.text}`}
            onClick={canEditFeeDue ? (e) => e.stopPropagation() : undefined}
          >
            <FeeAmountCell
              active={canEditFeeDue && feeAmountEdit?.caseId === c.id && feeAmountEdit.field === "auxFeeDue"}
              value={c.auxFeeDue} draft={feeAmountEdit?.draft ?? ""} saving={feeAmountSaving} error={feeAmountError}
              canEdit={canEditFeeDue} saveLabel="AUX fee due" inputBg={t.inputBg} hoverCls={t.hover} textMuted={t.textMuted} allowExplicitZero
              onEdit={() => { setFeeAmountEdit({ caseId: c.id, field: "auxFeeDue", draft: c.auxFeeDue != null ? String(c.auxFeeDue) : "" }); setFeeAmountError(null); }}
              onDraftChange={(v) => setFeeAmountEdit((p) => p ? { ...p, draft: v } : p)}
              onSave={handleFeeAmountSave}
              onCancel={() => { setFeeAmountEdit(null); setFeeAmountError(null); }}
            />
          </td>
          <td
            className={`${tdBase} text-right tabular-nums ${c.auxFeeReceived > 0 ? "text-emerald-500 font-medium" : t.textMuted}`}
          >
            {currency(c.auxFeeReceived)}
          </td>
          <td
            className={`${tdBase} text-right tabular-nums ${c.auxPending > 0 ? (dark ? "text-amber-400" : "text-amber-600") : c.auxPending < 0 ? (dark ? "text-red-400" : "text-red-600") : t.textMuted}`}
            title="Auto-calculated: Fee Due − Rec'd"
          >
            {pendingDisplay(c.auxPending)}
          </td>
        </>
      )}
      <td className={`${tdBase} ${t.textSub}`} onClick={(e) => e.stopPropagation()}>
        <FeePaymentPanel
          caseId={c.id}
          feeType="aux"
          currentTotal={c.auxFeeReceived}
          mostRecentDate={c.auxFeeReceivedDate}
          canEdit={canEditFees}
          dark={dark}
          onAdded={onAuxFeeAdded}
          onDeleted={onAuxFeeDeleted}
        />
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

      {/* Next Follow-Up */}
      <td
        className={`${tdBase} ${t.textSub} ${groupBorder}`}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="date"
          value={cellValue("nextFollowUpDate")}
          onChange={(e) =>
            onVarcharChange("fee", "nextFollowUpDate", "nextFollowUpDate", "Next Follow-Up", e.target.value)
          }
          aria-label={`Next follow-up call date for ${c.name}`}
          className={`h-7 px-2 rounded-md border text-[13px] outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-600 ${t.inputBg}`}
        />
      </td>

      {/* Update */}
      <td className={`${tdBase} ${t.textSub} max-w-65`}>
        {c.update && c.update !== "—" ? (
          <HoverCard openDelay={150} closeDelay={50}>
            <HoverCardTrigger asChild>
              <span className="block truncate">{c.update}</span>
            </HoverCardTrigger>
            <HoverCardContent
              align="start"
              collisionPadding={12}
              className="w-auto max-w-[min(28rem,90vw)] p-3 text-[14px] leading-relaxed whitespace-pre-wrap wrap-break-word"
            >
              {c.update}
            </HoverCardContent>
          </HoverCard>
        ) : (
          <span className="block truncate">{c.update}</span>
        )}
      </td>

      {/* Log entries */}
      <td className={`${tdBase} text-center`}>
        <button
          onClick={(e) => { e.stopPropagation(); onLogsClick(); }}
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[12px] font-semibold ${
            c.notesCount > 0
              ? dark
                ? "bg-blue-900/40 text-blue-400 hover:bg-blue-900/60"
                : "bg-blue-50 text-blue-700 hover:bg-blue-100"
              : dark
                ? "bg-neutral-800 text-neutral-500 hover:bg-neutral-700"
                : "bg-neutral-100 text-neutral-400 hover:bg-neutral-200"
          }`}
          title={
            c.notesCount > 0
              ? `View ${c.notesCount} log entr${c.notesCount === 1 ? "y" : "ies"}`
              : "No log entries yet"
          }
        >
          <MessageSquare className="h-3 w-3" aria-hidden="true" />
          {c.notesCount}
        </button>
      </td>

      {/* Days after approval — active mode only */}
      {!isClosedMode && (
        <td
          className={`${tdBase} text-right tabular-nums font-medium ${AGING_COLORS(c.approvalCategory, dark)}`}
        >
          {c.daysAfterApproval !== null ? (
            <span>
              {c.daysAfterApproval}d{" "}
              <span className="text-[11px] opacity-70">
                {c.approvalCategory}
              </span>
            </span>
          ) : (
            "—"
          )}
        </td>
      )}
    </tr>
  );
}
