// Turns a Drizzle camelCase property name into a label a non-technical
// reader can work with — e.g. "t16FeeDue" -> "T16 Fee Due",
// "aljFirstName" -> "ALJ First Name". Exact-word overrides below cover
// acronyms (kept matching how the rest of the app already labels them, e.g.
// "Ltr to ALJ" on the Fee Petitions checklist) and a few domain
// abbreviations that aren't obvious out of context. Anything not listed
// falls back to a plain split-and-capitalize.
const WORD_OVERRIDES: Record<string, string> = {
  id: "ID", ssa: "SSA", ssn: "SSN", alj: "ALJ", dob: "DOB", ein: "EIN",
  poc: "POC", ib: "IB", ob: "OB", url: "URL", pdf: "PDF",
  t16: "T16", t2: "T2", aux: "AUX",
  mycase: "MyCase",
  ltr: "Letter", clmt: "Claimant", conf: "Confirmation", op: "Overpayment",
};

export function humanizeKey(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(" ")
    .filter(Boolean);
  return words
    .map((w) => WORD_OVERRIDES[w.toLowerCase()] ?? w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
