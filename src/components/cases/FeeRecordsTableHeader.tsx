"use client";

import { RefreshCw, Maximize2, Minimize2, ArrowUpDown } from "lucide-react";
import type { themeClasses } from "@/lib/theme-classes";
import type { SortKey } from "./fee-records-types";

type ThemeClasses = ReturnType<typeof themeClasses>;

type CollapsibleGroup = "caseStatus" | "t16" | "t2" | "aux";

interface CssClasses {
  thBase: string;
  groupBorder: string;
  checkTh: string;
  thRefresh: string;
  groupClosedOn: string;
  group: string;
  group2: string;
  group3: string;
  thRow1: string;
  thClosedOn: string;
  th1: string;
  th2: string;
  th3: string;
}

interface Props {
  dark: boolean;
  isClosedMode: boolean;
  canSeeLeaderNotes: boolean;
  collapsedGroups: Set<CollapsibleGroup>;
  selectAllRef: React.RefObject<HTMLInputElement | null>;
  toggleSelectAll: () => void;
  toggleGroupCollapse: (group: CollapsibleGroup) => void;
  toggleSort: (key: SortKey) => void;
  ariaSortFor: (key: SortKey) => "ascending" | "descending" | "none";
  t: ThemeClasses;
  cls: CssClasses;
}

