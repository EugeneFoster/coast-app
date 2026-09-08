import { InventoryNav } from "@/components/inventory-nav";
import { InventoryAutoSync } from "@/components/inventory-auto-sync";
import { requireInventoryViewer } from "@/lib/auth";
import { canManageInventory, canViewPurchasing } from "@/lib/employee-roles";
import { createClient } from "@/lib/supabase/server";

export default async function InventoryLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { profile } = await requireInventoryViewer();
  const showPurchasing = canViewPurchasing(profile.role);
  const supabase = await createClient();
  const { count: inboundOrders } = showPurchasing
    ? await supabase
        .from("purchase_orders")
        .select("id", { count: "exact", head: true })
        .in("status", ["ordered", "partially_received"])
    : { count: 0 };

  return (
    <div className="px-3 pb-8 pt-3 md:px-4 md:pt-4 xl:px-6 xl:pb-10 xl:pt-6">
      <InventoryAutoSync enabled={canManageInventory(profile.role)} />
      <header className="hidden md:block">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-weld-text">Parts & warehouse</p>
        <h1 className="mt-2 font-display text-[28px] font-medium leading-none text-ink">Inventory</h1>
        <p className="mt-2 max-w-2xl text-[13px] leading-5 text-graph">
          Parts catalog, live stock, supplier purchasing, and traceable project usage.
        </p>
        <InventoryNav canViewPurchasing={showPurchasing} inboundOrders={inboundOrders ?? 0} />
      </header>
      <div className="md:hidden">
        <InventoryNav canViewPurchasing={showPurchasing} inboundOrders={inboundOrders ?? 0} />
      </div>
      {children}
    </div>
  );
}
