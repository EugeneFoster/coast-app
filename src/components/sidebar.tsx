"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Profile } from "@/lib/types";
import { signOut } from "@/lib/actions/session";
import {
  canViewBilling,
  canViewCounterSales,
  canViewInventory,
  canViewSales,
  canManageOperations,
  userRoleLabel,
} from "@/lib/employee-roles";

const navItems: Array<{
  href: string;
  label: string;
  adminOnly?: boolean;
  salesOnly?: boolean;
  inventoryOnly?: boolean;
  billingOnly?: boolean;
  counterSalesOnly?: boolean;
  operationsManagerOnly?: boolean;
}> = [
  { href: "/projects", label: "Projects" },
  { href: "/my-day", label: "My day" },
  { href: "/work-orders", label: "Work orders" },
  { href: "/schedule", label: "Team schedule", operationsManagerOnly: true },
  { href: "/inventory", label: "Inventory", inventoryOnly: true },
  { href: "/sales", label: "Sales CRM", salesOnly: true },
  { href: "/billing", label: "Billing", billingOnly: true },
  { href: "/counter-sales", label: "Counter sales", counterSalesOnly: true },
  { href: "/chat", label: "Chat" },
  { href: "/library", label: "Library" },
  { href: "/archive", label: "Archive" },
  { href: "/settings", label: "Settings" },
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
  isAdminUser,
}: {
  profile: Profile;
  isAdminUser: boolean;
}) {
  const pathname = usePathname();
  const admin = isAdminUser;

  return (
    <aside className="print-hidden sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-rule bg-paper text-ink">
      <div className="px-6 py-7">
        <p className="font-display text-2xl font-medium uppercase tracking-[0.3em] text-ink">
          COAST
        </p>
        <p className="mt-1.5 text-[0.65rem] tracking-[0.2em] text-graph">
          metal works
        </p>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-4 py-2">
        {navItems
          .filter(
            (item) =>
              (!item.adminOnly || admin) &&
              (!item.salesOnly || canViewSales(profile.role)) &&
              (!item.inventoryOnly || canViewInventory(profile.role)) &&
              (!item.billingOnly || canViewBilling(profile.role)) &&
              (!item.counterSalesOnly || canViewCounterSales(profile.role)) &&
              (!item.operationsManagerOnly || canManageOperations(profile.role)),
          )
          .map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/settings" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative rounded px-3 py-2.5 text-[0.95rem] transition-colors ${
                  active
                    ? "font-medium text-weld"
                    : "text-graph hover:bg-ink/5 hover:text-ink"
                }`}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-weld" />
                )}
                {item.label}
              </Link>
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
            <p className="truncate text-xs text-graph">
              {userRoleLabel(profile.role)}
            </p>
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
