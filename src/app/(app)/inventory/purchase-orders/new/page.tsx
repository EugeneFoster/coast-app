import Link from "next/link";
import { NewPurchaseOrderForm } from "@/components/new-purchase-order-form";
import { requireInventoryManager } from "@/lib/auth";
import { getSupplierOptions } from "@/lib/inventory-data";

function vancouverDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Vancouver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export default async function NewPurchaseOrderPage() {
  await requireInventoryManager();
  const suppliers = await getSupplierOptions();

  return (
    <main className="mt-7 max-w-4xl">
      <Link href="/inventory/purchase-orders" className="text-sm text-graph hover:text-ink">
        ← Purchase orders
      </Link>
      <h2 className="mt-4 font-display text-2xl font-medium text-ink">
        New purchase order
      </h2>
      <p className="mt-1 text-sm text-graph">
        Create the draft first, then add catalog items and costs.
      </p>
      <NewPurchaseOrderForm
        suppliers={suppliers}
        defaultOrderDate={vancouverDate()}
      />
    </main>
  );
}
