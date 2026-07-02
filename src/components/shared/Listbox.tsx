"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
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
// Type-ahead resets the buffer if the user pauses this long between keys —
// matches native <select> behavior closely enough without a debounce lib.
const TYPEAHEAD_RESET_MS = 350;

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
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const typeaheadRef = useRef({ buffer: "", timer: null as ReturnType<typeof setTimeout> | null });

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const closeOnResize = () => setOpen(false);
    // Scroll happens inside the fee table's own overflow containers, so this
    // needs the capture phase to hear it — repositioning on every scroll
    // isn't worth the complexity here, closing is enough. But capture-phase
    // listeners on window also intercept scroll events from the option list's
    // own overflow-auto (a real scroll never bubbles there, capture still
    // sees it on the way down) — ignore those so scrolling to reach an option
    // further down the list, or the browser auto-scrolling the selected
    // option into view on open, doesn't slam the panel shut.
    const closeOnOutsideScroll = (e: Event) => {
      if (panelRef.current && e.target instanceof Node && panelRef.current.contains(e.target)) {
        return;
      }
      setOpen(false);
    };
    const onClickAway = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener("scroll", closeOnOutsideScroll, true);
    window.addEventListener("resize", closeOnResize);
    document.addEventListener("mousedown", onClickAway);
    return () => {
      window.removeEventListener("scroll", closeOnOutsideScroll, true);
      window.removeEventListener("resize", closeOnResize);
      document.removeEventListener("mousedown", onClickAway);
    };
  }, [open]);

  // Roving focus: whichever option is "highlighted" actually holds DOM focus,
  // so arrow keys/type-ahead work the way a native <select> or an ARIA
  // listbox would, instead of every option being its own Tab stop.
  useEffect(() => {
    if (open && highlightedIndex >= 0) {
      optionRefs.current[highlightedIndex]?.focus();
    }
  }, [open, highlightedIndex]);

  const openAt = (index: number) => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) setRect({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 170) });
    optionRefs.current = [];
    setHighlightedIndex(index);
    setOpen(true);
  };

  const close = () => setOpen(false);

  const closeAndRefocus = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const initialIndex = () => {
    if (options.length === 0) return -1;
    const i = options.findIndex((o) => o.value === value);
    return i >= 0 ? i : 0;
  };

  const commit = (index: number) => {
    const o = options[index];
    if (!o) return;
    onChange(o.value);
    closeAndRefocus();
  };

  const typeahead = (char: string) => {
    const ta = typeaheadRef.current;
    if (ta.timer) clearTimeout(ta.timer);
    ta.buffer += char.toLowerCase();
    ta.timer = setTimeout(() => {
      ta.buffer = "";
    }, TYPEAHEAD_RESET_MS);
    const n = options.length;
    if (n === 0) return;
    const start = highlightedIndex >= 0 ? highlightedIndex : -1;
    for (let step = 1; step <= n; step++) {
      const i = (start + step) % n;
      if (options[i].label.toLowerCase().startsWith(ta.buffer)) {
        setHighlightedIndex(i);
        return;
      }
    }
  };

  const onPanelKeyDown = (e: KeyboardEvent) => {
    const n = options.length;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (n > 0) setHighlightedIndex((i) => (i + 1) % n);
        return;
      case "ArrowUp":
        e.preventDefault();
        if (n > 0) setHighlightedIndex((i) => (i - 1 + n) % n);
        return;
      case "Home":
        e.preventDefault();
        if (n > 0) setHighlightedIndex(0);
        return;
      case "End":
        e.preventDefault();
        if (n > 0) setHighlightedIndex(n - 1);
        return;
      case "Enter":
      case " ":
        e.preventDefault();
        commit(highlightedIndex);
        return;
      case "Escape":
        e.preventDefault();
        closeAndRefocus();
        return;
      case "Tab":
        // Portal content isn't next to the trigger in DOM order, so letting
        // Tab run its default course would jump focus somewhere unrelated —
        // close and land back on the trigger instead.
        e.preventDefault();
        closeAndRefocus();
        return;
      default:
        if (e.key.length === 1 && !e.altKey && !e.ctrlKey && !e.metaKey) {
          typeahead(e.key);
        }
    }
  };

  const onTriggerKeyDown = (e: KeyboardEvent) => {
    if (open) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      openAt(initialIndex());
    }
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
          if (open) close();
          else openAt(initialIndex());
        }}
        onKeyDown={onTriggerKeyDown}
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
              onKeyDown={onPanelKeyDown}
              style={{ position: "fixed", top: rect.top, left: rect.left, width: rect.width, zIndex: 9999 }}
              className={`rounded-lg border shadow-lg p-1 max-h-64 overflow-auto ${t.card}`}
            >
              {options.length === 0 ? (
                <div className={`px-2 py-1.5 text-[11px] ${t.textMuted}`}>
                  No options configured — add them in Settings
                </div>
              ) : (
                options.map((o, i) => {
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
                      ref={(el) => { optionRefs.current[i] = el; }}
                      type="button"
                      role="option"
                      tabIndex={-1}
                      aria-selected={isSelected}
                      onMouseEnter={() => setHighlightedIndex(i)}
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
