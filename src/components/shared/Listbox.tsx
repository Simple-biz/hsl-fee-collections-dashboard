"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, type LucideIcon } from "lucide-react";
import type { themeClasses } from "@/lib/theme-classes";

export interface ListboxOption {
  value: string;
  label: string;
  icon?: LucideIcon;
  iconBg?: string;
  iconFg?: string;
  // Full bg/text/hover className override for this option's row — e.g. a
  // team-tinted row for team leads in "Approved By". Falls back to the
  // default row styling when omitted.
  tint?: string;
}

interface ListboxProps {
  value: string;
  options: ListboxOption[];
  onChange: (value: string) => void;
  dark: boolean;
  t: ReturnType<typeof themeClasses>;
  placeholder?: string;
  title?: string;
  "aria-label"?: string;
  className?: string;
}

// Drop-in replacement for a plain <select> where the value needs an icon or
// the open list needs to highlight specific options — neither is reliably
// stylable on a native <option> across browsers. Renders the open panel via
// a portal positioned from the trigger's bounding rect so it isn't clipped
// by the fee table's scroll containers or sticky columns.
export function Listbox({
  value,
  options,
  onChange,
  dark,
  t,
  placeholder = "— Select —",
  title,
  "aria-label": ariaLabel,
  className = "",
}: ListboxProps) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onClickAway = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    // Scroll happens inside the fee table's own overflow containers, so this
    // needs the capture phase to hear it — repositioning on every scroll
    // isn't worth the complexity here, closing is enough.
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    document.addEventListener("mousedown", onClickAway);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      document.removeEventListener("mousedown", onClickAway);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => {
    if (!open) {
      const r = triggerRef.current?.getBoundingClientRect();
      if (r) setRect({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 170) });
    }
    setOpen((v) => !v);
  };

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        title={title}
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
        className={`h-7 px-2 rounded-md border text-[11px] outline-none flex items-center justify-between gap-1.5 cursor-pointer ${selected?.tint ?? t.inputBg} ${className}`}
      >
        <span className="flex items-center gap-1.5 truncate">
          {selected?.icon && (
            <span
              className="w-4 h-4 rounded flex items-center justify-center shrink-0"
              style={{ background: selected.iconBg, color: selected.iconFg }}
            >
              <selected.icon className="h-2.5 w-2.5" aria-hidden="true" />
            </span>
          )}
          <span className="truncate">{selected?.label ?? placeholder}</span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`h-3 w-3 shrink-0 ${t.textMuted} transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && rect && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              role="listbox"
              style={{ position: "fixed", top: rect.top, left: rect.left, width: rect.width, zIndex: 9999 }}
              className={`rounded-lg border shadow-lg p-1 max-h-64 overflow-auto ${t.card}`}
            >
              {options.length === 0 ? (
                <div className={`px-2 py-1.5 text-[11px] ${t.textMuted}`}>
                  No options configured — add them in Settings
                </div>
              ) : (
                options.map((o) => {
                  const isSelected = o.value === value;
                  const rowTone = o.tint
                    ? o.tint
                    : isSelected
                      ? dark
                        ? "bg-neutral-800 text-neutral-100"
                        : "bg-neutral-100 text-neutral-900"
                      : dark
                        ? "text-neutral-200 hover:bg-neutral-800"
                        : "text-neutral-700 hover:bg-neutral-50";
                  return (
                    <button
                      key={o.value}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={(e) => {
                        e.stopPropagation();
                        onChange(o.value);
                        setOpen(false);
                      }}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] font-medium text-left ${rowTone}`}
                    >
                      {o.icon && (
                        <span
                          className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                          style={{ background: o.iconBg, color: o.iconFg }}
                        >
                          <o.icon className="h-2.5 w-2.5" aria-hidden="true" />
                        </span>
                      )}
                      <span className="truncate">{o.label}</span>
                      {isSelected && (
                        <Check className="ml-auto h-3 w-3 shrink-0" aria-hidden="true" />
                      )}
                    </button>
                  );
                })
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
