"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import type { Profile, UserRole } from "@/lib/types";
import { signOut } from "@/lib/actions/session";
import {
  canViewBilling,
  canViewCounterSales,
  canViewInventory,
  canViewSales,
  canManageOperations,
  canViewPaintYard,
  canProposeSupplierChange,
  userRoleLabel,
} from "@/lib/employee-roles";

/* ── Icons ──────────────────────────────────────────────────────────────
   One stroke family, currentColor, 18px on a 24px grid. */
type IconProps = { className?: string };
const svg = (paths: React.ReactNode) =>
  function Icon({ className }: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden
      >
        {paths}
      </svg>
    );
  };

const IconProjects = svg(
  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
);
const IconDay = svg(
  <>
    <rect x="3" y="4" width="18" height="17" rx="2" />
    <path d="M3 9h18M8 2v4M16 2v4" />
  </>,
);
const IconWorkOrders = svg(
  <>
    <path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1z" />
    <path d="M8 6H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2" />
    <path d="M9 12h6M9 16h4" />
  </>,
);
const IconPaint = svg(
  <path d="M12 3s6 6.5 6 10a6 6 0 0 1-12 0c0-3.5 6-10 6-10z" />,
);
const IconSchedule = svg(
  <>
    <circle cx="9" cy="8" r="3" />
    <path d="M3 20a6 6 0 0 1 12 0" />
    <path d="M16 6a3 3 0 0 1 0 6M18 20a6 6 0 0 0-3-5.2" />
  </>,
);
const IconInventory = svg(
  <>
    <path d="M3 8l9-4 9 4-9 4-9-4z" />
    <path d="M3 8v8l9 4 9-4V8" />
    <path d="M12 12v8" />
  </>,
);
const IconSales = svg(
  <>
    <path d="M3 17l6-6 4 4 8-8" />
    <path d="M21 7v5h-5" />
  </>,
);
const IconBilling = svg(
  <>
    <path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
    <path d="M14 3v5h5M9 13h6M9 17h6" />
  </>,
);
const IconCounter = svg(
  <>
    <path d="M6 3h12l1 18-7-2-7 2z" />
    <path d="M9 8h6M9 12h6" />
  </>,
);
const IconApprovals = svg(
  <>
    <path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" />
    <path d="M10 20a2 2 0 0 0 4 0" />
    <path d="M9.5 8.5l1.8 1.8L15 6.5" />
  </>,
);
const IconChat = svg(
  <path d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />,
);
const IconLibrary = svg(
  <>
    <path d="M4 5a1 1 0 0 1 1-1h5v16H5a1 1 0 0 1-1-1z" />
    <path d="M10 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5" />
    <path d="M18 6l2 .5-3 13-2-.5" />
  </>,
);
const IconArchive = svg(
  <>
    <rect x="3" y="4" width="18" height="4" rx="1" />
    <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" />
  </>,
);
const IconSettings = svg(
  <>
    <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="8" cy="17" r="2" />
  </>,
);

/* ── Navigation model ───────────────────────────────────────────────────── */
type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<IconProps>;
  /** When present, the item shows only if this returns true for the role. */
  gate?: (role: UserRole) => boolean;
  /** Key into the counts map for a badge. */
  countKey?: string;
};

const NAV_GROUPS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: "Work",
    items: [
      { href: "/projects", label: "Projects", icon: IconProjects },
      { href: "/my-day", label: "My day", icon: IconDay },
      { href: "/work-orders", label: "Work orders", icon: IconWorkOrders },
    ],
  },
  {
    title: "Operations",
    items: [
      { href: "/paint-yard", label: "Paint yard", icon: IconPaint, gate: canViewPaintYard },
      { href: "/schedule", label: "Team schedule", icon: IconSchedule, gate: canManageOperations },
      { href: "/inventory", label: "Inventory", icon: IconInventory, gate: canViewInventory },
    ],
  },
  {
    title: "Commerce",
    items: [
      { href: "/sales", label: "Sales CRM", icon: IconSales, gate: canViewSales },
      { href: "/billing", label: "Billing", icon: IconBilling, gate: canViewBilling },
      { href: "/counter-sales", label: "Counter sales", icon: IconCounter, gate: canViewCounterSales },
      {
        href: "/approvals",
        label: "Approvals",
        icon: IconApprovals,
        gate: canProposeSupplierChange,
        countKey: "approvals",
      },
    ],
  },
  {
    title: "Workspace",
    items: [
      { href: "/chat", label: "Chat", icon: IconChat },
      { href: "/library", label: "Library", icon: IconLibrary },
      { href: "/archive", label: "Archive", icon: IconArchive },
      { href: "/settings", label: "Settings", icon: IconSettings },
    ],
  },
];

function initials(profile: Profile) {
  if (profile.full_name) {
    return profile.full_name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }
  return profile.login.slice(0, 2).toUpperCase();
}

export function Sidebar({
  profile,
  counts = {},
}: {
  profile: Profile;
  isAdminUser?: boolean;
  counts?: Record<string, number>;
}) {
  const pathname = usePathname();
  const role = profile.role;

  const isActive = (href: string) =>
    pathname === href || (href !== "/settings" && pathname.startsWith(href));

  return (
    <aside className="print-hidden sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-rule bg-paper text-ink">
      {/* Brand — weld accent bar + wordmark. */}
      <div className="flex items-center gap-3 px-5 py-6">
        <span className="h-9 w-1 rounded-full bg-weld" aria-hidden />
        <div className="leading-none">
          <p className="font-display text-2xl font-medium uppercase tracking-[0.22em] text-ink">
            COAST
          </p>
          <p className="mt-1.5 text-[0.6rem] uppercase tracking-[0.28em] text-graph">
            metal works
          </p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 pb-4">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((item) => !item.gate || item.gate(role));
          if (items.length === 0) return null;
          return (
            <div key={group.title}>
              <p className="kicker px-3 pb-1.5">{group.title}</p>
              <div className="flex flex-col gap-0.5">
                {items.map((item) => {
                  const active = isActive(item.href);
                  const Icon = item.icon;
                  const count = item.countKey ? counts[item.countKey] : undefined;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`group relative flex items-center gap-3 rounded-md px-3 py-2 text-[0.95rem] transition-colors ${
                        active
                          ? "bg-ink/[0.06] font-medium text-ink"
                          : "text-graph hover:bg-ink/[0.04] hover:text-ink"
                      }`}
                    >
                      {active && (
                        <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-weld" />
                      )}
                      <Icon
                        className={`h-[18px] w-[18px] shrink-0 ${
                          active ? "text-weld" : "text-graph group-hover:text-ink"
                        }`}
                      />
                      <span className="flex-1 truncate">{item.label}</span>
                      {count !== undefined && count > 0 && (
                        <span
                          className={`count-badge ${
                            item.countKey === "approvals" ? "count-badge-weld" : ""
                          }`}
                        >
                          {count > 99 ? "99+" : count}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-rule px-5 py-5">
        <div className="flex items-center gap-3">
          {profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatar_url}
              alt=""
              width={36}
              height={36}
              className="h-9 w-9 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-ink/10 font-mono text-xs font-medium text-ink">
              {initials(profile)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">
              {profile.full_name ?? profile.login}
            </p>
            <p className="truncate text-xs text-graph">{userRoleLabel(role)}</p>
          </div>
        </div>
        <form action={signOut} className="mt-3">
          <button
            type="submit"
            className="w-full rounded px-3 py-1.5 text-left text-xs text-graph transition-colors hover:bg-ink/5 hover:text-ink"
          >
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
