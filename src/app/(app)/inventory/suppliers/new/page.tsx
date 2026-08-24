import Link from "next/link";
import { SupplierForm } from "@/components/supplier-form";
import { requireInventoryManager } from "@/lib/auth";

export default async function NewSupplierPage() {
  await requireInventoryManager();

  return (
    <main className="mt-7 max-w-4xl">
      <Link href="/inventory/suppliers" className="text-sm text-graph hover:text-ink">
        ← Suppliers
      </Link>
      <h2 className="mt-4 font-display text-2xl font-medium text-ink">New supplier</h2>
      <section className="mt-6 rounded border border-rule bg-paper p-6">
        <SupplierForm />
      </section>
    </main>
  );
}
