import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const wb = XLSX.readFile("./May 5 MASTER FEES WORKSHEET V2.xlsx", {
  cellDates: true,
});
const ws = wb.Sheets["MASTER LIST"];
const rows = XLSX.utils.sheet_to_json(ws, {
  header: 1,
  defval: null,
  blankrows: false,
});
const header = rows[0];
const data = rows.slice(1);

// 1) Notes length stats
const notesIdx = header.indexOf("COLLECTION NOTES");
const notesLens = data
  .map((r) => (r[notesIdx] ? String(r[notesIdx]).length : 0))
  .filter((n) => n > 0);
notesLens.sort((a, b) => a - b);
const max = notesLens[notesLens.length - 1] ?? 0;
const p50 = notesLens[Math.floor(notesLens.length * 0.5)] ?? 0;
const p95 = notesLens[Math.floor(notesLens.length * 0.95)] ?? 0;
const p99 = notesLens[Math.floor(notesLens.length * 0.99)] ?? 0;
console.log(
  `COLLECTION NOTES — non-empty=${notesLens.length}/${data.length}, p50=${p50}, p95=${p95}, p99=${p99}, max=${max}`,
);

// Show 3 longest notes
const idxs = data
  .map((r, i) => [i, r[notesIdx] ? String(r[notesIdx]).length : 0])
  .sort((a, b) => b[1] - a[1])
  .slice(0, 2);
idxs.forEach(([i, len]) => {
  console.log(`\n--- Notes from row ${i + 1} (len=${len}) ---`);
  console.log(String(data[i][notesIdx]).slice(0, 1500));
  console.log("--- end ---");
});

// 2) Distinct values for enum-ish columns
const enumCols = [
  "CASE LEVEL",
  "CLAIM TYPE",
  "WIN SHEET STATUS",
  "CASE STATUS",
  "APPROVAL CATEGORY",
  "FEES STATUS",
  "FEES CONFIRMATION",
  "ASSIGNED TO",
];
console.log("\n=== Distinct values ===");
for (const col of enumCols) {
  const ix = header.indexOf(col);
  if (ix < 0) continue;
  const vals = new Set();
  for (const r of data) {
    const v = r[ix];
    if (v !== null && v !== undefined && v !== "") vals.add(String(v).trim());
  }
  console.log(`${col} (${vals.size}):`);
  console.log("  " + [...vals].slice(0, 20).map((v) => JSON.stringify(v)).join(", "));
  if (vals.size > 20) console.log(`  ...and ${vals.size - 20} more`);
}

// 3) CASE LINK pattern (does it look like a clientId, name, hyperlink, …?)
console.log("\n=== CASE LINK samples (first 10) ===");
data.slice(0, 10).forEach((r, i) => {
  const v = r[header.indexOf("CASE LINK")];
  console.log(`  ${i + 1}: ${JSON.stringify(v)}`);
});

// 4) Hyperlink detection — look at one cell deeply
const linkRange = XLSX.utils.decode_range(ws["!ref"]);
let hyperlinkCount = 0;
for (let r = linkRange.s.r + 1; r <= linkRange.e.r; r++) {
  const cell = ws[XLSX.utils.encode_cell({ r, c: 0 })];
  if (cell?.l?.Target) hyperlinkCount++;
}
console.log(
  `\nCASE LINK hyperlinks present on ${hyperlinkCount}/${data.length} rows`,
);
if (hyperlinkCount > 0) {
  for (let r = linkRange.s.r + 1; r <= linkRange.s.r + 4; r++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: 0 })];
    if (cell?.l) console.log(`  row ${r}: ${cell.v} -> ${cell.l.Target}`);
  }
}
