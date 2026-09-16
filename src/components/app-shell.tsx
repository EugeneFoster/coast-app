"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { Profile } from "@/lib/types";
import { signOut } from "@/lib/actions/session";
import {
  canManageOperations,
  canViewBilling,
  canViewCounterSales,
  canViewInventory,
  canViewPurchasing,
  canViewPaintYard,
  canViewSales,
  userRoleLabel,
} from "@/lib/employee-roles";
import { DesignIcon, type DesignIconName } from "@/components/design-icon";
import { SidebarThemeToggle } from "@/components/theme-provider";

type NavItem = {
  href: string;
  label: string;
  icon: DesignIconName;
  permission?: (profile: Profile) => boolean;
};

const navGroups: Array<{ title: string; items: NavItem[] }> = [
  {
    title: "Work",
    items: [
      { href: "/projects", label: "Projects", icon: "folder" },
      { href: "/my-day", label: "My day", icon: "calendar" },
      { href: "/work-orders", label: "Work orders", icon: "clipboard" },
    ],
  },
  {
    title: "Operations",
    items: [
      { href: "/paint-yard", label: "Paint yard", icon: "droplet", permission: (p) => canViewPaintYard(p.role) },
      { href: "/schedule", label: "Team schedule", icon: "users", permission: (p) => canManageOperations(p.role) },
      { href: "/inventory", label: "Inventory", icon: "package", permission: (p) => canViewInventory(p.role) },
    ],
  },
  {
    title: "Commerce",
    items: [
      { href: "/sales", label: "Sales CRM", icon: "trending", permission: (p) => canViewSales(p.role) },
      { href: "/billing", label: "Billing", icon: "fileText", permission: (p) => canViewBilling(p.role) },
      { href: "/counter-sales", label: "Counter sales", icon: "card", permission: (p) => canViewCounterSales(p.role) },
    ],
  },
  {
    title: "Shop floor",
    items: [
      { href: "/chat", label: "Chat", icon: "message" },
      { href: "/library", label: "Library", icon: "book" },
      { href: "/archive", label: "Archive", icon: "archive" },
    ],
  },
];

const routeNames: Record<string, string> = {
  projects: "Projects",
  "my-day": "My day",
  "work-orders": "Work orders",
  "paint-yard": "Paint yard",
  schedule: "Team schedule",
  inventory: "Inventory",
  sales: "Sales CRM",
  billing: "Billing",
  "counter-sales": "Counter sales",
  chat: "Chat",
  library: "Library",
  archive: "Archive",
  settings: "Settings",
};

