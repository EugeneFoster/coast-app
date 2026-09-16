"use client";

import { useActionState } from "react";
import {
  checkSupplierPriceWatchAction,
  confirmPriceWatchCurrencyAction,
  confirmSupplierAccountCurrencyAction,
  createSupplierPriceWatchAction,
  decideSupplierPriceAlertAction,
  type PriceWatchActionState,
} from "@/lib/actions/supplier-price-watch";

const initial: PriceWatchActionState = { status: "idle", message: "" };

function ActionMessage({ state }: { state: PriceWatchActionState }) {
  if (!state.message) return null;
  return <p role="status" className={`mt-2 text-xs ${state.status === "error" ? "text-weld-text" : "text-graph"}`}>{state.message}</p>;
}

export function CreateSupplierPriceWatchForm({ itemId, sku }: { itemId: string; sku: string }) {
  const [state, action, pending] = useActionState(
    createSupplierPriceWatchAction.bind(null, itemId), initial,
  );
  return (
    <form action={action} className="mt-4 space-y-3">
      <label className="block text-xs text-graph">
        Supplier catalogue
        <select name="supplier_code" defaultValue="marinepartssupply" className="mt-1 block w-full rounded border border-rule bg-canvas px-3 py-2 text-sm text-ink">
          <option value="marinepartssupply">Marine Parts Supply</option>
          <option value="westernmarine">Western Marine</option>
        </select>
      </label>
      <label className="block text-xs text-graph">
        Manufacturer part number or supplier catalogue code
        <input name="part_number" defaultValue={sku} maxLength={64} required
          className="mt-1 block w-full rounded border border-rule bg-canvas px-3 py-2 font-mono text-sm text-ink" />
      </label>
      <label className="flex items-start gap-2 text-xs leading-5 text-graph">
        <input type="checkbox" name="confirm_mapping" className="mt-1" />
        I confirm this dealer part is the same product as our stock item if the SKUs differ.
      </label>
      <label className="block text-xs text-graph">
        Dealer account currency (optional until confirmed)
        <select name="confirmed_currency" defaultValue="" className="mt-1 block w-full rounded border border-rule bg-canvas px-3 py-2 text-sm text-ink">
          <option value="">Not confirmed</option>
          <option value="CAD">CAD</option>
          <option value="USD">USD</option>
        </select>
      </label>
      <label className="flex items-start gap-2 text-xs leading-5 text-graph">
        <input type="checkbox" name="confirm_currency" className="mt-1" />
        I checked the dealer account currency. Only CAD prices can be suggested for our CAD stock.
      </label>
      <button type="submit" disabled={pending} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">
        {pending ? "Checking portal…" : "Start price watch"}
      </button>
      <ActionMessage state={state} />
    </form>
  );
}

export function CheckSupplierPriceWatchButton({ watchId }: { watchId: string }) {
  const [state, action, pending] = useActionState(
    checkSupplierPriceWatchAction.bind(null, watchId), initial,
  );
  return (
    <form action={action}>
      <button type="submit" disabled={pending} className="btn-secondary px-3 py-2 text-xs disabled:opacity-50">
        {pending ? "Checking…" : "Check now"}
      </button>
      <ActionMessage state={state} />
    </form>
  );
}

export function ConfirmPriceWatchCurrencyForm({ watchId }: { watchId: string }) {
  const [state, action, pending] = useActionState(
    confirmPriceWatchCurrencyAction.bind(null, watchId), initial,
  );
  return (
    <form action={action} className="mt-3 flex flex-wrap items-center gap-2">
      <select name="currency" defaultValue="CAD" aria-label="Dealer account currency"
        className="rounded border border-rule bg-canvas px-2 py-1.5 text-xs text-ink">
        <option value="CAD">CAD</option><option value="USD">USD</option>
      </select>
      <label className="flex items-center gap-1.5 text-xs text-graph">
        <input type="checkbox" name="confirm" required /> I verified this account currency
      </label>
      <button type="submit" disabled={pending} className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-50">
        {pending ? "Saving…" : "Confirm"}
      </button>
      <ActionMessage state={state} />
    </form>
  );
}

export function ConfirmSupplierAccountCurrencyForm({ supplierCode }: { supplierCode: "westernmarine" | "marinepartssupply" }) {
  const [state, action, pending] = useActionState(
    confirmSupplierAccountCurrencyAction.bind(null, supplierCode), initial,
  );
  return (
    <form action={action} className="mt-3 space-y-2">
      <select name="currency" defaultValue="CAD" aria-label="Dealer account currency"
        className="rounded border border-rule bg-canvas px-2 py-1.5 text-xs text-ink">
        <option value="CAD">CAD</option><option value="USD">USD</option>
      </select>
      <label className="flex items-start gap-2 text-xs text-graph">
        <input type="checkbox" name="confirm" required className="mt-0.5" />
        I verified this account’s price currency in the dealer portal or account terms.
      </label>
      <button type="submit" disabled={pending} className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-50">
        {pending ? "Saving…" : "Confirm account currency"}
      </button>
      <ActionMessage state={state} />
    </form>
  );
}

export function PriceAlertDecisionButtons({ alertId, canApprove, suggestedPrice, requiresReview }: { alertId: string; canApprove: boolean; suggestedPrice: number | null; requiresReview: boolean }) {
  const [approveState, approveAction, approvePending] = useActionState(
    decideSupplierPriceAlertAction.bind(null, alertId, "approve"), initial,
  );
  const [dismissState, dismissAction, dismissPending] = useActionState(
    decideSupplierPriceAlertAction.bind(null, alertId, "dismiss"), initial,
  );
  return (
    <div className="mt-4 flex flex-wrap items-end gap-2">
      {canApprove && <form action={approveAction} className="max-w-full">
        {requiresReview && <label className="mb-3 flex max-w-xl items-start gap-2 text-xs leading-5 text-ink">
          <input type="checkbox" name="confirm_item_review" required className="mt-1" />
          I checked that the stock SKU and selling unit match this dealer listing.
        </label>}
        <button type="submit" disabled={approvePending} className="btn-primary px-4 py-2 text-xs disabled:opacity-50">
          {approvePending ? "Rechecking…" : suggestedPrice === null ? "Approve selling price" : `Approve ${new Intl.NumberFormat("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(suggestedPrice)} CAD`}
        </button>
        <ActionMessage state={approveState} />
      </form>}
      <form action={dismissAction}>
        <button type="submit" disabled={dismissPending} className="btn-secondary px-4 py-2 text-xs disabled:opacity-50">
          {dismissPending ? "Dismissing…" : "Dismiss"}
        </button>
        <ActionMessage state={dismissState} />
      </form>
    </div>
  );
}
