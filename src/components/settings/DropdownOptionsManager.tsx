"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { themeClasses } from "@/lib/theme-classes";
import {
  DROPDOWN_CATEGORIES,
  type DropdownCategory,
} from "@/lib/dropdown-categories";
import { DropdownOptionsCard } from "./DropdownOptionsCard";

/**
 * Sub-tab navigator for every dropdown category. Each sub-tab renders a
 * `DropdownOptionsCard` for one category (Approved By, Assigned To, etc.).
 */
export function DropdownOptionsManager() {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const t = themeClasses(dark);

  const [active, setActive] = useState<DropdownCategory>(
    DROPDOWN_CATEGORIES[0].key,
  );

  const activeMeta =
    DROPDOWN_CATEGORIES.find((c) => c.key === active) ?? DROPDOWN_CATEGORIES[0];

  return (
    <div className="space-y-4">
      {/* Sub-tab strip */}
      <div
        role="tablist"
        aria-label="Dropdown categories"
        className={`flex flex-wrap gap-1.5 p-1 rounded-lg border ${t.borderLight} ${dark ? "bg-neutral-900/40" : "bg-neutral-50"}`}
      >
        {DROPDOWN_CATEGORIES.map((cat) => {
          const isActive = cat.key === active;
          return (
            <button
              key={cat.key}
              role="tab"
              aria-selected={isActive}
              type="button"
              onClick={() => setActive(cat.key)}
              className={`px-2.5 py-1 rounded-md text-[13px] font-medium transition-colors ${
                isActive
                  ? dark
                    ? "bg-neutral-800 text-neutral-100"
                    : "bg-white text-neutral-900 shadow-sm"
                  : `${t.textMuted} hover:${t.text}`
              }`}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      <DropdownOptionsCard
        key={activeMeta.key}
        category={activeMeta.key}
        label={activeMeta.label}
        description={activeMeta.description}
      />
    </div>
  );
}
