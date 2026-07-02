// Single source of truth for team coloring — Concurrent/green, T2/blue,
// T16/red — so Scoreboard, Reports, and Team Management can't drift out of
// sync with each other the way they previously did (teal vs. purple vs. red
// for the same team across different files).
type Tone = "blue" | "red" | "emerald" | "neutral";

function toneFor(team: string | null | undefined): Tone {
  if (team === "T2") return "blue";
  if (team === "T16") return "red";
  if (team) return "emerald"; // Concurrent (or any future team) reads as the "everyone else" tone
  return "neutral";
}

export function teamLabel(team: string | null | undefined): string {
  if (team === "T2") return "T2 Team";
  if (team === "T16") return "T16 Team";
  return "Concurrent Team";
}

// Solid header bars (Scoreboard team columns).
export function teamHeaderBg(team: string | null | undefined): string {
  switch (toneFor(team)) {
    case "blue": return "bg-blue-800";
    case "red": return "bg-red-700";
    default: return "bg-emerald-700";
  }
}

// Accent text (team card headings).
export function teamAccentText(team: string | null | undefined, dark: boolean): string {
  switch (toneFor(team)) {
    case "blue": return dark ? "text-blue-400" : "text-blue-700";
    case "red": return dark ? "text-red-400" : "text-red-700";
    default: return dark ? "text-emerald-400" : "text-emerald-700";
  }
}

// Tinted card border + background (Scoreboard team breakdown cards).
export function teamCardClasses(team: string | null | undefined, dark: boolean): string {
  switch (toneFor(team)) {
    case "blue": return dark ? "border-blue-700/50 bg-blue-900/10" : "border-blue-200 bg-blue-50/60";
    case "red": return dark ? "border-red-700/50 bg-red-900/10" : "border-red-200 bg-red-50/60";
    default: return dark ? "border-emerald-700/50 bg-emerald-900/10" : "border-emerald-200 bg-emerald-50/60";
  }
}

// Full-row tint (background + text + border + hover) — team leads in the
// Approved By listbox and assignees in the Assigned listbox, so both read at
// a glance by team. The border classes are inert on listbox option rows
// (no `border` width utility there) but matter when this same string is
// applied to a Listbox trigger button, which does have one.
export function teamRowTint(team: string | null | undefined, dark: boolean): string {
  switch (toneFor(team)) {
    case "blue": return dark ? "bg-blue-900/20 text-blue-300 border-blue-800/60 hover:bg-blue-900/30" : "bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100";
    case "red": return dark ? "bg-red-900/20 text-red-300 border-red-800/60 hover:bg-red-900/30" : "bg-red-50 text-red-800 border-red-200 hover:bg-red-100";
    case "emerald": return dark ? "bg-emerald-900/20 text-emerald-300 border-emerald-800/60 hover:bg-emerald-900/30" : "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100";
    default: return dark ? "text-neutral-200 hover:bg-neutral-800" : "text-neutral-700 hover:bg-neutral-50";
  }
}

// Pill badge — agent names in Reports rows and the Team Management roster.
export function teamBadgeClasses(team: string | null | undefined, dark: boolean): string {
  switch (toneFor(team)) {
    case "blue": return dark ? "bg-blue-900/30 text-blue-400 border-blue-800/60" : "bg-blue-50 text-blue-700 border-blue-200";
    case "red": return dark ? "bg-red-900/30 text-red-400 border-red-800/60" : "bg-red-50 text-red-700 border-red-200";
    case "emerald": return dark ? "bg-emerald-900/30 text-emerald-400 border-emerald-800/60" : "bg-emerald-50 text-emerald-700 border-emerald-200";
    default: return dark ? "bg-neutral-800 text-neutral-500 border-neutral-700" : "bg-neutral-100 text-neutral-500 border-neutral-200";
  }
}
