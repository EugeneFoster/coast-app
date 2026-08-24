import Link from "next/link";
import { requirePurchasingViewer } from "@/lib/auth";
import { canManageInventory } from "@/lib/employee-roles";
import { purchaseOrderStatusLabel } from "@/lib/inventory";
import { formatCad, formatShortDate } from "@/lib/sales";
import { createClient } from "@/lib/supabase/server";
import type { PurchaseOrder } from "@/lib/types";

type PurchaseOrderRow = PurchaseOrder & {
  suppliers: { name: string } | null;
};

const statusClass: Record<PurchaseOrder["status"], string> = {
  draft: "border-rule text-graph",
  ordered: "border-ink/30 text-ink",
  partially_received: "border-weld text-weld",
  received: "border-ink bg-ink text-bone",
  cancelled: "border-rule text-graph opacity-70",
};

export default async function PurchaseOrdersPage() {
  const { profile } = await requirePurchasingViewer();
  const canManage = canManageInventory(profile.role);
  const supabase = await createClient();
  const { data } = await supabase
    .from("purchase_orders")
    .select("*, suppliers(name)")
    .order("order_date", { ascending: false })
    .order("created_at", { ascending: false });
  const purchaseOrders = (data ?? []) as PurchaseOrderRow[];
  const openOrders = purchaseOrders.filter((purchaseOrder) =>
    ["ordered", "partially_received"].includes(purchaseOrder.status),
  );
  const openValue = openOrders.reduce(
    (sum, purchaseOrder) => sum + Number(purchaseOrder.subtotal),
    0,
  );

  return (
    <main className="mt-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-medium text-ink">Purchase orders</h2>
          <p className="mt-1 text-sm text-graph">
            {openOrders.length} open · {formatCad(openValue)} ordered value
          </p>
        </div>
        {canManage && (
          <Link href="/inventory/purchase-orders/new" className="btn-primary px-4 py-2 text-sm">
            + New purchase order
          </Link>
        )}
      </div>

      <div className="mt-6 overflow-x-auto rounded border border-rule bg-paper">
        <table className="w-full min-w-[50rem] border-collapse text-left text-sm">
          <thead className="border-b border-rule bg-ink/[0.03] text-xs uppercase tracking-wide text-graph">
            <tr>
              <th className="px-4 py-3 font-medium">PO</th>
              <th className="px-4 py-3 font-medium">Supplier</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Order date</th>
              <th className="px-4 py-3 font-medium">Expected</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {purchaseOrders.map((purchaseOrder) => (
              <tr key={purchaseOrder.id} className="border-b border-rule last:border-0">
                <td className="px-4 py-3">
                  <Link
                    href={`/inventory/purchase-orders/${purchaseOrder.id}`}
                    className="font-mono text-xs font-medium text-ink hover:text-weld"
                  >
                    {purchaseOrder.po_number}
                  </Link>
                </td>
                <td className="px-4 py-3 text-ink">{purchaseOrder.suppliers?.name ?? "Supplier"}</td>
                <td className="px-4 py-3">
                  <span className={`rounded border px-2 py-1 text-xs ${statusClass[purchaseOrder.status]}`}>
                    {purchaseOrderStatusLabel(purchaseOrder.status)}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-graph">
                  {formatShortDate(purchaseOrder.order_date)}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-graph">
                  {formatShortDate(purchaseOrder.expected_date)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-ink">
                  {formatCad(purchaseOrder.subtotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {purchaseOrders.length === 0 && (
          <p className="px-4 py-12 text-center text-sm text-graph">No purchase orders yet.</p>
        )}
      </div>
    </main>
  );
}