export function FeeRecordsTableHeader({
  dark,
  isClosedMode,
  canSeeLeaderNotes,
  collapsedGroups,
  selectAllRef,
  toggleSelectAll,
  toggleGroupCollapse,
  toggleSort,
  ariaSortFor,
  t,
  cls,
}: Props) {
  const { thBase, groupBorder } = cls;

  return (
    <thead>
      <tr className={`border-b ${t.borderLight}`}>
        {/* Select-all checkbox spans both header rows */}
        <th rowSpan={2} className={`${cls.checkTh} px-3 text-center`}>
          <input
            ref={selectAllRef}
            type="checkbox"
            onChange={toggleSelectAll}
            aria-label="Select all rows"
            className="h-3.5 w-3.5 cursor-pointer accent-indigo-500"
          />
        </th>
        {/* Refresh — moved to the front (frozen), before Case Name, so
            it's usable without scrolling right. Spans both header
            rows like the checkbox, since it has no group label.
            Icon-only (like the checkbox column) — the column is too
            narrow at this frozen width for the word "Refresh" to fit
            without colliding with "Case Info" next to it. */}
        <th rowSpan={2} className={cls.thRefresh} title="Refresh">
          <RefreshCw className="h-3.5 w-3.5 inline" aria-hidden="true" />
          <span className="sr-only">Refresh</span>
        </th>
        {/* Closed On sits in front of Case Info's group, "closed" mode
            only — same blank-spacer pattern as the Assigned/Fees Conf
            cells below, just with nothing to label. */}
        {isClosedMode && (
          <th
            aria-hidden="true"
            className={`${thBase} ${t.textSub} text-left ${cls.groupClosedOn}`}
          />
        )}
        {/* "Case Info" label is split per column so each part's freeze
          matches the column below it: the label cell over Case Name
          freezes on all screens; the blank cell over Assigned freezes
          only at sm+. Then a scrolling 4-col spacer covers Level /
          Claim / Approval / Status. */}
        <th className={`${thBase} ${t.textSub} text-left ${cls.group}`}>
          Case Info
        </th>
        <th aria-hidden="true" className={`${thBase} ${t.textSub} text-left ${cls.group2}`} />
        <th aria-hidden="true" className={`${thBase} ${t.textSub} text-left ${cls.group3}`} />
        <th
          colSpan={
            collapsedGroups.has("caseStatus")
              ? 1
              : (isClosedMode ? 6 : 5) + (canSeeLeaderNotes ? 1 : 0)
          }
          className={`${thBase} text-center ${groupBorder} ${cls.thRow1} ${dark ? "text-teal-400" : "text-teal-600"}`}
        >
          <button
            type="button"
            onClick={() => toggleGroupCollapse("caseStatus")}
            className="inline-flex items-center gap-1 cursor-pointer"
            aria-label={collapsedGroups.has("caseStatus") ? "Expand Case Status columns" : "Minimize Case Status columns"}
            title={collapsedGroups.has("caseStatus") ? "Expand Case Status columns" : "Minimize Case Status columns"}
          >
            Case Status
            {collapsedGroups.has("caseStatus")
              ? <Maximize2 className="h-3 w-3" aria-hidden="true" />
              : <Minimize2 className="h-3 w-3" aria-hidden="true" />}
          </button>
        </th>
        <th
          colSpan={2}
          aria-hidden="true"
          className={`${thBase} ${t.textSub} text-left ${cls.thRow1}`}
        />

        <th
          colSpan={collapsedGroups.has("t16") ? 2 : 5}
          className={`${thBase} text-center ${groupBorder} ${cls.thRow1} ${dark ? "text-indigo-400" : "text-indigo-600"}`}
        >
          <button
            type="button"
            onClick={() => toggleGroupCollapse("t16")}
            className="inline-flex items-center gap-1 cursor-pointer"
            aria-label={collapsedGroups.has("t16") ? "Expand T16 columns" : "Minimize T16 columns"}
            title={collapsedGroups.has("t16") ? "Expand T16 columns" : "Minimize T16 columns"}
          >
            T16
            {collapsedGroups.has("t16")
              ? <Maximize2 className="h-3 w-3" aria-hidden="true" />
              : <Minimize2 className="h-3 w-3" aria-hidden="true" />}
          </button>
        </th>
        <th
          colSpan={collapsedGroups.has("t2") ? 2 : 5}
          className={`${thBase} text-center ${groupBorder} ${cls.thRow1} ${dark ? "text-blue-400" : "text-blue-600"}`}
        >
          <button
            type="button"
            onClick={() => toggleGroupCollapse("t2")}
            className="inline-flex items-center gap-1 cursor-pointer"
            aria-label={collapsedGroups.has("t2") ? "Expand T2 columns" : "Minimize T2 columns"}
            title={collapsedGroups.has("t2") ? "Expand T2 columns" : "Minimize T2 columns"}
          >
            T2
            {collapsedGroups.has("t2")
              ? <Maximize2 className="h-3 w-3" aria-hidden="true" />
              : <Minimize2 className="h-3 w-3" aria-hidden="true" />}
          </button>
        </th>
        <th
          colSpan={collapsedGroups.has("aux") ? 2 : 5}
          className={`${thBase} text-center ${groupBorder} ${cls.thRow1} ${dark ? "text-violet-400" : "text-violet-600"}`}
        >
          <button
            type="button"
            onClick={() => toggleGroupCollapse("aux")}
            className="inline-flex items-center gap-1 cursor-pointer"
            aria-label={collapsedGroups.has("aux") ? "Expand AUX columns" : "Minimize AUX columns"}
            title={collapsedGroups.has("aux") ? "Expand AUX columns" : "Minimize AUX columns"}
          >
            AUX
            {collapsedGroups.has("aux")
              ? <Maximize2 className="h-3 w-3" aria-hidden="true" />
              : <Minimize2 className="h-3 w-3" aria-hidden="true" />}
          </button>
        </th>
        <th
          colSpan={3}
          className={`${thBase} text-center ${groupBorder} ${cls.thRow1} ${t.textSub}`}
        >
          Totals
        </th>
        <th
          colSpan={isClosedMode ? 3 : 4}
          className={`${thBase} text-center ${groupBorder} ${cls.thRow1} ${t.textSub}`}
        >
          Workflow
        </th>
      </tr>
      {/* Column headers */}
      <tr className={`border-b ${t.borderLight}`}>
        {isClosedMode && (
          <th
            aria-sort={ariaSortFor("closedAt")}
            className={`${thBase} ${t.textSub} text-left ${cls.thClosedOn}`}
          >
            <button
              type="button"
              onClick={() => toggleSort("closedAt")}
              className="inline-flex items-center gap-1 cursor-pointer rounded-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-neutral-300 dark:focus:ring-neutral-600"
            >
              Closed On <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
            </button>
          </th>
        )}
        <th
          aria-sort={ariaSortFor("name")}
          className={`${thBase} ${t.textSub} text-left ${cls.th1}`}
        >
          <button
            type="button"
            onClick={() => toggleSort("name")}
            className="inline-flex items-center gap-1 cursor-pointer rounded-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-neutral-300 dark:focus:ring-neutral-600"
          >
            Case Name <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
          </button>
        </th>
        <th
          aria-sort={ariaSortFor("assigned")}
          className={`${thBase} ${t.textSub} text-left ${cls.th2}`}
        >
          <button
            type="button"
            onClick={() => toggleSort("assigned")}
            title="Sort to group rows by assignee"
            className="inline-flex items-center gap-1 cursor-pointer rounded-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-neutral-300 dark:focus:ring-neutral-600"
          >
            Assigned <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
          </button>
        </th>
        <th className={`${thBase} ${t.textSub} text-left ${cls.th3}`}>
          PIF
        </th>
        {/* Case Status group — Level/Claim/Approval/Win Sheet Status/
            Win Sheet/Leader Notes (+ Fees Closed reopen on the Fees
            Closed page); collapses to one blank header cell. */}
        {collapsedGroups.has("caseStatus") ? (
          <th aria-hidden="true" className={`${thBase} ${groupBorder}`} />
        ) : (
          <>
            {isClosedMode && (
              <th className={`${thBase} ${t.textSub} text-left ${groupBorder}`}>Fees Closed</th>
            )}
            <th className={`${thBase} ${t.textSub} text-left ${isClosedMode ? "" : groupBorder}`}>Level</th>
            <th className={`${thBase} ${t.textSub} text-left`}>Claim</th>
            <th
              aria-sort={ariaSortFor("date")}
              className={`${thBase} ${t.textSub} text-left`}
            >
              <button
                type="button"
                onClick={() => toggleSort("date")}
                className="inline-flex items-center gap-1 cursor-pointer rounded-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-neutral-300 dark:focus:ring-neutral-600"
              >
                Approval <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
              </button>
            </th>
            <th className={`${thBase} ${t.textSub} text-left`}>Win Sheet Status</th>
            <th className={`${thBase} ${t.textSub} text-left`}>
              Win Sheet
            </th>
            {canSeeLeaderNotes && (
              <th className={`${thBase} ${t.textSub} text-center`}>Leader Notes</th>
            )}
          </>
        )}
        <th className={`${thBase} ${t.textSub} text-left ${groupBorder}`}>
          Approved By
        </th>
        <th className={`${thBase} ${t.textSub} text-left`}>
          Remarks
        </th>
        {/* T16 */}
        {collapsedGroups.has("t16") ? (
          <th className={`${thBase} ${t.textSub} text-right ${groupBorder}`}>
            Fee Due
          </th>
        ) : (
          <>
            <th className={`${thBase} ${t.textSub} text-right ${groupBorder}`}>
              Retro
            </th>
            <th className={`${thBase} ${t.textSub} text-right`}>Fee Due</th>
            <th className={`${thBase} ${t.textSub} text-right`}>
              Rec&apos;d
            </th>
            <th className={`${thBase} ${t.textSub} text-right`}>Pending</th>
          </>
        )}
        <th className={`${thBase} ${t.textSub} text-left`}>
          Date Rec&apos;d
        </th>

        {/* T2 */}
        {collapsedGroups.has("t2") ? (
          <th className={`${thBase} ${t.textSub} text-right ${groupBorder}`}>
            Fee Due
          </th>
        ) : (
          <>
            <th className={`${thBase} ${t.textSub} text-right ${groupBorder}`}>
              Retro
            </th>
            <th className={`${thBase} ${t.textSub} text-right`}>Fee Due</th>
            <th className={`${thBase} ${t.textSub} text-right`}>
              Rec&apos;d
            </th>
            <th className={`${thBase} ${t.textSub} text-right`}>Pending</th>
          </>
        )}
        <th className={`${thBase} ${t.textSub} text-left`}>
          Date Rec&apos;d
        </th>

        {/* AUX */}
        {collapsedGroups.has("aux") ? (
          <th className={`${thBase} ${t.textSub} text-right ${groupBorder}`}>
            Fee Due
          </th>
        ) : (
          <>
            <th className={`${thBase} ${t.textSub} text-right ${groupBorder}`}>
              Retro
            </th>
            <th className={`${thBase} ${t.textSub} text-right`}>Fee Due</th>
            <th className={`${thBase} ${t.textSub} text-right`}>
              Rec&apos;d
            </th>
            <th className={`${thBase} ${t.textSub} text-right`}>Pending</th>
          </>
        )}
        <th className={`${thBase} ${t.textSub} text-left`}>
          Date Rec&apos;d
        </th>

        {/* Totals */}
        <th className={`${thBase} ${t.textSub} text-right ${groupBorder}`}>
          Retro Due
        </th>
        <th
          aria-sort={ariaSortFor("expected")}
          className={`${thBase} ${t.textSub} text-right`}
        >
          <button
            type="button"
            onClick={() => toggleSort("expected")}
            className="inline-flex items-center justify-end gap-1 w-full cursor-pointer rounded-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-neutral-300 dark:focus:ring-neutral-600"
          >
            Expected <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
          </button>
        </th>
        <th
          aria-sort={ariaSortFor("paid")}
          className={`${thBase} ${t.textSub} text-right`}
        >
          <button
            type="button"
            onClick={() => toggleSort("paid")}
            className="inline-flex items-center justify-end gap-1 w-full cursor-pointer rounded-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-neutral-300 dark:focus:ring-neutral-600"
          >
            Paid <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
          </button>
        </th>

        {/* Workflow */}
        <th
          aria-sort={ariaSortFor("nextFollowUpDate")}
          className={`${thBase} ${t.textSub} text-left ${groupBorder}`}
        >
          <button
            type="button"
            onClick={() => toggleSort("nextFollowUpDate")}
            className="inline-flex items-center gap-1 cursor-pointer rounded-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-neutral-300 dark:focus:ring-neutral-600"
          >
            Next Follow-Up <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
          </button>
        </th>
        <th className={`${thBase} ${t.textSub} text-left`}>
          Recent Update
        </th>
        <th className={`${thBase} ${t.textSub} text-center`}>Logs</th>
        {/* Closed On moved to the front (frozen) in "closed" mode —
            this trailing slot is Active-mode-only now. */}
        {!isClosedMode && (
          <th
            aria-sort={ariaSortFor("daysAfterApproval")}
            className={`${thBase} ${t.textSub} text-right`}
          >
            <button
              type="button"
              onClick={() => toggleSort("daysAfterApproval")}
              className="inline-flex items-center justify-end gap-1 w-full cursor-pointer rounded-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-neutral-300 dark:focus:ring-neutral-600"
            >
              Days
              <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
            </button>
          </th>
        )}
      </tr>
    </thead>
  );
}