function initials(profile: Profile) {
  return (profile.full_name ?? profile.login)
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Brand({ compact = false, mobile = false }: { compact?: boolean; mobile?: boolean }) {
  const src = compact ? "/quantum-mark-white.png" : mobile ? "/quantum-lockup-white.png" : "/quantum-marine-white.png";
  return (
    <div className={`flex items-center justify-center border-b border-sidebar-rule ${mobile ? "h-14 px-2" : compact ? "px-2 py-4" : "px-5 py-[18px]"}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Quantum Marine"
        className={mobile ? "h-[26px] w-[125px] object-contain" : compact ? "h-[54px] w-[52px] object-contain" : "h-[91px] w-[156px] object-contain"}
      />
    </div>
  );
}

function VisibleNav({ profile, compact = false, onNavigate }: { profile: Profile; compact?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const railHrefs = new Set(["/projects", "/my-day", "/work-orders", "/paint-yard", "/inventory", "/sales", "/chat"]);
  return (
    <nav className={`flex flex-col ${compact ? "gap-1 px-2" : "gap-5 px-3"}`}>
      {navGroups.map((group) => {
        const items = group.items.filter((item) =>
          (!compact || railHrefs.has(item.href)) && (!item.permission || item.permission(profile)),
        );
        if (!items.length) return null;
        return (
          <div key={group.title} className="flex flex-col gap-0.5">
            {!compact && <p className="mb-1 px-3 font-mono text-[10px] uppercase tracking-[0.16em] text-sidebar-graph">{group.title}</p>}
            {items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={compact ? item.label : undefined}
                  aria-label={compact ? item.label : undefined}
                  onClick={onNavigate}
                  className={`coast-sidebar-link relative flex items-center rounded-[4px] transition-colors ${compact ? "h-[52px] flex-col justify-center gap-0.5 px-1 text-[10px]" : "min-h-10 gap-2.5 px-3 text-sm"} ${active ? "bg-white/[0.08] font-medium text-sidebar-ink" : "text-sidebar-graph"}`}
                >
                  {active && <span className="absolute left-0 top-1/2 h-[22px] w-[3px] -translate-y-1/2 bg-weld" />}
                  <DesignIcon name={item.icon} size={compact ? 20 : 18} />
                  <span className={compact ? "truncate" : "flex-1"}>{compact && item.label === "Work orders" ? "Work" : compact && item.label === "Paint yard" ? "Paint" : compact && item.label === "Inventory" ? "Stock" : compact && item.label === "Sales CRM" ? "Sales" : item.label}</span>
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

function Account({ profile, compact = false }: { profile: Profile; compact?: boolean }) {
  return (
    <div className={`border-t border-sidebar-rule ${compact ? "p-3" : "px-4 py-3.5"}`}>
      <div className={`flex items-center ${compact ? "justify-center" : "gap-2.5"}`}>
        {profile.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatar_url} alt="" width={36} height={36} className="h-9 w-9 rounded-full object-cover" />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 font-mono text-xs font-medium text-white">{initials(profile)}</div>
        )}
        {!compact && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-white">{profile.full_name ?? profile.login}</p>
            <p className="truncate text-xs text-sidebar-graph">{userRoleLabel(profile.role)}</p>
          </div>
        )}
      </div>
      {!compact && (
        <form action={signOut} className="mt-2 pl-[46px]">
          <button type="submit" className="text-xs text-sidebar-graph hover:text-white">Sign out</button>
        </form>
      )}
    </div>
  );
}

function SidebarControls() {
  return (
    <div className="flex gap-1.5 px-3 pb-3.5">
      <SidebarThemeToggle />
      <Link href="/settings" aria-label="Settings" className="coast-sidebar-link flex h-9 flex-1 items-center justify-center rounded-[4px] border border-sidebar-rule text-sidebar-graph">
        <DesignIcon name="sliders" size={16} />
      </Link>
    </div>
  );
}

function BottomNav({ profile, onMore }: { profile: Profile; onMore: () => void }) {
  const pathname = usePathname();
  const items: NavItem[] = [
    { href: "/projects", label: "Projects", icon: "folder" },
    { href: "/my-day", label: "My day", icon: "calendar" },
    { href: "/work-orders", label: "Work", icon: "clipboard" },
    { href: "/inventory", label: "Stock", icon: "package", permission: (p) => canViewInventory(p.role) },
  ];
  return (
    <nav className="print-hidden fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-rule bg-paper px-1 pb-[max(10px,env(safe-area-inset-bottom))] pt-1.5 md:hidden">
      {items.map((item) => {
        const href = !item.permission || item.permission(profile) ? item.href : "/library";
        const active = isActive(pathname, href);
        return (
          <Link key={item.label} href={href} className={`flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-[4px] text-[10px] ${active ? "font-medium text-weld-text" : "text-graph"}`}>
            <DesignIcon name={item.icon} size={20} />
            <span>{item.label}</span>
          </Link>
        );
      })}
      <button type="button" onClick={onMore} className="flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-[4px] text-[10px] text-graph">
        <DesignIcon name="menu" size={20} />
        <span>More</span>
      </button>
    </nav>
  );
}

export function AppShell({ profile, priceAlertCount, children }: { profile: Profile; priceAlertCount: number; children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const pathname = usePathname();
  const title = routeNames[pathname.split("/").filter(Boolean)[0] ?? "projects"] ?? "Projects";

  return (
    <div className="flex min-h-screen bg-bone text-ink">
      <aside className="coast-sidebar print-hidden sticky top-0 hidden h-screen w-[76px] shrink-0 flex-col border-r md:flex xl:w-[248px]">
        <div className="xl:hidden"><Brand compact /></div>
        <div className="hidden xl:block"><Brand /></div>
        <form action="/projects" className="hidden px-3 pt-3 xl:block">
          <label className="flex h-9 items-center gap-2 rounded-[4px] border border-sidebar-rule bg-white/[0.06] px-2.5 text-sidebar-graph focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-weld">
            <DesignIcon name="search" size={16} />
            <input type="search" name="q" placeholder="Search…" aria-label="Search projects" className="min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-sidebar-graph" />
            <kbd className="rounded-[3px] border border-[#3a4049] px-1 font-mono text-[10px]">⌘K</kbd>
          </label>
        </form>
        <div className="flex-1 overflow-y-auto py-4 xl:hidden"><VisibleNav profile={profile} compact /></div>
        <div className="hidden flex-1 overflow-y-auto py-5 xl:block"><VisibleNav profile={profile} /></div>
        <div className="hidden xl:block"><SidebarControls /></div>
        <div className="xl:hidden"><Account profile={profile} compact /></div>
        <div className="hidden xl:block"><Account profile={profile} /></div>
      </aside>

      {menuOpen && (
        <div className="print-hidden fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button type="button" className="absolute inset-0 bg-black/60" onClick={() => setMenuOpen(false)} aria-label="Close navigation" />
          <aside className="coast-sidebar relative flex h-full w-[min(86vw,320px)] flex-col border-r shadow-2xl">
            <div className="relative">
              <Brand />
              <button type="button" onClick={() => setMenuOpen(false)} className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-[4px] border border-sidebar-rule text-sidebar-graph" aria-label="Close navigation">×</button>
            </div>
            <div className="flex-1 overflow-y-auto py-5"><VisibleNav profile={profile} onNavigate={() => setMenuOpen(false)} /></div>
            <SidebarControls />
            <Account profile={profile} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="print-hidden flex h-14 items-center gap-2 border-b border-sidebar-rule bg-sidebar px-2 text-white md:hidden">
          <button type="button" onClick={() => setMenuOpen(true)} className="flex h-11 w-11 items-center justify-center rounded-[4px]" aria-label="Menu"><DesignIcon name="menu" size={20} /></button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/quantum-lockup-white.png" alt="Quantum Marine" className="h-[26px] w-[125px] object-contain" />
          {canViewPurchasing(profile.role) && <Link href="/inventory/price-alerts" aria-label={`Supplier price alerts: ${priceAlertCount} open`} className="relative ml-auto flex h-11 w-11 items-center justify-center rounded-[4px]"><DesignIcon name="bell" size={18} />{priceAlertCount > 0 && <span className="absolute right-[8px] top-[6px] min-w-4 rounded-full bg-[#e5242b] px-0.5 text-center font-mono text-[10px] text-white">{priceAlertCount > 99 ? "99+" : priceAlertCount}</span>}</Link>}
        </div>
        <header className="print-hidden flex h-[52px] items-center gap-2.5 border-b border-rule px-3 md:h-14 md:px-4 xl:hidden">
          <h1 className="min-w-0 flex-1 truncate font-display text-xl font-medium text-ink md:text-[22px]">{title}</h1>
          <button type="button" onClick={() => setSearchOpen((open) => !open)} aria-label="Search" className="flex h-11 w-11 items-center justify-center rounded-[4px] border border-rule bg-paper text-ink"><DesignIcon name="search" size={18} /></button>
          <button type="button" aria-label="Filters" onClick={() => document.getElementById("project-filters")?.scrollIntoView({ behavior: "smooth" })} className="hidden h-11 w-11 items-center justify-center rounded-[4px] border border-rule bg-paper text-ink md:flex"><DesignIcon name="filter" size={18} /></button>
        </header>
        {searchOpen && (
          <form action="/projects" className="print-hidden border-b border-rule bg-paper p-3 xl:hidden">
            <label className="flex h-11 items-center gap-2 rounded-[4px] border border-rule px-3"><DesignIcon name="search" size={17} /><input autoFocus type="search" name="q" aria-label="Search projects" placeholder="Search projects…" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
          </form>
        )}
        <main className="app-content flex-1">{children}</main>
      </div>
      <BottomNav profile={profile} onMore={() => setMenuOpen(true)} />
    </div>
  );
}
