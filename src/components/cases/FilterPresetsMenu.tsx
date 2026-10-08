"use client";

import { Bookmark, BookmarkCheck, Trash2 } from "lucide-react";
import type { themeClasses } from "@/lib/theme-classes";
import type { FilterPreset } from "./fee-records-types";

type ThemeClasses = ReturnType<typeof themeClasses>;

interface Props {
  dark: boolean;
  t: ThemeClasses;
  presetsRef: React.RefObject<HTMLDivElement | null>;
  presetsOpen: boolean;
  setPresetsOpen: (v: boolean) => void;
  presets: FilterPreset[];
  presetName: string;
  setPresetName: (v: string) => void;
  savePreset: () => void;
  applyPreset: (preset: FilterPreset) => void;
  deletePreset: (id: string) => void;
}

export function FilterPresetsMenu({
  dark, t,
  presetsRef, presetsOpen, setPresetsOpen,
  presets, presetName, setPresetName,
  savePreset, applyPreset, deletePreset,
}: Props) {
  return (
    <div className="relative" ref={presetsRef}>
      <button
        onClick={() => setPresetsOpen(!presetsOpen)}
        aria-label="Filter presets"
        title="Filter presets"
        className={`h-7 w-7 rounded-md flex items-center justify-center transition-colors ${presetsOpen ? (dark ? "bg-indigo-700 text-white" : "bg-indigo-100 text-indigo-700") : `${t.hover} ${t.textMuted}`}`}
      >
        {presets.length > 0
          ? <BookmarkCheck className="h-3.5 w-3.5" aria-hidden="true" />
          : <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />
        }
      </button>
      {presetsOpen && (
        <div className={`absolute left-0 top-9 z-50 w-64 rounded-xl border shadow-xl ${dark ? "bg-neutral-900 border-neutral-700" : "bg-white border-neutral-200"}`}>
          <div className={`p-3 border-b ${t.borderLight}`}>
            <p className={`text-[11px] font-semibold uppercase tracking-wider ${t.textMuted} mb-2`}>Save current filters</p>
            <div className="flex gap-1.5">
              <input
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && savePreset()}
                placeholder="Preset name…"
                className={`flex-1 h-7 px-2 rounded-md border text-xs outline-none ${t.inputBg}`}
              />
              <button
                onClick={savePreset}
                disabled={!presetName.trim()}
                className={`h-7 px-2 rounded-md text-xs font-semibold ${t.ctaBtn} disabled:opacity-40`}
              >
                Save
              </button>
            </div>
          </div>
          {presets.length > 0 ? (
            <ul className="py-1 max-h-48 overflow-y-auto">
              {presets.map((preset) => (
                <li key={preset.id} className={`flex items-center gap-1 px-2 py-1 ${dark ? "hover:bg-neutral-800" : "hover:bg-neutral-50"}`}>
                  <button
                    onClick={() => applyPreset(preset)}
                    className={`flex-1 text-left text-xs ${t.text} truncate`}
                  >
                    {preset.name}
                  </button>
                  <button
                    onClick={() => deletePreset(preset.id)}
                    aria-label={`Delete preset ${preset.name}`}
                    className={`shrink-0 p-0.5 rounded ${dark ? "hover:bg-neutral-700 text-neutral-500" : "hover:bg-neutral-100 text-neutral-400"}`}
                  >
                    <Trash2 className="h-3 w-3" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className={`text-[13px] ${t.textMuted} p-3`}>No saved presets yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
