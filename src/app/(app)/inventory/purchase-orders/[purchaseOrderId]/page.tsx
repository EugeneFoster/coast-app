import Link from "next/link";
import { notFound } from "next/navigation";
import { PurchaseOrderItemForm } from "@/components/purchase-order-item-form";
import { ReceivePurchaseOrderItemForm } from "@/components/receive-purchase-order-item-form";
import {
  deletePurchaseOrderItemAction,
  updatePurchaseOrderStatusAction,
} from "@/lib/actions/inventory";
import { requirePurchasingViewer } from "@/lib/auth";
import { canManageInventory } from "@/lib/employee-roles";
import { getInventoryItemOptions } from "@/lib/inventory-data";
import {
  formatQuantity,
  purchaseOrderStatusLabel,
} from "@/lib/inventory";
import { formatCad, formatShortDate } from "@/lib/sales";
import { createClient } from "@/lib/supabase/server";
import type { PurchaseOrder, PurchaseOrderItem } from "@/lib/types";

type PurchaseOrderRow = PurchaseOrder & {
  suppliers: {
    id: string;
    name: string;
    contact_name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
};

type PurchaseOrderItemRow = PurchaseOrderItem & {
  inventory_items: { sku: string; name: string } | null;
};

export default async function PurchaseOrderPage({
  params,
}: {
  params: Promise<{ purchaseOrderId: string }>;
}) {
  const { purchaseOrderId } = await params;
  const { profile } = await requirePurchasingViewer();
  const canManage = canManageInventory(profile.role);
  const supabase = await createClient();
  const [{ data: purchaseOrderData }, { data: lineData }, inventoryItems] =
    await Promise.all([
      supabase
        .from("purchase_orders")
        .select("*, suppliers(id, name, contact_name, email, phone)")
        .eq("id", purchaseOrderId)
        .maybeSingle(),
      supabase
        .from("purchase_order_items")
        .select("*, inventory_items(sku, name)")
        .eq("purchase_order_id", purchaseOrderId)
        .order("created_at"),
      canManage ? getInventoryItemOptions() : Promise.resolve([]),
    ]);
  if (!purchaseOrderData) notFound();
  const purchaseOrder = purchaseOrderData as PurchaseOrderRow;
  const lines = (lineData ?? []) as PurchaseOrderItemRow[];
  const receivedValue = lines.reduce(
    (sum, line) => sum + Number(line.quantity_received) * Number(line.unit_cost),
    0,
  );
  const canReceive = ["ordered", "partially_received"].includes(
    purchaseOrder.status,
  );

  return (
    <main className="mt-7">
      <Link href="/inventory/purchase-orders" className="text-sm text-graph hover:text-ink">
        ← Purchase orders
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-2xl font-medium text-ink">
              {purchaseOrder.po_number}
            </h2>
            <span className="rounded border border-rule px-2.5 py-1 text-xs text-graph">
              {purchaseOrderStatusLabel(purchaseOrder.status)}
            </span>
          </div>
          <p className="mt-2 text-sm text-graph">
            {purchaseOrder.suppliers?.name ?? "Supplier"}
          </p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            {purchaseOrder.status === "draft" && lines.length > 0 && (
              <form
                action={updatePurchaseOrderStatusAction.bind(
                  null,
                  purchaseOrder.id,
                  "ordered",
                )}
              >
                <button type="submit" className="btn-primary px-4 py-2 text-sm">
                  Mark ordered
                </button>
              </form>
            )}
            {(purchaseOrder.status === "draft" || purchaseOrder.status === "ordered") && (
              <form
                action={updatePurchaseOrderStatusAction.bind(
                  null,
                  purchaseOrder.id,
                  "cancelled",
                )}
              >
                <button type="submit" className="btn-secondary px-4 py-2 text-sm">
                  Cancel
                </button>
              </form>
            )}
            {purchaseOrder.status === "cancelled" && (
              <form
                action={updatePurchaseOrderStatusAction.bind(
                  null,
                  purchaseOrder.id,
                  "draft",
                )}
              >
                <button type="submit" className="btn-secondary px-4 py-2 text-sm">
                  Reopen draft
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded border border-rule bg-paper p-4">
          <p className="text-xs uppercase tracking-wide text-graph">Order total</p>
          <p className="mt-2 font-mono text-xl text-ink">{formatCad(purchaseOrder.subtotal)}</p>
        </div>
        <div className="rounded border border-rule bg-paper p-4">
          <p className="text-xs uppercase tracking-wide text-graph">Received value</p>
          <p className="mt-2 font-mono text-xl text-ink">{formatCad(receivedValue)}</p>
        </div>
        <div className="rounded border border-rule bg-paper p-4">
          <p className="text-xs uppercase tracking-wide text-graph">Order date</p>
          <p className="mt-2 font-mono text-sm text-ink">{formatShortDate(purchaseOrder.order_date)}</p>
        </div>
        <div className="rounded border border-rule bg-paper p-4">
          <p className="text-xs uppercase tracking-wide text-graph">Expected</p>
          <p className="mt-2 font-mono text-sm text-ink">{formatShortDate(purchaseOrder.expected_date)}</p>
        </div>
      </div>

      <section className="mt-6 rounded border border-rule bg-paper p-5">
        <div className="grid gap-4 text-sm md:grid-cols-3">
          <div>
            <p className="text-xs text-graph">Supplier contact</p>
            <p className="mt-1 text-ink">{purchaseOrder.suppliers?.contact_name ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-graph">Email / phone</p>
            <p className="mt-1 text-ink">
              {purchaseOrder.suppliers?.email ?? purchaseOrder.suppliers?.phone ?? "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-graph">Notes</p>
            <p className="mt-1 whitespace-pre-wrap text-ink">{purchaseOrder.notes ?? "—"}</p>
          </div>
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-center justify-between gap-4">
          <h3 className="font-display text-xl font-medium text-ink">Order lines</h3>
          <span className="text-xs text-graph">{lines.length} items</span>
        </div>
        <div className="mt-4 space-y-3">
          {lines.map((line) => {
            const remaining = Number(line.quantity) - Number(line.quantity_received);
            return (
              <article key={line.id} className="rounded border border-rule bg-paper p-4">
                <div className="grid gap-3 text-sm lg:grid-cols-[1fr_8rem_9rem_9rem_9rem_3rem] lg:items-center">
                  <div>
                    <p className="font-medium text-ink">
                      {line.inventory_items?.name ?? line.description}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-graph">
                      {line.inventory_items?.sku ?? "—"}
                      {line.supplier_sku ? ` · Supplier ${line.supplier_sku}` : ""}
                    </p>
                  </div>
                  <span className="font-mono text-xs text-graph">
                    {formatQuantity(line.quantity, line.unit)}
                  </span>
                  <span className="font-mono text-xs text-graph">
                    Received {formatQuantity(line.quantity_received, line.unit)}
                  </span>
                  <span className="text-right font-mono text-xs text-ink">
                    {formatCad(line.unit_cost)} / {line.unit}
                  </span>
                  <span className="text-right font-mono text-ink">
                    {formatCad(line.line_total)}
                  </span>
                  {canManage && purchaseOrder.status === "draft" ? (
                    <form
                      action={deletePurchaseOrderItemAction.bind(
                        null,
                        purchaseOrder.id,
                        line.id,
                      )}
                    >
                      <button type="submit" className="text-xs text-graph hover:text-weld">
                        ×
                      </button>
                    </form>
                  ) : (
                    <span />
                  )}
                </div>
                {canManage && canReceive && remaining > 0 && (
                  <ReceivePurchaseOrderItemForm
                    purchaseOrderId={purchaseOrder.id}
                    lineId={line.id}
                    remaining={remaining}
                    unit={line.unit}
                  />
                )}
              </article>
            );
          })}
          {lines.length === 0 && (
            <div className="rounded border border-dashed border-rule py-10 text-center text-sm text-graph">
              No order lines yet.
            </div>
          )}
        </div>

        {canManage && purchaseOrder.status === "draft" && (
          <div className="mt-5 rounded border border-rule bg-paper p-5">
            <h4 className="font-display text-lg font-medium text-ink">Add catalog item</h4>
            <div className="mt-4">
              <PurchaseOrderItemForm
                purchaseOrderId={purchaseOrder.id}
                items={inventoryItems}
              />
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
