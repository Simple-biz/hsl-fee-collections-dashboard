"use client";

import { useState, useRef, useEffect } from "react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import {
  Home,
  Users,
  Trophy,
  Settings,
  DollarSign,
  PanelLeft,
  ChevronDown,
  Search,
  Bell,
  FileText,
  X,
  Database,
} from "lucide-react";
import { themeClasses } from "@/lib/theme-classes";
import { fmtClaim } from "@/lib/formatters";

interface SidebarProps {
  open: boolean;
  onToggle: () => void;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

interface NavItem {
  tab: string;
  icon: React.ElementType;
  label: string;
}

interface SearchResult {
  id: number;
  name: string;
  claim: string;
  status: string;
  assigned: string;
}

const NAV_ITEMS: { section: string; items: NavItem[] }[] = [
  {
    section: "General",
    items: [
      { tab: "overview", icon: Home, label: "Overview" },
      { tab: "analytics", icon: Trophy, label: "Scoreboard" },
      { tab: "chronicle", icon: Database, label: "Chronicle Sync" },
      { tab: "reports", icon: FileText, label: "Reports" },
      { tab: "notifications", icon: Bell, label: "Notifications" },
    ],
  },
  {
    section: "Management",
    items: [
      { tab: "team", icon: Users, label: "Team" },
      { tab: "settings", icon: Settings, label: "Settings" },
    ],
  },
];

export const Sidebar = ({
  open,
  onToggle,
  activeTab,
  onTabChange,
}: SidebarProps) => {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const t = themeClasses(dark);
  const router = useRouter();

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === "Escape") {
        setSearchOpen(false);
        setSearchQuery("");
        setSearchResults([]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchOpen]);

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      requestAnimationFrame(() => setSearchResults([]));
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/cases?search=${encodeURIComponent(searchQuery.trim())}&limit=8`,
        );
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.data || []);
        }
      } catch {}
      setSearching(false);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
  };

  const goToCase = (id: number) => {
    closeSearch();
    router.push(`/cases/${id}`);
  };

  return (
    <>
      <aside
        className={`${open ? "w-64" : "w-14"} ${t.bg} border-r ${t.border} flex flex-col transition-all duration-200 shrink-0 overflow-hidden`}
      >
        {/* Logo */}
        <div
          className={`h-14 border-b ${t.borderLight} flex items-center ${open ? "px-4 gap-3" : "justify-center"}`}
        >
          <button onClick={onToggle} className="shrink-0">
            <div className={`flex items-center ${open ? "gap-2.5" : ""}`}>
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center ${t.logoBg}`}
              >
                <DollarSign className={`h-4 w-4 ${t.logoIcon}`} />
              </div>
              {open && (
                <div className="leading-tight">
                  <div className={`text-[13px] font-bold ${t.text}`}>
                    Fee Collections
                  </div>
                  <div className={`text-[10px] ${t.textMuted}`}>
                    Hogan Smith Law
                  </div>
                </div>
              )}
            </div>
          </button>
          {open && (
            <button
              onClick={onToggle}
              className={`ml-auto ${t.textMuted} ${t.hover} rounded p-0.5`}
            >
              <PanelLeft className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Search trigger */}
        {open && (
          <div className="px-3 py-2">
            <button
              onClick={() => setSearchOpen(true)}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-xs ${t.searchBox} transition-colors`}
            >
              <Search className="h-3.5 w-3.5" />
              <span>Search cases</span>
              <span
                className={`ml-auto text-[10px] px-1 py-0.5 rounded border ${t.kbdBg}`}
              >
                \u2318K
              </span>
            </button>
          </div>
        )}
        {!open && (
          <div className="px-2 py-2">
            <button
              onClick={() => {
                onToggle();
                setTimeout(() => setSearchOpen(true), 200);
              }}
              className={`w-full flex justify-center py-1.5 rounded-md ${t.hover}`}
            >
              <Search className={`h-4 w-4 ${t.textMuted}`} />
            </button>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-1">
          {NAV_ITEMS.map((group) => (
            <div key={group.section}>
              {open && (
                <div
                  className={`px-2 pt-4 pb-1 text-[10px] font-semibold ${t.textMuted} uppercase tracking-wider`}
                >
                  {group.section}
                </div>
              )}
              {group.items.map((item) => {
                const active = activeTab === item.tab;
                return (
                  <button
                    key={item.tab}
                    onClick={() => onTabChange?.(item.tab)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] font-medium transition-colors ${open ? "" : "justify-center"} ${
                      active
                        ? `${t.activeNav} font-semibold`
                        : `${t.textSub} ${t.hover}`
                    }`}
                  >
                    <item.icon
                      className={`h-4 w-4 shrink-0 ${active ? "" : t.textMuted}`}
                    />
                    {open && <span>{item.label}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* User */}
        {open && (
          <div
            className={`border-t ${t.borderLight} px-3 py-3 flex items-center gap-2.5`}
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${t.avatarBg}`}
            >
              T
            </div>
            <div className="flex-1 min-w-0">
              <div className={`text-[12px] font-semibold ${t.text} truncate`}>
                Thomas
              </div>
              <div className={`text-[10px] ${t.textMuted} truncate`}>
                admin@hogansmith.com
              </div>
            </div>
            <ChevronDown className={`h-3.5 w-3.5 ${t.textMuted} shrink-0`} />
          </div>
        )}
      </aside>

      {/* Search overlay */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
          onClick={closeSearch}
        >
          <div
            className={`absolute inset-0 ${dark ? "bg-black/60" : "bg-black/30"} backdrop-blur-sm`}
          />
          <div
            className={`relative w-full max-w-lg rounded-xl border shadow-2xl ${dark ? "bg-neutral-900 border-neutral-700" : "bg-white border-neutral-200"}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Input */}
            <div className="flex items-center gap-3 px-4 py-3">
              <Search className={`h-4 w-4 shrink-0 ${t.textMuted}`} />
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search cases by name or ID..."
                className={`flex-1 text-sm outline-none ${dark ? "bg-transparent text-neutral-100 placeholder:text-neutral-500" : "bg-transparent text-neutral-900 placeholder:text-neutral-400"}`}
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setSearchResults([]);
                  }}
                  className={t.textMuted}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div
              className={`border-t ${t.borderLight} max-h-87.5 overflow-y-auto`}
            >
              {/* Search results */}
              {searchQuery && searchResults.length > 0 && (
                <div className="px-2 py-2">
                  <p
                    className={`px-3 py-1.5 text-[10px] font-semibold uppercase ${t.textMuted}`}
                  >
                    Cases ({searchResults.length})
                  </p>
                  {searchResults.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => goToCase(c.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left transition-colors ${dark ? "hover:bg-neutral-800" : "hover:bg-neutral-50"}`}
                    >
                      <div className="flex-1 min-w-0">
                        <span className={`text-sm font-semibold ${t.text}`}>
                          {c.name}
                        </span>
                        <span className={`ml-2 text-[10px] ${t.textMuted}`}>
                          #{c.id}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${t.pillBg}`}
                      >
                        {fmtClaim(c.claim)}
                      </span>
                      <span className={`text-[10px] ${t.textMuted}`}>
                        {c.assigned}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* No results */}
              {searchQuery && !searching && searchResults.length === 0 && (
                <div className={`px-3 py-8 text-center`}>
                  <p className={`text-sm ${t.textMuted}`}>
                    No cases found for &quot;{searchQuery}&quot;
                  </p>
                </div>
              )}

              {/* Searching */}
              {searching && (
                <div className={`px-3 py-6 text-center`}>
                  <p className={`text-sm ${t.textMuted}`}>Searching...</p>
                </div>
              )}

              {/* Quick nav when empty */}
              {!searchQuery && (
                <div className="px-2 py-2">
                  <p
                    className={`px-3 py-1.5 text-[10px] font-semibold uppercase ${t.textMuted}`}
                  >
                    Quick Navigation
                  </p>
                  {[
                    { tab: "overview", icon: Home, label: "Overview" },
                    { tab: "analytics", icon: Trophy, label: "Scoreboard" },
                    {
                      tab: "chronicle",
                      icon: Database,
                      label: "Chronicle Sync",
                    },
                    { tab: "reports", icon: FileText, label: "Reports" },
                  ].map((item) => (
                    <button
                      key={item.tab}
                      onClick={() => {
                        onTabChange?.(item.tab);
                        closeSearch();
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm ${t.textSub} ${t.hover} transition-colors`}
                    >
                      <item.icon className={`h-4 w-4 ${t.textMuted}`} />
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div
              className={`border-t ${t.borderLight} px-4 py-2 flex items-center gap-4`}
            >
              <span className={`text-[10px] ${t.textMuted}`}>
                \u2191\u2193 Navigate
              </span>
              <span className={`text-[10px] ${t.textMuted}`}>
                \u21B5 Select
              </span>
              <span className={`text-[10px] ${t.textMuted}`}>esc Close</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
