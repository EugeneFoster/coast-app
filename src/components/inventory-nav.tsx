"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/inventory", label: "Stock", exact: true },
  { href: "/inventory/suppliers", label: "Suppliers", purchasing: true },
  { href: "/inventory/price-alerts", label: "Price alerts", purchasing: true },
  {
    href: "/inventory/purchase-orders",
    label: "Purchase orders",
    purchasing: true,
  },
];

export function InventoryNav({ canViewPurchasing, priceAlertCount }: { canViewPurchasing: boolean; priceAlertCount: number | null }) {
  const pathname = usePathname();

  return (
    <nav className="-mx-3 flex gap-1 overflow-x-auto border-b border-rule px-3 md:mx-0 md:mt-5 md:px-0">
      {links
        .filter((link) => !link.purchasing || canViewPurchasing)
        .map((link) => {
          const active = link.exact
            ? pathname === link.href || pathname.startsWith("/inventory/items/")
            : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`relative flex min-h-10 shrink-0 items-center px-3 pb-3 text-sm transition-colors ${
                active ? "font-medium text-ink" : "text-graph hover:text-ink"
              }`}
            >
              {link.label}
              {link.href === "/inventory/price-alerts" && priceAlertCount !== null && (
                <span className="ml-1.5 rounded-[3px] border border-rule px-1.5 py-0.5 font-mono text-[11px] leading-none text-graph" aria-label={`${priceAlertCount} available for review`}>
                  {priceAlertCount}
                </span>
              )}
              {active && (
                <span className="absolute bottom-[-1px] left-0 h-0.5 w-full bg-weld" />
              )}
            </Link>
          );
        })}
    </nav>
  );
}
