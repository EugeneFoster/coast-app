"use client";

import { useActionState } from "react";
import { createPurchaseOrderAction } from "@/lib/actions/inventory";
import type { SupplierOption } from "@/lib/inventory-data";
import { INITIAL_INVENTORY_ACTION_STATE } from "@/lib/inventory";

export function NewPurchaseOrderForm({
  suppliers,
  defaultOrderDate,
}: {
  suppliers: SupplierOption[];
  defaultOrderDate: string;
}) {
  const [state, action, pending] = useActionState(
    createPurchaseOrderAction,
    INITIAL_INVENTORY_ACTION_STATE,
  );
  const inputClass =
    "mt-1 w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none disabled:opacity-50";

  return (
    <form action={action} className="mt-8 space-y-6">
      {state.message && (
        <p
          aria-live="polite"
          className={`rounded border px-3 py-2 text-sm ${
            state.status === "error"
              ? "border-weld/40 bg-weld/10 text-weld"
              : "border-rule bg-paper text-ink"
          }`}
        >
          {state.message}
        </p>
      )}
      <section className="rounded border border-rule bg-paper p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-ink md:col-span-2">
            Supplier
            <select name="supplier_id" required defaultValue="" disabled={pending} className={inputClass}>
              <option value="" disabled>
                Select supplier…
              </option>
              {suppliers
                .filter((supplier) => supplier.active)
                .map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="text-sm font-medium text-ink">
            Order date
            <input
              name="order_date"
              type="date"
              required
              defaultValue={defaultOrderDate}
              disabled={pending}
              className={inputClass}
            />
          </label>
          <label className="text-sm font-medium text-ink">
            Expected date
            <input name="expected_date" type="date" disabled={pending} className={inputClass} />
          </label>
          <label className="text-sm font-medium text-ink md:col-span-2">
            Notes
            <textarea name="notes" rows={5} disabled={pending} className={inputClass} />
          </label>
        </div>
      </section>
      <button
        type="submit"
        disabled={pending || suppliers.every((supplier) => !supplier.active)}
        className="btn-primary px-5 py-2.5 text-sm disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create draft purchase order"}
      </button>
    </form>
  );
}
