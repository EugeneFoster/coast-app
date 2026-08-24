import Link from "next/link";
import { notFound } from "next/navigation";
import { SupplierForm } from "@/components/supplier-form";
import { requirePurchasingViewer } from "@/lib/auth";
import { canManageInventory } from "@/lib/employee-roles";
import { purchaseOrderStatusLabel } from "@/lib/inventory";
import { formatCad, formatShortDate } from "@/lib/sales";
import { createClient } from "@/lib/supabase/server";
import type { PurchaseOrder, Supplier } from "@/lib/types";

export default async function SupplierPage({
  params,
}: {
  params: Promise<{ supplierId: string }>;
}) {
  const { supplierId } = await params;
  const { profile } = await requirePurchasingViewer();
  const canManage = canManageInventory(profile.role);
  const supabase = await createClient();
  const [{ data: supplierData }, { data: purchaseOrderData }, { count: itemCount }] =
    await Promise.all([
      supabase.from("suppliers").select("*").eq("id", supplierId).maybeSingle(),
      supabase
        .from("purchase_orders")
        .select("*")
        .eq("supplier_id", supplierId)
        .order("order_date", { ascending: false }),
      supabase
        .from("inventory_items")
        .select("id", { count: "exact", head: true })
        .eq("preferred_supplier_id", supplierId),
    ]);
  if (!supplierData) notFound();
  const supplier = supplierData as Supplier;
  const purchaseOrders = (purchaseOrderData ?? []) as PurchaseOrder[];

  return (
    <main className="mt-7">
      <Link href="/inventory/suppliers" className="text-sm text-graph hover:text-ink">
        ← Suppliers
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-medium text-ink">{supplier.name}</h2>
          <p className="mt-1 text-sm text-graph">
            {itemCount ?? 0} preferred catalog items · {purchaseOrders.length} purchase orders
          </p>
        </div>
        <span className="rounded border border-rule px-3 py-1.5 text-xs text-graph">
          {supplier.active ? "Active supplier" : "Inactive supplier"}
        </span>
      </div>

      {canManage ? (
        <section className="mt-6 max-w-4xl rounded border border-rule bg-paper p-6">
          <SupplierForm supplier={supplier} />
        </section>
      ) : (
        <section className="mt-6 max-w-4xl rounded border border-rule bg-paper p-5">
          <dl className="grid gap-4 text-sm md:grid-cols-2">
            <div><dt className="text-xs text-graph">Contact</dt><dd className="mt-1">{supplier.contact_name ?? "—"}</dd></div>
            <div><dt className="text-xs text-graph">Account</dt><dd className="mt-1 font-mono text-xs">{supplier.account_number ?? "—"}</dd></div>
            <div><dt className="text-xs text-graph">Email</dt><dd className="mt-1">{supplier.email ?? "—"}</dd></div>
            <div><dt className="text-xs text-graph">Phone</dt><dd className="mt-1">{supplier.phone ?? "—"}</dd></div>
            <div className="md:col-span-2"><dt className="text-xs text-graph">Address</dt><dd className="mt-1 whitespace-pre-wrap">{supplier.address ?? "—"}</dd></div>
          </dl>
        </section>
      )}

      <section className="mt-10">
        <div className="flex items-center justify-between gap-4">
          <h3 className="font-display text-xl font-medium text-ink">Purchase history</h3>
          {canManage && supplier.active && (
            <Link href="/inventory/purchase-orders/new" className="btn-secondary px-3 py-2 text-sm">
              New PO →
            </Link>
          )}
        </div>
        <div className="mt-4 overflow-hidden rounded border border-rule bg-paper">
          {purchaseOrders.map((purchaseOrder) => (
            <Link
              key={purchaseOrder.id}
              href={`/inventory/purchase-orders/${purchaseOrder.id}`}
              className="grid gap-2 border-b border-rule px-4 py-3 text-sm transition-colors last:border-0 hover:bg-ink/[0.02] sm:grid-cols-[10rem_1fr_10rem_8rem] sm:items-center"
            >
              <span className="font-mono text-xs text-ink">{purchaseOrder.po_number}</span>
              <span className="text-graph">{purchaseOrderStatusLabel(purchaseOrder.status)}</span>
              <span className="font-mono text-xs text-graph">{formatShortDate(purchaseOrder.order_date)}</span>
              <span className="text-right font-mono text-ink">{formatCad(purchaseOrder.subtotal)}</span>
            </Link>
          ))}
          {purchaseOrders.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-graph">No purchase orders.</p>
          )}
        </div>
      </section>
    </main>
  );
}
