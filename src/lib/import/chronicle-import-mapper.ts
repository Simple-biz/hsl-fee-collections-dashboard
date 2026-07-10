// Pure transform helpers for /api/chronicle/import — split out so the
// decision/level/claim-type logic is unit-testable without a DB.

export type DecisionOutcome =
  | "fully_favorable"
  | "unfavorable"
  | "dismissed"
  | "unknown"
  | null;

// "unfavorable" contains "favorable" as a substring, so it must be checked
// FIRST — checking "favorable" first would match every "unfavorable" string
// too and misclassify it as fully favorable.
export const resolveDecisionOutcome = (
  decision: string | null | undefined,
): DecisionOutcome => {
  const d = decision?.toLowerCase();
  if (d?.includes("unfavorable")) return "unfavorable";
  if (d?.includes("favorable")) return "fully_favorable";
  if (d?.includes("dismissal")) return "dismissed";
  return decision ? "unknown" : null;
};

const KNOWN_LEVELS = ["INITIAL", "RECON", "HEARING", "AC"];

// Falls back to "HEARING" for any level this app doesn't have a bucket for
// (e.g. Chronicle's "FEDERAL_COURT") rather than rejecting the import.
export const resolveLevelWon = (caseLevel: string): string =>
  KNOWN_LEVELS.includes(caseLevel) ? caseLevel : "HEARING";

export const buildClaimTypeArray = (
  claimType: "T2" | "T16" | "T2_T16",
): string[] => (claimType === "T2_T16" ? ["T2", "T16"] : [claimType]);

// Names of the pdfFields entries that actually carry a value — used only for
// the "N PDF fields imported" note on the activity log entry.
export const countPdfFields = (
  pdfFields: Record<string, unknown> | null | undefined,
): string[] =>
  pdfFields
    ? Object.entries(pdfFields)
        .filter(([, v]) => v != null)
        .map(([k]) => k)
    : [];
