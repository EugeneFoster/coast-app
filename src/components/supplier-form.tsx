"use client";

import { useActionState } from "react";
import {
  createSupplierAction,
  updateSupplierAction,
} from "@/lib/actions/inventory";
import { INITIAL_INVENTORY_ACTION_STATE } from "@/lib/inventory";
import type { Supplier } from "@/lib/types";

export function SupplierForm({ supplier }: { supplier?: Supplier }) {
  const submit = supplier
    ? updateSupplierAction.bind(null, supplier.id)
    : createSupplierAction;
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
        <label className={`${labelClass} md:col-span-2`}>
          Supplier name
          <input
            name="name"
            required
            defaultValue={supplier?.name ?? ""}
            disabled={pending}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Account number
          <input
            name="account_number"
            defaultValue={supplier?.account_number ?? ""}
            disabled={pending}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Contact name
          <input
            name="contact_name"
            defaultValue={supplier?.contact_name ?? ""}
            disabled={pending}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Email
          <input
            name="email"
            type="email"
            defaultValue={supplier?.email ?? ""}
            disabled={pending}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Phone
          <input
            name="phone"
            type="tel"
            defaultValue={supplier?.phone ?? ""}
            disabled={pending}
            className={inputClass}
          />
        </label>
        <label className={`${labelClass} md:col-span-2`}>
          Website
          <input
            name="website"
            type="url"
            placeholder="https://"
            defaultValue={supplier?.website ?? ""}
            disabled={pending}
            className={inputClass}
          />
        </label>
        <label className={`${labelClass} md:col-span-2`}>
          Address
          <textarea
            name="address"
            rows={3}
            defaultValue={supplier?.address ?? ""}
            disabled={pending}
            className={inputClass}
          />
        </label>
        <label className={`${labelClass} md:col-span-2`}>
          Notes
          <textarea
            name="notes"
            rows={4}
            defaultValue={supplier?.notes ?? ""}
            disabled={pending}
            className={inputClass}
          />
        </label>
      </div>
      <label className="flex items-center gap-3 text-sm text-ink">
        <input
          name="active"
          type="checkbox"
          defaultChecked={supplier?.active ?? true}
          disabled={pending}
          className="accent-weld"
        />
        Active supplier
      </label>
      <button
        type="submit"
        disabled={pending}
        className="btn-primary px-5 py-2.5 text-sm disabled:opacity-60"
      >
        {pending ? "Saving…" : supplier ? "Save supplier" : "Create supplier"}
      </button>
    </form>
  );
}
