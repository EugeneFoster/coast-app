import Link from "next/link";
import { notFound } from "next/navigation";
import { InventoryAdjustmentForm } from "@/components/inventory-adjustment-form";
import { InventoryItemForm } from "@/components/inventory-item-form";
import { requireInventoryViewer } from "@/lib/auth";
import {
  canManageInventory,
  canViewPurchasing,
} from "@/lib/employee-roles";
import { getSupplierOptions } from "@/lib/inventory-data";
import {
  formatQuantity,
  inventoryCategoryLabel,
  inventoryMovementLabel,
  inventoryMovementSign,
} from "@/lib/inventory";
import { formatCad, formatShortDate } from "@/lib/sales";
import { createClient } from "@/lib/supabase/server";
import type { InventoryItem, InventoryMovement } from "@/lib/types";

type ItemRow = InventoryItem & {
  suppliers: { name: string } | null;
};

export default async function InventoryItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  const { profile } = await requireInventoryViewer();
  const canManage = canManageInventory(profile.role);
  const showPurchasing = canViewPurchasing(profile.role);
  const supabase = await createClient();
  const { data } = await supabase
    .from("inventory_items")
    .select("*, suppliers(name)")
    .eq("id", itemId)
    .maybeSingle();
  if (!data) notFound();
  const item = data as ItemRow;

  const [suppliers, movementResult] = await Promise.all([
    canManage ? getSupplierOptions() : Promise.resolve([]),
    showPurchasing
      ? supabase
          .from("inventory_movements")
          .select("*")
          .eq("inventory_item_id", itemId)
          .order("occurred_at", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [] }),
  ]);
  const movements = (movementResult.data ?? []) as InventoryMovement[];
  const inventoryValue = Number(item.quantity_on_hand) * Number(item.average_cost);
  const lowStock =
    item.active && Number(item.quantity_on_hand) <= Number(item.reorder_point);

  return (
    <main className="mt-7">
      <Link href="/inventory" className="text-sm text-graph hover:text-ink">
        ← Stock catalog
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-2xl font-medium text-ink">{item.name}</h2>
            <span
              className={`rounded border px-2 py-1 text-xs ${
                item.active ? "border-rule text-ink" : "border-rule text-graph opacity-70"
              }`}
            >
              {item.active ? "Active" : "Inactive"}
            </span>
          </div>
          <p className="mt-2 font-mono text-xs text-graph">{item.sku}</p>
        </div>
        <span className="rounded bg-ink/5 px-3 py-2 text-sm text-graph">
          {inventoryCategoryLabel(item.category)}
        </span>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded border border-rule bg-paper p-4">
          <p className="text-xs uppercase tracking-wide text-graph">On hand</p>
          <p className={`mt-2 font-mono text-xl ${lowStock ? "text-weld" : "text-ink"}`}>
            {formatQuantity(item.quantity_on_hand, item.unit)}
          </p>
        </div>
        <div className="rounded border border-rule bg-paper p-4">
          <p className="text-xs uppercase tracking-wide text-graph">Reorder point</p>
          <p className="mt-2 font-mono text-xl text-ink">
            {formatQuantity(item.reorder_point, item.unit)}
          </p>
        </div>
        <div className="rounded border border-rule bg-paper p-4">
          <p className="text-xs uppercase tracking-wide text-graph">Average cost</p>
          <p className="mt-2 font-mono text-xl text-ink">
            {showPurchasing ? formatCad(item.average_cost) : "Restricted"}
          </p>
        </div>
        <div className="rounded border border-rule bg-paper p-4">
          <p className="text-xs uppercase tracking-wide text-graph">Stock value</p>
          <p className="mt-2 font-mono text-xl text-ink">
            {showPurchasing ? formatCad(inventoryValue) : "Restricted"}
          </p>
        </div>
      </div>

      <section className="mt-6 rounded border border-rule bg-paper p-5">
        <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs text-graph">Location</dt>
            <dd className="mt-1 text-ink">{item.location ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-graph">Preferred supplier</dt>
            <dd className="mt-1 text-ink">{item.suppliers?.name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-graph">Selling price</dt>
            <dd className="mt-1 font-mono text-ink">
              {item.selling_price === null ? "—" : formatCad(item.selling_price)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-graph">Description</dt>
            <dd className="mt-1 text-ink">{item.description ?? "—"}</dd>
          </div>
        </dl>
      </section>

      {canManage && (
        <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(19rem,1fr)]">
          <section className="rounded border border-rule bg-paper p-6">
            <h3 className="font-display text-xl font-medium text-ink">Item details</h3>
            <div className="mt-5">
              <InventoryItemForm item={item} suppliers={suppliers} />
            </div>
          </section>
          <aside className="rounded border border-rule bg-paper p-5">
            <h3 className="font-display text-xl font-medium text-ink">Stock adjustment</h3>
            <p className="mt-1 text-xs leading-5 text-graph">
              Use for opening balances, counts, damage, or corrections. Purchase receipts and
              project issues have dedicated workflows.
            </p>
            <div className="mt-5">
              <InventoryAdjustmentForm itemId={item.id} unit={item.unit} />
            </div>
          </aside>
        </div>
      )}

      {showPurchasing && (
        <section className="mt-10">
          <div className="flex items-center justify-between gap-4">
            <h3 className="font-display text-xl font-medium text-ink">Stock ledger</h3>
            <span className="text-xs text-graph">Last 100 movements</span>
          </div>
          <div className="mt-4 overflow-x-auto rounded border border-rule bg-paper">
            <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
              <thead className="border-b border-rule bg-ink/[0.03] text-xs uppercase tracking-wide text-graph">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Movement</th>
                  <th className="px-4 py-3 text-right font-medium">Quantity</th>
                  <th className="px-4 py-3 text-right font-medium">Unit cost</th>
                  <th className="px-4 py-3 font-medium">Reference / note</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((movement) => {
                  const sign = inventoryMovementSign(movement.movement_type);
                  return (
                    <tr key={movement.id} className="border-b border-rule last:border-0">
                      <td className="px-4 py-3 font-mono text-xs text-graph">
                        {formatShortDate(movement.occurred_at)}
                      </td>
                      <td className="px-4 py-3 text-ink">
                        {movement.invoice_id
                          ? movement.movement_type === "issue"
                            ? "Sold"
                            : "Sale return"
                          : inventoryMovementLabel(movement.movement_type)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono ${
                          sign < 0 ? "text-weld" : "text-ink"
                        }`}
                      >
                        {sign > 0 ? "+" : "−"}
                        {formatQuantity(movement.quantity, item.unit)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-ink">
                        {formatCad(movement.unit_cost)}
                      </td>
                      <td className="px-4 py-3 text-graph">
                        {movement.invoice_id ? (
                          <Link
                            href={`/billing/${movement.invoice_id}`}
                            className="text-ink hover:text-weld"
                          >
                            Invoice →
                          </Link>
                        ) : movement.work_order_id && movement.project_id ? (
                          <Link
                            href={`/projects/${movement.project_id}/work-orders/${movement.work_order_id}`}
                            className="text-ink hover:text-weld"
                          >
                            Work order →
                          </Link>
                        ) : movement.purchase_order_item_id ? (
                          "Purchase receipt"
                        ) : (
                          movement.note ?? "Adjustment"
                        )}
                        {movement.note && (movement.work_order_id || movement.invoice_id)
                          ? ` · ${movement.note}`
                          : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {movements.length === 0 && (
              <p className="px-4 py-10 text-center text-sm text-graph">
                No stock movements yet.
              </p>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
