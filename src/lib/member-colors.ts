// Distinct per-person color for the Assigned dropdown — team coloring (see
// team-colors.ts) makes everyone on the same team blend together, which
// defeats the point of scanning a list of individual assignees at a glance.
const PALETTE: { light: string; dark: string }[] = [
  { light: "bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100", dark: "bg-blue-900/20 text-blue-300 border-blue-800/60 hover:bg-blue-900/30" },
  { light: "bg-red-50 text-red-800 border-red-200 hover:bg-red-100", dark: "bg-red-900/20 text-red-300 border-red-800/60 hover:bg-red-900/30" },
  { light: "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100", dark: "bg-emerald-900/20 text-emerald-300 border-emerald-800/60 hover:bg-emerald-900/30" },
  { light: "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100", dark: "bg-amber-900/20 text-amber-300 border-amber-800/60 hover:bg-amber-900/30" },
  { light: "bg-violet-50 text-violet-800 border-violet-200 hover:bg-violet-100", dark: "bg-violet-900/20 text-violet-300 border-violet-800/60 hover:bg-violet-900/30" },
  { light: "bg-pink-50 text-pink-800 border-pink-200 hover:bg-pink-100", dark: "bg-pink-900/20 text-pink-300 border-pink-800/60 hover:bg-pink-900/30" },
  { light: "bg-cyan-50 text-cyan-800 border-cyan-200 hover:bg-cyan-100", dark: "bg-cyan-900/20 text-cyan-300 border-cyan-800/60 hover:bg-cyan-900/30" },
  { light: "bg-orange-50 text-orange-800 border-orange-200 hover:bg-orange-100", dark: "bg-orange-900/20 text-orange-300 border-orange-800/60 hover:bg-orange-900/30" },
  { light: "bg-teal-50 text-teal-800 border-teal-200 hover:bg-teal-100", dark: "bg-teal-900/20 text-teal-300 border-teal-800/60 hover:bg-teal-900/30" },
  { light: "bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-100", dark: "bg-indigo-900/20 text-indigo-300 border-indigo-800/60 hover:bg-indigo-900/30" },
  { light: "bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200 hover:bg-fuchsia-100", dark: "bg-fuchsia-900/20 text-fuchsia-300 border-fuchsia-800/60 hover:bg-fuchsia-900/30" },
  { light: "bg-lime-50 text-lime-800 border-lime-200 hover:bg-lime-100", dark: "bg-lime-900/20 text-lime-300 border-lime-800/60 hover:bg-lime-900/30" },
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Manual overrides for specific people who asked for a particular color
// instead of whatever the hash landed them on.
const OVERRIDES: Record<string, number> = {
  Aurora: PALETTE.findIndex((p) => p.light.includes("bg-pink")),
};

// Deterministic per-name color — the same person always lands on the same
// tint across renders and pages, since it's derived from the name itself
// rather than list position.
export function memberRowTint(name: string, dark: boolean): string {
  const idx = OVERRIDES[name] ?? hashString(name) % PALETTE.length;
  const entry = PALETTE[idx];
  return dark ? entry.dark : entry.light;
}
