import {
  FileText,
  Gavel,
  RotateCcw,
  Receipt,
  Scale,
  Landmark,
  type LucideIcon,
} from "lucide-react";

interface CaseLevelVisual {
  Icon: LucideIcon;
  bg: string;
  fg: string;
}

const VISUALS: Record<
  string,
  { Icon: LucideIcon; light: [string, string]; dark: [string, string] }
> = {
  INITIAL: { Icon: FileText, light: ["#f1f5f9", "#475569"], dark: ["rgba(51,65,85,0.35)", "#94a3b8"] },
  HEARING: { Icon: Gavel, light: ["#ede9fe", "#6d28d9"], dark: ["rgba(76,29,149,0.35)", "#a78bfa"] },
  // Seed data used "RECON"; the live Settings-managed list has since been
  // renamed to "RECONSIDERATION" — keep both so either spelling gets the icon.
  RECON: { Icon: RotateCcw, light: ["#ecfeff", "#0e7490"], dark: ["rgba(22,78,99,0.35)", "#22d3ee"] },
  RECONSIDERATION: { Icon: RotateCcw, light: ["#ecfeff", "#0e7490"], dark: ["rgba(22,78,99,0.35)", "#22d3ee"] },
  "FEE PETITION": { Icon: Receipt, light: ["#ecfdf5", "#047857"], dark: ["rgba(6,78,59,0.35)", "#34d399"] },
  AC: { Icon: Scale, light: ["#eef2ff", "#4338ca"], dark: ["rgba(49,46,129,0.35)", "#818cf8"] },
  "FEDERAL COURT": { Icon: Landmark, light: ["#fffbeb", "#b45309"], dark: ["rgba(120,53,15,0.35)", "#fbbf24"] },
};

// dropdown_options.case_level rows are free-text (admin-managed in Settings),
// so normalize before matching — seed data uses "FEE PETITION" but the list
// could just as easily contain "Fee_Petition" or "fee petition".
export function normalizeCaseLevel(level: string): string {
  return level.trim().toUpperCase().replace(/[_\s]+/g, " ");
}
// Internal alias kept for existing callers in this file
const normalize = normalizeCaseLevel;

// Returns null for anything unrecognized (a level an admin added that isn't
// one of the seeded ones) — callers should render without an icon chip
// rather than guess.
export function caseLevelVisual(
  level: string | null | undefined,
  dark: boolean,
): CaseLevelVisual | null {
  if (!level) return null;
  const v = VISUALS[normalize(level)];
  if (!v) return null;
  const [bg, fg] = dark ? v.dark : v.light;
  return { Icon: v.Icon, bg, fg };
}
