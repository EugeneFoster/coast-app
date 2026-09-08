"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Archive,
  Boxes,
  BriefcaseBusiness,
  CalendarDays,
  ClipboardList,
  Factory,
  FolderKanban,
  HandCoins,
  LibraryBig,
  Menu,
  MessageSquare,
  PackageSearch,
  Search,
  Settings,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { ApprovalsBell } from "@/components/approvals-bell";
import type { Profile } from "@/lib/types";
import { signOut } from "@/lib/actions/session";
import {
  canManageOperations,
  canProposeSupplierChange,
  canViewBilling,
  canViewCounterSales,
  canViewInventory,
  canViewPaintYard,
  canViewSales,
  userRoleLabel,
} from "@/lib/employee-roles";
import { ThemeToggle } from "@/components/theme-provider";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  permission?: (profile: Profile) => boolean;
};

const navGroups: Array<{ title: string; items: NavItem[] }> = [
  {
    title: "Workspace",
    items: [
      { href: "/projects", label: "Projects", icon: FolderKanban },
      { href: "/my-day", label: "My day", icon: Sparkles },
    ],
  },
  {
    title: "Operations",
    items: [
      { href: "/work-orders", label: "Work orders", icon: ClipboardList },
      { href: "/paint-yard", label: "Paint yard", icon: Factory, permission: (profile) => canViewPaintYard(profile.role) },
      { href: "/schedule", label: "Team schedule", icon: CalendarDays, permission: (profile) => canManageOperations(profile.role) },
    ],
  },
  {
    title: "Commerce",
    items: [
      { href: "/inventory", label: "Inventory", icon: PackageSearch, permission: (profile) => canViewInventory(profile.role) },
      { href: "/sales", label: "Sales CRM", icon: BriefcaseBusiness, permission: (profile) => canViewSales(profile.role) },
      { href: "/billing", label: "Billing", icon: HandCoins, permission: (profile) => canViewBilling(profile.role) },
      { href: "/counter-sales", label: "Counter sales", icon: ShoppingCart, permission: (profile) => canViewCounterSales(profile.role) },
    ],
  },
  {
    title: "Reference",
    items: [
      { href: "/chat", label: "Chat", icon: MessageSquare },
      { href: "/library", label: "Library", icon: LibraryBig },
      { href: "/archive", label: "Archive", icon: Archive },
    ],
  },
  { title: "System", items: [{ href: "/settings", label: "Settings", icon: Settings }] },
];

const routeNames: Record<string, { section: string; label: string }> = {
  projects: { section: "Workspace", label: "Projects" },
  "my-day": { section: "Workspace", label: "My day" },
  "work-orders": { section: "Operations", label: "Work orders" },
  "paint-yard": { section: "Operations", label: "Paint yard" },
  schedule: { section: "Operations", label: "Team schedule" },
  inventory: { section: "Operations", label: "Inventory" },
  sales: { section: "Commerce", label: "Sales CRM" },
  billing: { section: "Commerce", label: "Billing" },
  "counter-sales": { section: "Commerce", label: "Counter sales" },
  chat: { section: "Reference", label: "Chat" },
  library: { section: "Reference", label: "Library" },
  archive: { section: "Reference", label: "Archive" },
  settings: { section: "System", label: "Settings" },
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
  return pathname === href || (href !== "/settings" && pathname.startsWith(`${href}/`));
}

