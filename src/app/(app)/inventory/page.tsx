import Link from "next/link";
import { requireInventoryViewer } from "@/lib/auth";
import {
  canManageInventory,
  canViewPurchasing,
} from "@/lib/employee-roles";
import {
  formatQuantity,
  inventoryCategoryLabel,
} from "@/lib/inventory";
import { formatCad } from "@/lib/sales";
import { createClient } from "@/lib/supabase/server";
import type { InventoryItem } from "@/lib/types";

type InventoryRow = InventoryItem & {
  suppliers: { name: string } | null;
};

export default async function InventoryPage() {
  const { profile } = await requireInventoryViewer();
  const canManage = canManageInventory(profile.role);
  const showCost = canViewPurchasing(profile.role);
  const supabase = await createClient();
  const { data } = await supabase
    .from("inventory_items")
    .select("*, suppliers(name)")
    .order("active", { ascending: false })
    .order("name");
  const items = (data ?? []) as InventoryRow[];
  const activeItems = items.filter((item) => item.active);
  const lowStock = activeItems.filter(
    (item) => Number(item.quantity_on_hand) <= Number(item.reorder_point),
  );
  const inventoryValue = activeItems.reduce(
    (sum, item) => sum + Number(item.quantity_on_hand) * Number(item.average_cost),
    0,
  );

  return (
    <main className="mt-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-medium text-ink">Stock catalog</h2>
          <p className="mt-1 text-sm text-graph">{activeItems.length} active SKUs</p>
        </div>
        {canManage && (
          <Link href="/inventory/items/new" className="btn-primary px-4 py-2 text-sm">
            + New inventory item
          </Link>
        )}
      </div>

      <div className={`mt-6 grid gap-4 ${showCost ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        <div className="rounded border border-rule bg-paper p-4">
          <p className="text-xs uppercase tracking-wide text-graph">Active items</p>
          <p className="mt-2 font-mono text-2xl text-ink">{activeItems.length}</p>
        </div>
        <div className="rounded border border-rule bg-paper p-4">
          <p className="text-xs uppercase tracking-wide text-graph">At / below reorder</p>
          <p className={`mt-2 font-mono text-2xl ${lowStock.length ? "text-weld" : "text-ink"}`}>
            {lowStock.length}
          </p>
        </div>
        {showCost && (
          <div className="rounded border border-rule bg-paper p-4">
            <p className="text-xs uppercase tracking-wide text-graph">Stock value</p>
            <p className="mt-2 font-mono text-2xl text-ink">{formatCad(inventoryValue)}</p>
          </div>
        )}
      </div>

      <div className="mt-6 overflow-x-auto rounded border border-rule bg-paper">
        <table className="w-full min-w-[56rem] border-collapse text-left text-sm">
          <thead className="border-b border-rule bg-ink/[0.03] text-xs uppercase tracking-wide text-graph">
            <tr>
              <th className="px-4 py-3 font-medium">SKU / item</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Location</th>
              <th className="px-4 py-3 text-right font-medium">On hand</th>
              <th className="px-4 py-3 text-right font-medium">Reorder</th>
              {showCost && <th className="px-4 py-3 text-right font-medium">Avg. cost</th>}
              <th className="px-4 py-3 text-right font-medium">Sell</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const low =
                item.active &&
                Number(item.quantity_on_hand) <= Number(item.reorder_point);
              return (
                <tr
                  key={item.id}
                  className={`border-b border-rule last:border-0 ${item.active ? "" : "opacity-55"}`}
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/inventory/items/${item.id}`}
                      className="font-medium text-ink hover:text-weld"
                    >
                      {item.name}
                    </Link>
                    <p className="mt-0.5 font-mono text-xs text-graph">
                      {item.sku}{item.suppliers?.name ? ` · ${item.suppliers.name}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-graph">
                    {inventoryCategoryLabel(item.category)}
                  </td>
                  <td className="px-4 py-3 text-graph">{item.location ?? "—"}</td>
                  <td className={`px-4 py-3 text-right font-mono ${low ? "font-medium text-weld" : "text-ink"}`}>
                    {formatQuantity(item.quantity_on_hand, item.unit)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-graph">
                    {formatQuantity(item.reorder_point, item.unit)}
                  </td>
                  {showCost && (
                    <td className="px-4 py-3 text-right font-mono text-ink">
                      {formatCad(item.average_cost)}
                    </td>
                  )}
                  <td className="px-4 py-3 text-right font-mono text-ink">
                    {item.selling_price === null ? "—" : formatCad(item.selling_price)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {items.length === 0 && (
          <p className="px-4 py-12 text-center text-sm text-graph">
            No inventory items yet. Add the first SKU to begin receiving stock.
          </p>
        )}
      </div>
    </main>
  );
}
