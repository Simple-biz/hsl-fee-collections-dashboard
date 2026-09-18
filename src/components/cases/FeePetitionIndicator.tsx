"use client";

import { Receipt } from "lucide-react";
import { normalizeCaseLevel } from "@/lib/case-level-icons";

const FEE_PETITION_LEVEL = "FEE PETITION";

/**
 * Marks whether a case sits on the Fee Petitions page.
 *
 * Membership used to be the same thing as the case's Level, so the Level cell
 * told you everything. Since migration 0055 the two are independent: a case at
 * Fee Petition level is only listed there once someone clicks "Add to Fee
 * Petitions", and a case that's been added stays listed even if its Level
 * changes. Without a marker that divergence is invisible — the Level filter
 * here and the Fee Petitions page would just quietly report different numbers.
 *
 * Renders nothing for the ordinary case (not added, not at Fee Petition level),
 * so only rows where the question actually arises carry a mark.
 */
export function FeePetitionIndicator({
  inFeePetition,
  level,
  dark,
}: {
  inFeePetition: boolean;
  level: string | null;
  dark: boolean;
}) {
  const isFeePetitionLevel =
    level != null && normalizeCaseLevel(level) === FEE_PETITION_LEVEL;

  if (!inFeePetition && !isFeePetitionLevel) return null;

  const label = inFeePetition
    ? "On the Fee Petitions page"
    : "Fee Petition level — not added to the Fee Petitions page yet";

  return (
    <span
      title={label}
      className={`h-5 w-5 shrink-0 rounded flex items-center justify-center border ${
        inFeePetition
          ? dark
            ? "bg-teal-900/40 border-teal-700 text-teal-300"
            : "bg-teal-50 border-teal-300 text-teal-700"
          : dark
            ? "border-dashed border-neutral-700 text-neutral-600"
            : "border-dashed border-neutral-300 text-neutral-400"
      }`}
    >
      <Receipt aria-hidden="true" className="h-3 w-3" />
      <span className="sr-only">{label}</span>
    </span>
  );
}