function VisibleNav({ profile, compact = false, onNavigate }: { profile: Profile; compact?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className={`flex flex-col ${compact ? "gap-1 px-2" : "gap-5 px-3"}`}>
      {navGroups.map((group) => {
        const items = group.items.filter((item) => !item.permission || item.permission(profile));
        if (!items.length) return null;
        return (
          <div key={group.title} className="flex flex-col gap-0.5">
            {!compact && (
              <p className="mb-1 px-3 font-mono text-[10px] uppercase tracking-[0.16em] text-graph">{group.title}</p>
            )}
            {items.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={compact ? item.label : undefined}
                  onClick={onNavigate}
                  className={`relative flex min-h-10 items-center rounded-[4px] text-sm transition-colors ${compact ? "justify-center px-2" : "gap-2.5 px-3"} ${active ? "bg-weld/10 font-medium text-weld-text" : "text-graph hover:bg-ink/5 hover:text-ink"}`}
                >
                  {active && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 bg-weld" />}
                  <Icon size={18} strokeWidth={1.5} aria-hidden />
                  {!compact && <span className="flex-1">{item.label}</span>}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex items-center border-b border-rule ${compact ? "justify-center py-5" : "gap-3 px-5 py-5"}`}>
      <span className="h-8 w-1 shrink-0 bg-weld" />
      {!compact && (
        <div>
          <p className="font-display text-[21px] font-medium uppercase tracking-[0.26em] text-ink">COAST</p>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-graph">metal works</p>
        </div>
      )}
    </div>
  );
}

function Account({ profile, compact = false }: { profile: Profile; compact?: boolean }) {
  return (
    <div className={`border-t border-rule ${compact ? "p-3" : "p-4"}`}>
      <div className={`flex items-center ${compact ? "justify-center" : "gap-2.5"}`}>
        {profile.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatar_url} alt="" width={36} height={36} className="h-9 w-9 rounded-full object-cover" />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink/10 font-mono text-xs font-medium text-ink">{initials(profile)}</div>
        )}
        {!compact && (
          <>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-ink">{profile.full_name ?? profile.login}</p>
              <p className="truncate text-xs text-graph">{userRoleLabel(profile.role)}</p>
            </div>
            <Link href="/settings" aria-label="Account settings" className="flex h-9 w-9 items-center justify-center rounded-[4px] border border-rule text-graph hover:text-ink">
              <SlidersHorizontal size={17} strokeWidth={1.5} aria-hidden />
            </Link>
          </>
        )}
      </div>
      {!compact && (
        <form action={signOut} className="mt-2 pl-[46px]">
          <button type="submit" className="text-xs text-graph hover:text-ink">Sign out</button>
        </form>
      )}
    </div>
  );
}

function Topbar({ profile, onOpenMenu }: { profile: Profile; onOpenMenu: () => void }) {
  const pathname = usePathname();
  const segment = pathname.split("/").filter(Boolean)[0] ?? "projects";
  const current = routeNames[segment] ?? { section: "Workspace", label: "COAST" };

  return (
    <header className="print-hidden sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-rule bg-bone px-3 md:px-4 xl:px-6">
      <button type="button" onClick={onOpenMenu} className="flex h-11 w-11 items-center justify-center rounded-[4px] border border-rule bg-paper text-ink md:hidden" aria-label="Open navigation">
        <Menu size={20} strokeWidth={1.5} aria-hidden />
      </button>
      <p className="min-w-0 flex-1 truncate font-display text-xl font-medium text-ink md:hidden">{current.label}</p>
      <p className="hidden shrink-0 font-mono text-[11px] uppercase tracking-[0.12em] text-graph lg:block">{current.section} / <span className="text-ink">{current.label}</span></p>
      <div className="hidden flex-1 justify-center lg:flex">
        <label className="flex h-9 w-full max-w-[400px] items-center gap-2 rounded-[4px] border border-rule bg-paper px-3 text-graph focus-within:border-weld focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-weld/30">
          <Search size={17} strokeWidth={1.5} aria-hidden />
          <input type="search" aria-label="Search workspace" placeholder="Search projects, work orders, SKUs…" className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-graph" />
          <kbd className="rounded-[3px] border border-rule px-1.5 py-0.5 font-mono text-[10px] text-graph">⌘K</kbd>
        </label>
      </div>
      {canProposeSupplierChange(profile.role) && <ApprovalsBell />}
      <button type="button" className="flex h-11 w-11 items-center justify-center rounded-[4px] border border-rule bg-paper text-ink sm:hidden" aria-label="Search">
        <Search size={19} strokeWidth={1.5} aria-hidden />
      </button>
      <div className="hidden sm:block"><ThemeToggle /></div>
    </header>
  );
}

function MobileBottomNav({ profile, onMore }: { profile: Profile; onMore: () => void }) {
  const pathname = usePathname();
  const candidates: NavItem[] = [
    { href: "/projects", label: "Projects", icon: FolderKanban },
    { href: "/my-day", label: "My day", icon: Sparkles },
    { href: "/work-orders", label: "Orders", icon: ClipboardList },
    { href: "/inventory", label: "Stock", icon: Boxes, permission: (p) => canViewInventory(p.role) },
  ];

  return (
    <nav className="print-hidden fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-rule bg-paper px-1 pb-[max(10px,env(safe-area-inset-bottom))] pt-1.5 md:hidden">
      {candidates.map((item) => {
        const Icon = item.icon;
        const href = !item.permission || item.permission(profile) ? item.href : "/library";
        const active = isActive(pathname, href);
        return (
          <Link key={item.label} href={href} className={`flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-[4px] text-[10px] ${active ? "font-medium text-weld-text" : "text-graph"}`}>
            <Icon size={19} strokeWidth={1.5} aria-hidden />
            <span>{item.label}</span>
          </Link>
        );
      })}
      <button type="button" onClick={onMore} className="flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-[4px] text-[10px] text-graph">
        <Menu size={19} strokeWidth={1.5} aria-hidden />
        <span>More</span>
      </button>
    </nav>
  );
}

export function AppShell({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-bone text-ink">
      <aside className="print-hidden sticky top-0 hidden h-screen w-[76px] shrink-0 flex-col border-r border-rule bg-paper md:flex xl:w-[248px]">
        <div className="xl:hidden"><Brand compact /></div>
        <div className="hidden xl:block"><Brand /></div>
        <div className="flex-1 overflow-y-auto py-4 xl:hidden"><VisibleNav profile={profile} compact /></div>
        <div className="hidden flex-1 overflow-y-auto py-5 xl:block"><VisibleNav profile={profile} /></div>
        <div className="xl:hidden"><Account profile={profile} compact /></div>
        <div className="hidden xl:block"><Account profile={profile} /></div>
      </aside>

      {menuOpen && (
        <div className="print-hidden fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button type="button" className="absolute inset-0 bg-ink/45" onClick={() => setMenuOpen(false)} aria-label="Close navigation" />
          <aside className="relative flex h-full w-[min(86vw,320px)] flex-col border-r border-rule bg-paper shadow-2xl">
            <div className="relative">
              <Brand />
              <button type="button" onClick={() => setMenuOpen(false)} className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-[4px] border border-rule text-graph" aria-label="Close navigation">
                <X size={18} strokeWidth={1.5} aria-hidden />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-5"><VisibleNav profile={profile} onNavigate={() => setMenuOpen(false)} /></div>
            <Account profile={profile} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar profile={profile} onOpenMenu={() => setMenuOpen(true)} />
        <main className="app-content flex-1">{children}</main>
      </div>
      <MobileBottomNav profile={profile} onMore={() => setMenuOpen(true)} />
    </div>
  );
}
