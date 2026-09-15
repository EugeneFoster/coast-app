import { InventoryNav } from "@/components/inventory-nav";
import { requireInventoryViewer } from "@/lib/auth";
import { canViewPurchasing } from "@/lib/employee-roles";

export default async function InventoryLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { profile } = await requireInventoryViewer();

  return (
    <div className="px-3 pb-8 pt-3 md:px-4 md:pt-4 xl:px-6 xl:pb-10 xl:pt-6">
      <header className="hidden md:block">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-weld-text">Parts & warehouse</p>
        <h1 className="mt-2 font-display text-[28px] font-medium leading-none text-ink">Inventory</h1>
        <p className="mt-2 max-w-2xl text-[13px] leading-5 text-graph">
          Parts catalog, live stock, supplier purchasing, and traceable project usage.
        </p>
        <InventoryNav canViewPurchasing={canViewPurchasing(profile.role)} />
      </header>
      <div className="md:hidden">
        <InventoryNav canViewPurchasing={canViewPurchasing(profile.role)} />
      </div>
      {children}
    </div>
  );
}
