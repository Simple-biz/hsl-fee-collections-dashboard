// ============================================================================
// CASE LINK parsing — shared, dependency-free helpers.
//
// The MASTER FEES WORKSHEET stores each case in a single "CASE LINK" cell as
// display text plus a hyperlink to MyCase, e.g.:
//
//   text:  "2026.05.22 Watson, Katrina v. ALJ WENDY HOLLINGSWORTH"
//   link:  https://hogansmith.mycase.com/court_cases/12345678
//
// These pure functions parse that convention. No `xlsx`/Node imports, so this
// module is safe to use from client components (e.g. AddCaseModal) as well as
// the server-side import mappers. The xlsx/sheets mappers keep their own copies
// for now; this is the canonical version for new code.
// ============================================================================

export const MYCASE_URL_RE = /mycase\.com\/court_cases\/(\d+)/i;

/** Pull the numeric MyCase id out of a court_cases URL, or null. */
export const extractMyCaseId = (url: string | null | undefined): number | null => {
  if (!url) return null;
  const m = url.match(MYCASE_URL_RE);
  return m ? Number(m[1]) : null;
};

// Chronicle client URLs look like
//   https://app.chroniclelegal.com/dashboard/clients/12345
// The path segment before /clients/ can vary, so allow any prefix.
export const CHRONICLE_URL_RE = /chroniclelegal\.com\/(?:[^/]+\/)*clients\/(\d+)/i;

/**
 * Pull the numeric Chronicle client id from a Chronicle URL, or null.
 * Also accepts a bare numeric id (the user may paste just the number).
 */
export const extractChronicleId = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const m = trimmed.match(CHRONICLE_URL_RE);
  return m ? Number(m[1]) : null;
};

/** Parse a leading "YYYY.MM.DD" (also accepts - or /) into ISO YYYY-MM-DD. */
export const parseLeadingDate = (text: string): string | null => {
  const m = text.trim().match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})\b/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
};

// Strip one or more trailing annotation groups — e.g. " (SSI case)",
// " [VIA PHONE]", or both stacked: "Detherage (Remand) [PHONE]".
const stripTrailingAnnotations = (s: string): string => {
  let prev: string;
  do {
    prev = s;
    s = s.replace(/\s*[([][^)\]]*[)\]]\s*$/, "").trim();
  } while (s !== prev);
  return s;
};

export interface ParsedCaseLink {
  /** ISO date pulled from the leading "YYYY.MM.DD", or null. */
  approvalDate: string | null;
  firstName: string;
  lastName: string;
  aljFirstName: string | null;
  aljLastName: string | null;
  /** True when no "v"/"vs" separator was found — ALJ data wasn't captured. */
  missingVSeparator: boolean;
}

/**
 * Parse "YYYY.MM.DD Lastname, Firstname v. ALJ NAME (annotations)".
 * The separator is forgiving: "v.", "vs", "vs.", or a bare "v", case-insensitive.
 * The left side may be "Last, First" or "First Last"; trailing "(...)"/"[...]"
 * notes are dropped. Returns empty strings for parts it can't find.
 */
export const parseCaseLink = (link: string): ParsedCaseLink => {
  const approvalDate = parseLeadingDate(link);

  let s = link.trim();
  // Strip leading date "YYYY.MM.DD ".
  s = s.replace(/^\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}\s+/, "");

  // Split on the claimant-vs-respondent separator.
  const parts = s.split(/\s+vs?(?:[.,]\s*|\s+)/i);
  const left = parts[0] || "";
  const right = parts[1] || "";

  // Left: "Lastname, Firstname" — or "Firstname Lastname" when no comma.
  const leftClean = stripTrailingAnnotations(left);
  let lastRaw: string, firstRaw: string;
  if (leftClean.includes(",")) {
    [lastRaw, firstRaw] = leftClean.split(/,\s*/);
  } else {
    const tokens = leftClean.split(/\s+/);
    lastRaw = tokens[0] ?? leftClean;
    firstRaw = tokens.slice(1).join(" ");
  }
  const lastName = (lastRaw || leftClean).trim();
  const firstName = (firstRaw || "").trim();

  // Right: "ALJ FIRST LAST" — strip "ALJ " prefix, then split into first/last.
  let aljFirstName: string | null = null;
  let aljLastName: string | null = null;
  const aljClean = stripTrailingAnnotations(right.replace(/^ALJ\s+/i, ""));
  if (aljClean && !/^SSA$/i.test(aljClean)) {
    const tokens = aljClean.split(/\s+/);
    if (tokens.length >= 2) {
      aljFirstName = tokens[0];
      aljLastName = tokens.slice(1).join(" ");
    } else {
      aljLastName = tokens[0] ?? null;
    }
  }

  return {
    approvalDate,
    firstName,
    lastName,
    aljFirstName,
    aljLastName,
    missingVSeparator: parts.length === 1,
  };
};
