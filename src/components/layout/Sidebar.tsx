"use client";

import { useState, useRef, useEffect, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { pageKeyForPath } from "@/lib/access/pages";
import { rolePageDefaults } from "@/lib/access/role-defaults";
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
  Gavel,
  TrendingDown,
  LogOut,
  Shield,
  KeyRound,
  CheckCircle2,
  Archive,
  TableProperties,
  PhoneIncoming,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import { themeClasses } from "@/lib/theme-classes";
import { fmtClaim, namesMatch } from "@/lib/formatters";
import { ChangePasswordDialog } from "@/components/layout/ChangePasswordDialog";

// Local getter, never toISOString() — that converts to UTC and can roll the
// date back a day for anyone east of UTC.
const todayLocalIso = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

interface SidebarProps {
  open: boolean;
  onToggle: () => void;
  onMobileClose?: () => void;
}

interface SearchResult {
  id: number;
  name: string;
  claim: string;
  status: string;
  assigned: string;
}

type NavItem = {
  path: string;
  icon: React.ElementType;
  label: string;
  // When set, only sessions whose user.role is admin/system_admin see this item.
  adminOnly?: boolean;
};

const NAV_ITEMS: { section: string; items: NavItem[] }[] = [
  {
    section: "General",
    items: [
      { path: "/", icon: Home, label: "Overview" },
      { path: "/master-fees", icon: TableProperties, label: "Master Fees" },
      { path: "/fees-closed", icon: CheckCircle2, label: "Fees Closed" },
      { path: "/fee-petitions", icon: Gavel, label: "Fee Petitions" },
      { path: "/overpaid-cases", icon: TrendingDown, label: "Overpaid Cases" },
      { path: "/inbound-calls", icon: PhoneIncoming, label: "Inbound Calls" },
      { path: "/scoreboard", icon: Trophy, label: "Scoreboard" },
      { path: "/reports", icon: FileText, label: "Reports" },
      { path: "/chronicle", icon: Database, label: "Chronicle Sync" },
      { path: "/notifications", icon: Bell, label: "Notifications" },
      { path: "/resources", icon: BookOpen, label: "Resources" },
    ],
  },
  {
    section: "Management",
    items: [
      { path: "/team", icon: Users, label: "Team" },
      { path: "/admin", icon: Shield, label: "Admin", adminOnly: true },
      { path: "/archive", icon: Archive, label: "Archive", adminOnly: true },
      { path: "/settings", icon: Settings, label: "Settings" },
    ],
  },
];

export const Sidebar = ({ open, onToggle, onMobileClose }: SidebarProps) => {
  const { resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const dark = mounted ? resolvedTheme === "dark" : false;
  const t = themeClasses(dark);
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = session?.user?.role;
  // Effective page set drives which nav items show. Fall back to role
  // defaults if the token predates the access feature (no `pages`) OR carries
  // an empty set (a failed resolution) — never hide everything.
  const sessionPages = session?.user?.pages;
  const accessiblePages =
    sessionPages && sessionPages.length > 0
      ? sessionPages
      : rolePageDefaults(role);

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const [notifCount, setNotifCount] = useState(0);

  // Poll notification unread count
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const fetchCount = async () => {
      try {
        const res = await fetch("/api/notifications?unread=true&limit=1", { signal });
        if (res.ok) {
          const json = await res.json();
          setNotifCount(json.unreadCount || 0);
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
      }
    };
    fetchCount();
    const interval = setInterval(fetchCount, 60000);
    return () => { clearInterval(interval); controller.abort(); };
  }, []);

  // Poll for the current agent's own cases with a follow-up call due today,
  // and toast once per case per day — checked periodically rather than on
  // login, since sessions are long-lived and agents rarely log in fresh.
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const checkFollowUps = async () => {
      try {
        const res = await fetch("/api/cases?dueToday=true", { signal });
        if (!res.ok) return;
        const json = await res.json();
        const rows: { id: number; name: string; assigned: string }[] = json.data || [];
        const today = todayLocalIso();
        for (const row of rows) {
          if (!namesMatch(row.assigned, session?.user?.name)) continue;
          const key = `followupToasted-${row.id}-${today}`;
          if (sessionStorage.getItem(key)) continue;
          sessionStorage.setItem(key, "1");
          toast.warning(`Follow-up call due today — ${row.name}`);
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
      }
    };
    checkFollowUps();
    const interval = setInterval(checkFollowUps, 60000);
    return () => { clearInterval(interval); controller.abort(); };
  }, [session?.user?.name]);

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
    if (searchOpen && searchInputRef.current) searchInputRef.current.focus();
  }, [searchOpen]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!searchQuery.trim()) {
      debounceRef.current = setTimeout(() => setSearchResults([]), 0);
      return () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
      };
    }
    const controller = new AbortController();
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/cases?search=${encodeURIComponent(searchQuery.trim())}&limit=8`,
          { signal: controller.signal },
        );
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.data || []);
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
      }
      setSearching(false);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      controller.abort();
    };
  }, [searchQuery]);

  // Close the user menu on outside click.
  useEffect(() => {
    if (!userMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node))
        setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [userMenuOpen]);

  const userName = session?.user?.name || session?.user?.email || "User";
  const userEmail = session?.user?.email || "";
  const userInitial = userName.charAt(0).toUpperCase();

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
  };
  const goToCase = (id: number) => {
    closeSearch();
    router.push(`/cases/${id}`);
  };
  const isActive = (path: string) =>
    path === "/" ? pathname === "/" : pathname.startsWith(path);

  return (
    <>
      <aside
        className={`${open ? "w-64" : "w-14"} ${t.bg} border-r ${t.border} flex flex-col transition-[width] duration-200 shrink-0 overflow-hidden`}
      >
        {/* Logo */}
        <div
          className={`h-14 border-b ${t.borderLight} flex items-center ${open ? "px-4 gap-3" : "justify-center"}`}
        >
          <button
            onClick={onToggle}
            aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
            className="shrink-0"
          >
            <div className={`flex items-center ${open ? "gap-2.5" : ""}`}>
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center ${t.logoBg}`}
              >
                <DollarSign className={`h-4 w-4 ${t.logoIcon}`} aria-hidden="true" />
              </div>
              {open && (
                <div className="leading-tight">
                  <div className={`text-[15px] font-bold ${t.text}`}>
                    Fee Collections
                  </div>
                  <div className={`text-[12px] ${t.textMuted}`}>
                    Hogan Smith Law
                  </div>
                </div>
              )}
            </div>
          </button>
          {open && (
            <button
              onClick={onToggle}
              aria-label="Collapse sidebar"
              className={`ml-auto ${t.textMuted} ${t.hover} rounded p-0.5`}
            >
              <PanelLeft className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Search */}
        {open ? (
          <div className="px-3 py-2">
            <button
              onClick={() => setSearchOpen(true)}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-xs ${t.searchBox} transition-colors`}
            >
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Search cases</span>
              <span
                className={`ml-auto text-[12px] px-1 py-0.5 rounded border ${t.kbdBg}`}
              >
                {"\u2318"}K
              </span>
            </button>
          </div>
        ) : (
          <div className="px-2 py-2">
            <button
              onClick={() => {
                onToggle();
                setTimeout(() => setSearchOpen(true), 200);
              }}
              aria-label="Search cases"
              className={`w-full flex justify-center py-1.5 rounded-md ${t.hover}`}
            >
              <Search className={`h-4 w-4 ${t.textMuted}`} aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-1">
          {NAV_ITEMS.map((group) => {
            const items = group.items.filter((item) => {
              const key = pageKeyForPath(item.path);
              return !key || accessiblePages.includes(key);
            });
            if (items.length === 0) return null;
            return (
            <div key={group.section}>
              {open && (
                <div
                  className={`px-2 pt-4 pb-1 text-[12px] font-semibold ${t.textMuted} uppercase tracking-wider`}
                >
                  {group.section}
                </div>
              )}
              {items.map((item) => {
                const active = isActive(item.path);
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    onClick={() => onMobileClose?.()}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[15px] font-medium transition-colors ${open ? "" : "justify-center"} ${active ? `${t.activeNav} font-semibold` : `${t.textSub} ${t.hover}`}`}
                  >
                    <div className="relative shrink-0">
                      <item.icon
                        aria-hidden="true"
                        className={`h-4 w-4 ${active ? "" : t.textMuted}`}
                      />
                      {item.path === "/notifications" &&
                        notifCount > 0 &&
                        !open && (
                          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 border border-neutral-900" />
                        )}
                    </div>
                    {open && (
                      <span className="flex items-center gap-2 flex-1">
                        {item.label}
                        {item.path === "/notifications" && notifCount > 0 && (
                          <span className="min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center">
                            {notifCount > 99 ? "99+" : notifCount}
                          </span>
                        )}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
            );
          })}
        </nav>

        {/* User */}
        <div
          ref={userMenuRef}
          className={`relative border-t ${t.borderLight} ${open ? "px-3 py-3" : "px-2 py-2"}`}
        >
          {userMenuOpen && (
            <div
              className={`absolute bottom-full left-2 right-2 mb-1 rounded-lg border shadow-xl overflow-hidden ${dark ? "bg-neutral-900 border-neutral-700" : "bg-white border-neutral-200"}`}
            >
              <button
                onClick={() => {
                  setUserMenuOpen(false);
                  setChangePasswordOpen(true);
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-[15px] font-medium text-left transition-colors ${t.textSub} ${dark ? "hover:bg-neutral-800" : "hover:bg-neutral-50"}`}
              >
                <KeyRound aria-hidden="true" className="h-4 w-4 shrink-0" />
                Change password
              </button>
              <div className={`border-t ${t.borderLight}`} />
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className={`w-full flex items-center gap-2 px-3 py-2 text-[15px] font-medium text-left transition-colors ${dark ? "text-red-400 hover:bg-neutral-800" : "text-red-600 hover:bg-neutral-50"}`}
              >
                <LogOut aria-hidden="true" className="h-4 w-4 shrink-0" />
                Sign out
              </button>
            </div>
          )}

          {open ? (
            <button
              onClick={() => setUserMenuOpen((v) => !v)}
              className={`w-full flex items-center gap-2.5 rounded-md p-0.5 ${t.hover} transition-colors`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${t.avatarBg}`}
              >
                {userInitial}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <div className={`text-[14px] font-semibold ${t.text} truncate`}>
                  {userName}
                </div>
                {userEmail && (
                  <div className={`text-[12px] ${t.textMuted} truncate`}>
                    {userEmail}
                  </div>
                )}
              </div>
              <ChevronDown
                className={`h-3.5 w-3.5 ${t.textMuted} shrink-0 transition-transform ${userMenuOpen ? "rotate-180" : ""}`}
              />
            </button>
          ) : (
            <button
              onClick={() => setUserMenuOpen((v) => !v)}
              className={`w-full flex justify-center`}
              title={userName}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${t.avatarBg}`}
              >
                {userInitial}
              </div>
            </button>
          )}
        </div>
      </aside>

      <ChangePasswordDialog
        open={changePasswordOpen}
        onOpenChange={setChangePasswordOpen}
      />

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
            <div className="flex items-center gap-3 px-4 py-3">
              <Search className={`h-4 w-4 shrink-0 ${t.textMuted}`} aria-hidden="true" />
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
                  aria-label="Clear search"
                  className={t.textMuted}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
            <div
              className={`border-t ${t.borderLight} max-h-87.5 overflow-y-auto`}
            >
              {searchQuery && searchResults.length > 0 && (
                <div className="px-2 py-2">
                  <p
                    className={`px-3 py-1.5 text-[12px] font-semibold uppercase ${t.textMuted}`}
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
                        <span className={`ml-2 text-[12px] ${t.textMuted}`}>
                          #{c.id}
                        </span>
                      </div>
                      <span
                        className={`text-[12px] font-medium px-1.5 py-0.5 rounded ${t.pillBg}`}
                      >
                        {fmtClaim(c.claim)}
                      </span>
                      <span className={`text-[12px] ${t.textMuted}`}>
                        {c.assigned}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {searchQuery && !searching && searchResults.length === 0 && (
                <div className="px-3 py-8 text-center">
                  <p className={`text-sm ${t.textMuted}`}>
                    No cases found for &quot;{searchQuery}&quot;
                  </p>
                </div>
              )}
              {searching && (
                <div className="px-3 py-6 text-center">
                  <p className={`text-sm ${t.textMuted}`}>Searching...</p>
                </div>
              )}
              {!searchQuery && (
                <div className="px-2 py-2">
                  <p
                    className={`px-3 py-1.5 text-[12px] font-semibold uppercase ${t.textMuted}`}
                  >
                    Quick Navigation
                  </p>
                  {[
                    { path: "/", icon: Home, label: "Overview" },
                    { path: "/scoreboard", icon: Trophy, label: "Scoreboard" },
                    {
                      path: "/chronicle",
                      icon: Database,
                      label: "Chronicle Sync",
                    },
                    { path: "/reports", icon: FileText, label: "Reports" },
                  ]
                    .filter((item) => {
                      const key = pageKeyForPath(item.path);
                      return !key || accessiblePages.includes(key);
                    })
                    .map((item) => (
                    <Link
                      key={item.path}
                      href={item.path}
                      onClick={closeSearch}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm ${t.textSub} ${t.hover} transition-colors`}
                    >
                      <item.icon className={`h-4 w-4 ${t.textMuted}`} />
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <div
              className={`border-t ${t.borderLight} px-4 py-2 flex items-center gap-4`}
            >
              <span className={`text-[12px] ${t.textMuted}`}>
                {"\u2191\u2193"} Navigate
              </span>
              <span className={`text-[12px] ${t.textMuted}`}>
                {"\u21B5"} Select
              </span>
              <span className={`text-[12px] ${t.textMuted}`}>esc Close</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
