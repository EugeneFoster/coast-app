import Link from "next/link";
import { InventoryItemForm } from "@/components/inventory-item-form";
import { requireInventoryManager } from "@/lib/auth";
import { getSupplierOptions } from "@/lib/inventory-data";

export default async function NewInventoryItemPage() {
  await requireInventoryManager();
  const suppliers = await getSupplierOptions();

  return (
    <main className="mt-7 max-w-4xl">
      <Link href="/inventory" className="text-sm text-graph hover:text-ink">
        ← Stock catalog
      </Link>
      <h2 className="mt-4 font-display text-2xl font-medium text-ink">
        New inventory item
      </h2>
      <p className="mt-1 text-sm text-graph">
        Opening quantity is recorded separately as an auditable stock adjustment.
      </p>
      <section className="mt-6 rounded border border-rule bg-paper p-6">
        <InventoryItemForm suppliers={suppliers} />
      </section>
    </main>
  );
}
