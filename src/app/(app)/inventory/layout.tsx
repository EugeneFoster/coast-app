import { InventoryNav } from "@/components/inventory-nav";
import { requireInventoryViewer } from "@/lib/auth";
import { canViewPurchasing } from "@/lib/employee-roles";

export default async function InventoryLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { profile } = await requireInventoryViewer();

  return (
    <div className="mx-auto max-w-7xl px-8 pb-12 pt-8">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-weld">Parts & warehouse</p>
        <h1 className="mt-2 font-display text-3xl font-medium text-ink">Inventory</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-graph">
          Parts catalog, live stock, supplier purchasing, and traceable project usage.
        </p>
        <InventoryNav canViewPurchasing={canViewPurchasing(profile.role)} />
      </header>
      {children}
    </div>
  );
}
