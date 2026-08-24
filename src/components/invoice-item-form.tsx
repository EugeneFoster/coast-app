"use client";

import { useActionState, useState } from "react";
import { addInvoiceItemAction } from "@/lib/actions/billing";
import {
  INITIAL_BILLING_ACTION_STATE,
  type BillingInventoryOption,
} from "@/lib/billing";
import { formatQuantity } from "@/lib/inventory";
import { ESTIMATE_ITEM_TYPES } from "@/lib/sales";

export function InvoiceItemForm({
  invoiceId,
  inventoryItems,
}: {
  invoiceId: string;
  inventoryItems: BillingInventoryOption[];
}) {
  const addItem = addInvoiceItemAction.bind(null, invoiceId);
  const [state, action, pending] = useActionState(
    addItem,
    INITIAL_BILLING_ACTION_STATE,
  );
  const [inventoryItemId, setInventoryItemId] = useState("");
  const [itemType, setItemType] = useState("labor");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("hr");
  const [unitPrice, setUnitPrice] = useState("");
  const selectedItem = inventoryItems.find(({ id }) => id === inventoryItemId);
  const requestedQuantity = Number(quantity);
  const insufficientStock = Boolean(
    selectedItem &&
      Number.isFinite(requestedQuantity) &&
      requestedQuantity > selectedItem.quantity_on_hand,
  );
  const inputClass =
    "w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none disabled:opacity-50";

  function selectInventoryItem(id: string) {
    setInventoryItemId(id);
    const item = inventoryItems.find((option) => option.id === id);
    if (!item) return;
    setItemType("part");
    setDescription(`${item.sku} · ${item.name}`);
    setUnit(item.unit);
    setUnitPrice(item.selling_price === null ? "" : String(item.selling_price));
  }

  return (
    <form action={action} className="rounded border border-dashed border-rule p-4 print-hidden">
      <div className="grid gap-3 lg:grid-cols-[minmax(18rem,1fr)_minmax(16rem,2fr)]">
        <label className="text-xs text-graph">
          Stock item / SKU
          <select
            name="inventory_item_id"
            value={inventoryItemId}
            onChange={(event) => selectInventoryItem(event.target.value)}
            disabled={pending}
            className={`mt-1 ${inputClass}`}
          >
            <option value="">Manual line — no stock movement</option>
            {inventoryItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.sku} — {item.name} ({formatQuantity(item.quantity_on_hand, item.unit)})
              </option>
            ))}
          </select>
        </label>
        <div className="rounded border border-rule bg-ink/[0.025] px-3 py-2 text-xs leading-5 text-graph">
          {selectedItem ? (
            <>
              Available: <span className="font-mono text-ink">{formatQuantity(selectedItem.quantity_on_hand, selectedItem.unit)}</span>
              {selectedItem.selling_price !== null && (
                <> · Catalog price: <span className="font-mono text-ink">${selectedItem.selling_price.toFixed(2)}</span></>
              )}
              <br />Stock is issued only when the invoice is marked Sent.
            </>
          ) : (
            "Choose an SKU for a direct parts sale. Manual labor/material lines do not change inventory."
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[9rem_1fr_6rem_6rem_8rem_auto]">
        <select
          name={selectedItem ? undefined : "item_type"}
          value={itemType}
          onChange={(event) => setItemType(event.target.value)}
          disabled={pending || Boolean(selectedItem)}
          className={inputClass}
          aria-label="Line type"
        >
          {ESTIMATE_ITEM_TYPES.map((type) => (
            <option key={type.value} value={type.value}>{type.label}</option>
          ))}
        </select>
        {selectedItem && <input type="hidden" name="item_type" value="part" />}
        <input
          name="description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          required
          placeholder="Description"
          disabled={pending}
          className={inputClass}
          aria-label="Description"
        />
        <input
          name="quantity"
          type="number"
          min="0.01"
          step="0.01"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          required
          disabled={pending}
          className={inputClass}
          aria-label="Quantity"
        />
        <input
          name="unit"
          value={unit}
          onChange={(event) => setUnit(event.target.value)}
          readOnly={Boolean(selectedItem)}
          required
          disabled={pending}
          className={inputClass}
          aria-label="Unit"
        />
        <input
          name="unit_price"
          type="number"
          min="0"
          step="0.01"
          value={unitPrice}
          onChange={(event) => setUnitPrice(event.target.value)}
          placeholder="Unit price"
          required
          disabled={pending}
          className={inputClass}
          aria-label="Unit price"
        />
        <button type="submit" disabled={pending} className="btn-primary whitespace-nowrap px-4 py-2 text-sm disabled:opacity-50">
          {pending ? "Adding…" : "Add line"}
        </button>
      </div>
      {insufficientStock && (
        <p className="mt-2 text-sm text-weld">
          Requested quantity exceeds current stock. You can save the draft, but Mark sent will be blocked until stock is received or the quantity is reduced.
        </p>
      )}
      {state.message && (
        <p className={`mt-2 text-sm ${state.status === "error" ? "text-weld" : "text-graph"}`} aria-live="polite">
          {state.message}
        </p>
      )}
    </form>
  );
}
