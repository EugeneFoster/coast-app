"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/inventory", label: "Stock", exact: true },
  { href: "/inventory/suppliers", label: "Suppliers", purchasing: true },
  {
    href: "/inventory/purchase-orders",
    label: "Purchase orders",
    purchasing: true,
  },
];

export function InventoryNav({ canViewPurchasing }: { canViewPurchasing: boolean }) {
  const pathname = usePathname();

  return (
    <nav className="mt-6 flex flex-wrap gap-2 border-b border-rule pb-3">
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
              className={`rounded px-3 py-2 text-sm transition-colors ${
                active ? "bg-ink text-bone" : "text-graph hover:bg-ink/5 hover:text-ink"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
    </nav>
  );
}
