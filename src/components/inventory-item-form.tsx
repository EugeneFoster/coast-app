"use client";

import { useActionState } from "react";
import {
  createInventoryItemAction,
  updateInventoryItemAction,
} from "@/lib/actions/inventory";
import type { SupplierOption } from "@/lib/inventory-data";
import {
  INITIAL_INVENTORY_ACTION_STATE,
  INVENTORY_CATEGORIES,
} from "@/lib/inventory";
import type { InventoryItem } from "@/lib/types";

export function InventoryItemForm({
  suppliers,
  item,
}: {
  suppliers: SupplierOption[];
  item?: InventoryItem;
}) {
  const submit = item
    ? updateInventoryItemAction.bind(null, item.id)
    : createInventoryItemAction;
  const [state, action, pending] = useActionState(
    submit,
    INITIAL_INVENTORY_ACTION_STATE,
  );
  const inputClass =
    "mt-1 w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none disabled:opacity-50";
  const labelClass = "text-sm font-medium text-ink";

  return (
    <form action={action} className="space-y-5">
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
      <div className="grid gap-4 md:grid-cols-2">
        <label className={labelClass}>
          SKU / part number
          <input
            name="sku"
            required
            defaultValue={item?.sku ?? ""}
            disabled={pending}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Item name
          <input
            name="name"
            required
            defaultValue={item?.name ?? ""}
            disabled={pending}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Category
          <select
            name="category"
            defaultValue={item?.category ?? "part"}
            disabled={pending}
            className={inputClass}
          >
            {INVENTORY_CATEGORIES.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Unit
          <input
            name="unit"
            required
            placeholder="ea, ft, kg, L"
            defaultValue={item?.unit ?? "ea"}
            disabled={pending}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Selling price (CAD)
          <input
            name="selling_price"
            type="number"
            min="0"
            step="0.01"
            defaultValue={item?.selling_price ?? ""}
            disabled={pending}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Reorder point
          <input
            name="reorder_point"
            type="number"
            min="0"
            step="0.001"
            required
            defaultValue={item?.reorder_point ?? 0}
            disabled={pending}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Bin / location
          <input
            name="location"
            placeholder="Warehouse A · Bin 12"
            defaultValue={item?.location ?? ""}
            disabled={pending}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Preferred supplier
          <select
            name="preferred_supplier_id"
            defaultValue={item?.preferred_supplier_id ?? ""}
            disabled={pending}
            className={inputClass}
          >
            <option value="">Not set</option>
            {suppliers
              .filter((supplier) => supplier.active || supplier.id === item?.preferred_supplier_id)
              .map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
          </select>
        </label>
        <label className={`${labelClass} md:col-span-2`}>
          Description
          <textarea
            name="description"
            rows={4}
            defaultValue={item?.description ?? ""}
            disabled={pending}
            className={inputClass}
          />
        </label>
      </div>
      <label className="flex items-center gap-3 text-sm text-ink">
        <input
          name="active"
          type="checkbox"
          defaultChecked={item?.active ?? true}
          disabled={pending}
          className="accent-weld"
        />
        Active inventory item
      </label>
      <button
        type="submit"
        disabled={pending}
        className="btn-primary px-5 py-2.5 text-sm disabled:opacity-60"
      >
        {pending ? "Saving…" : item ? "Save item" : "Create item"}
      </button>
    </form>
  );
}
