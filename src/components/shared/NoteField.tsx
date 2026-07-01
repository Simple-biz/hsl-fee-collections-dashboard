"use client";

import { useState } from "react";
import { Loader2, Check } from "lucide-react";
import type { themeClasses } from "@/lib/theme-classes";

interface NoteFieldProps {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  dark: boolean;
  t: ReturnType<typeof themeClasses>;
  placeholder?: string;
  maxLength?: number;
  status?: "saving" | "saved";
  "aria-label"?: string;
}

// Single-line by default, so it fits inline like the plain <input> it
// replaces — but expands into a taller, wrapped textarea on focus/click so a
// long note is actually readable while editing, then collapses back (and
// saves) on blur. Used anywhere a per-row "update note" field is edited:
// Fee Petitions, Completed Petitions, Overpaid Cases.
export function NoteField({
  value,
  onChange,
  onSave,
  dark,
  t,
  placeholder = "Add a note...",
  maxLength = 5000,
  status,
  "aria-label": ariaLabel,
}: NoteFieldProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="relative">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setExpanded(true)}
        onBlur={() => {
          setExpanded(false);
          onSave();
        }}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={expanded ? 5 : 1}
        aria-label={ariaLabel}
        className={`w-full pl-2 pr-7 py-1 rounded-md border text-[11px] outline-none resize-none transition-[height] focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-600 ${
          expanded ? "" : "h-7 overflow-hidden whitespace-nowrap"
        } ${t.inputBg}`}
      />
      {status === "saving" && (
        <Loader2
          aria-hidden="true"
          className={`absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin ${t.textMuted}`}
        />
      )}
      {status === "saved" && (
        <Check
          aria-hidden="true"
          className={`absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 ${dark ? "text-emerald-400" : "text-emerald-600"}`}
        />
      )}
    </div>
  );
}
