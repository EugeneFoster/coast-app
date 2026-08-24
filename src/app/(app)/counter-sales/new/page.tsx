import Link from "next/link";
import { NewCounterSaleForm } from "@/components/new-counter-sale-form";
import { getCounterSaleDirectories } from "@/lib/counter-sales-data";

export default async function NewCounterSalePage() {
  const { inventoryItems, customers } = await getCounterSaleDirectories();

  return (
    <main className="mt-7">
      <Link href="/counter-sales" className="text-sm text-graph hover:text-ink">← Counter sales</Link>
      <div className="mt-4 border-b border-rule pb-5">
        <h2 className="font-display text-2xl font-medium text-ink">New counter sale</h2>
        <p className="mt-1 text-sm text-graph">
          Stock is checked and deducted only when the paid sale completes.
        </p>
      </div>
      <div className="mt-6">
        <NewCounterSaleForm inventoryItems={inventoryItems} customers={customers} />
      </div>
    </main>
  );
}
