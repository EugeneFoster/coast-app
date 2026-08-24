import Link from "next/link";
import { requirePurchasingViewer } from "@/lib/auth";
import { canManageInventory } from "@/lib/employee-roles";
import { createClient } from "@/lib/supabase/server";
import type { Supplier } from "@/lib/types";

export default async function SuppliersPage() {
  const { profile } = await requirePurchasingViewer();
  const canManage = canManageInventory(profile.role);
  const supabase = await createClient();
  const { data } = await supabase
    .from("suppliers")
    .select("*")
    .order("active", { ascending: false })
    .order("name");
  const suppliers = (data ?? []) as Supplier[];

  return (
    <main className="mt-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-medium text-ink">Suppliers</h2>
          <p className="mt-1 text-sm text-graph">
            {suppliers.filter((supplier) => supplier.active).length} active vendors
          </p>
        </div>
        {canManage && (
          <Link href="/inventory/suppliers/new" className="btn-primary px-4 py-2 text-sm">
            + New supplier
          </Link>
        )}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {suppliers.map((supplier) => (
          <Link
            key={supplier.id}
            href={`/inventory/suppliers/${supplier.id}`}
            className={`rounded border border-rule bg-paper p-5 transition-colors hover:border-ink/30 ${
              supplier.active ? "" : "opacity-55"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-display text-lg font-medium text-ink">{supplier.name}</h3>
              <span className="rounded bg-ink/5 px-2 py-1 text-[0.65rem] uppercase tracking-wide text-graph">
                {supplier.active ? "Active" : "Inactive"}
              </span>
            </div>
            <dl className="mt-4 grid gap-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-graph">Contact</dt>
                <dd className="truncate text-right text-ink">{supplier.contact_name ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-graph">Phone</dt>
                <dd className="truncate text-right text-ink">{supplier.phone ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-graph">Account</dt>
                <dd className="truncate font-mono text-right text-xs text-ink">
                  {supplier.account_number ?? "—"}
                </dd>
              </div>
            </dl>
          </Link>
        ))}
      </div>
      {suppliers.length === 0 && (
        <div className="mt-6 rounded border border-dashed border-rule py-14 text-center text-sm text-graph">
          No suppliers yet.
        </div>
      )}
    </main>
  );
}
