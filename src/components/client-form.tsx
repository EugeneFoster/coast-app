"use client";

import { useActionState } from "react";
import {
  createClientAction,
  updateClientAction,
} from "@/lib/actions/sales";
import { CLIENT_TYPES, INITIAL_SALES_ACTION_STATE } from "@/lib/sales";
import type { Client, ClientContact } from "@/lib/types";

export function ClientForm({
  client,
  contact,
}: {
  client?: Client;
  contact?: ClientContact | null;
}) {
  const update = client ? updateClientAction.bind(null, client.id) : createClientAction;
  const [state, action, pending] = useActionState(
    update,
    INITIAL_SALES_ACTION_STATE,
  );
  const inputClass =
    "mt-1 w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none disabled:opacity-50";

  return (
    <form action={action} className="rounded border border-rule bg-paper p-6">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium text-ink">
          Type
          <select
            name="type"
            defaultValue={client?.type ?? "individual"}
            disabled={pending}
            className={inputClass}
          >
            {CLIENT_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-ink">
          Customer / business name
          <input
            name="name"
            defaultValue={client?.name ?? ""}
            required
            disabled={pending}
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium text-ink">
          Contact name
          <input
            name="contact_name"
            defaultValue={contact?.contact_name ?? ""}
            disabled={pending}
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium text-ink">
          Email
          <input
            name="email"
            type="email"
            defaultValue={contact?.email ?? ""}
            disabled={pending}
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium text-ink">
          Phone
          <input
            name="phone"
            type="tel"
            defaultValue={contact?.phone ?? ""}
            disabled={pending}
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium text-ink">
          Billing address
          <input
            name="billing_address"
            defaultValue={contact?.billing_address ?? ""}
            disabled={pending}
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium text-ink md:col-span-2">
          Service address
          <input
            name="service_address"
            defaultValue={contact?.service_address ?? ""}
            disabled={pending}
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium text-ink md:col-span-2">
          Notes
          <textarea
            name="notes"
            rows={4}
            defaultValue={contact?.notes ?? ""}
            disabled={pending}
            className={inputClass}
          />
        </label>
      </div>

      <div className="mt-5 flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="btn-primary px-4 py-2 text-sm disabled:opacity-60"
        >
          {pending ? "Saving…" : client ? "Save customer" : "Create customer"}
        </button>
        {state.message && (
          <p
            className={`text-sm ${state.status === "error" ? "text-weld" : "text-graph"}`}
            aria-live="polite"
          >
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
