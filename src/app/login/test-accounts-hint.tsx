"use client";

import { useState } from "react";
import { ChevronDown, Info } from "lucide-react";

// TEST-ONLY: surfaced on the login page when NEXT_PUBLIC_SHOW_TEST_LOGINS is
// set, so a tester knows which seeded accounts to use. system_admin is
// intentionally excluded. Remove the env flag (and the seeded accounts) before
// production.
const TEST_ACCOUNTS = [
  { role: "Admin", email: "admin@hogansmith.com", password: "admin123" },
  { role: "Lead", email: "lead@hogansmith.com", password: "lead123" },
  { role: "Member", email: "member@hogansmith.com", password: "member123" },
];

export function TestAccountsHint() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-600"
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
        Test accounts
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="rounded-md border border-neutral-200 bg-white px-3 py-2 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <table className="cursor-text text-[11px] select-text">
            <tbody>
              {TEST_ACCOUNTS.map((a) => (
                <tr key={a.email}>
                  <td className="pr-3 py-0.5 font-medium">{a.role}</td>
                  <td className="pr-3 py-0.5 font-mono select-all">{a.email}</td>
                  <td className="py-0.5 font-mono select-all">{a.password}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
