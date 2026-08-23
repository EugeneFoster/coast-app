"use client";

import { useActionState, useState } from "react";
import { createOpportunityAction } from "@/lib/actions/sales";
import {
  CLIENT_TYPES,
  INITIAL_SALES_ACTION_STATE,
  LEAD_SOURCES,
  SERVICE_CATEGORIES,
} from "@/lib/sales";

type CustomerOption = {
  id: string;
  name: string;
};

type AssigneeOption = {
  id: string;
  full_name: string | null;
  login: string;
};

export function NewOpportunityForm({
  customers,
  assignees,
  initialCustomerId = "",
}: {
  customers: CustomerOption[];
  assignees: AssigneeOption[];
  initialCustomerId?: string;
}) {
  const [state, action, pending] = useActionState(
    createOpportunityAction,
    INITIAL_SALES_ACTION_STATE,
  );
  const [existingCustomer, setExistingCustomer] = useState(initialCustomerId);
  const creatingCustomer = !existingCustomer;
  const inputClass =
    "mt-1 w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none disabled:opacity-50";
  const labelClass = "text-sm font-medium text-ink";

  return (
    <form action={action} className="mt-8 space-y-8">
      {state.message && (
        <p
          className={`rounded border px-3 py-2 text-sm ${
            state.status === "error"
              ? "border-weld/40 bg-weld/10 text-weld"
              : "border-rule bg-paper text-ink"
          }`}
          aria-live="polite"
        >
          {state.message}
        </p>
      )}

      <section className="rounded border border-rule bg-paper p-6">
        <h2 className="font-display text-xl font-medium text-ink">Customer</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className={`${labelClass} md:col-span-2`}>
            Existing customer
            <select
              name="client_id"
              value={existingCustomer}
              onChange={(event) => setExistingCustomer(event.target.value)}
              disabled={pending}
              className={inputClass}
            >
              <option value="">Create a new customer…</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </label>

          <label className={labelClass}>
            Customer type
            <select
              name="client_type"
              defaultValue="individual"
              disabled={pending || !creatingCustomer}
              className={inputClass}
            >
              {CLIENT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Customer / business name
            <input
              name="client_name"
              required={creatingCustomer}
              disabled={pending || !creatingCustomer}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Contact name
            <input
              name="contact_name"
              disabled={pending || !creatingCustomer}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Email
            <input
              name="email"
              type="email"
              disabled={pending || !creatingCustomer}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Phone
            <input
              name="phone"
              type="tel"
              disabled={pending || !creatingCustomer}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Service address
            <input
              name="service_address"
              disabled={pending || !creatingCustomer}
              className={inputClass}
            />
          </label>
          <label className={`${labelClass} md:col-span-2`}>
            Customer notes
            <textarea
              name="client_notes"
              rows={2}
              disabled={pending || !creatingCustomer}
              className={inputClass}
            />
          </label>
        </div>
      </section>

      <section className="rounded border border-rule bg-paper p-6">
        <h2 className="font-display text-xl font-medium text-ink">Opportunity</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className={`${labelClass} md:col-span-2`}>
            Opportunity title
            <input
              name="title"
              required
              placeholder="Repower and aluminum transom repair"
              disabled={pending}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Lead source
            <select
              name="source"
              defaultValue="phone"
              disabled={pending}
              className={inputClass}
            >
              {LEAD_SOURCES.map((source) => (
                <option key={source.value} value={source.value}>
                  {source.label}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Responsible person
            <select name="assigned_to" disabled={pending} className={inputClass}>
              <option value="">Assign to me</option>
              {assignees.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.full_name ?? person.login}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Estimated value (CAD)
            <input
              name="estimated_value"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              disabled={pending}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Target date
            <input
              name="target_date"
              type="date"
              disabled={pending}
              className={inputClass}
            />
          </label>
          <label className={`${labelClass} md:col-span-2`}>
            Requested work / notes
            <textarea
              name="description"
              rows={5}
              disabled={pending}
              className={inputClass}
            />
          </label>
        </div>

        <fieldset className="mt-5">
          <legend className={labelClass}>Services</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICE_CATEGORIES.map((category) => (
              <label
                key={category.value}
                className="flex items-center gap-2 rounded border border-rule px-3 py-2 text-sm text-ink"
              >
                <input
                  type="checkbox"
                  name="service_categories"
                  value={category.value}
                  disabled={pending}
                  className="accent-weld"
                />
                {category.label}
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="rounded border border-rule bg-paper p-6">
        <h2 className="font-display text-xl font-medium text-ink">Vessel</h2>
        <p className="mt-1 text-sm text-graph">Optional for dock-only and parts work.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <label className={labelClass}>
            Vessel name
            <input name="vessel_name" disabled={pending} className={inputClass} />
          </label>
          <label className={labelClass}>
            Make / model
            <input
              name="vessel_make_model"
              disabled={pending}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Length (ft)
            <input
              name="vessel_length_ft"
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              disabled={pending}
              className={inputClass}
            />
          </label>
        </div>
      </section>

      <button
        type="submit"
        disabled={pending}
        className="btn-primary px-5 py-2.5 text-sm disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create opportunity"}
      </button>
    </form>
  );
}
