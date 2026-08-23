import Link from "next/link";
import { ClientForm } from "@/components/client-form";
import { requireSalesManager } from "@/lib/auth";

export default async function NewCustomerPage() {
  await requireSalesManager();
  return (
    <div className="mx-auto max-w-3xl px-8 pb-12 pt-8">
      <Link href="/sales/clients" className="text-sm text-graph hover:text-ink">
        ← Customers
      </Link>
      <h1 className="mb-8 mt-4 font-display text-3xl font-medium text-ink">
        New customer
      </h1>
      <ClientForm />
    </div>
  );
}
