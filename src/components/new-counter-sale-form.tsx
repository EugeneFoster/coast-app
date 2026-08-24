"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { completeCounterSaleAction } from "@/lib/actions/counter-sales";
import {
  COUNTER_SALE_PAYMENT_METHODS,
  INITIAL_COUNTER_SALE_ACTION_STATE,
} from "@/lib/counter-sales";
import type {
  CounterSaleCustomerOption,
  CounterSaleInventoryOption,
} from "@/lib/counter-sales-data";
import { formatQuantity } from "@/lib/inventory";
import { formatCad } from "@/lib/sales";

type CartLine = CounterSaleInventoryOption & {
  quantity: number;
  unit_price: number;
};

function moneyRound(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function NewCounterSaleForm({
  inventoryItems,
  customers,
}: {
  inventoryItems: CounterSaleInventoryOption[];
  customers: CounterSaleCustomerOption[];
}) {
  const [state, action, pending] = useActionState(
    completeCounterSaleAction,
    INITIAL_COUNTER_SALE_ACTION_STATE,
  );
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [clientId, setClientId] = useState("");
  const [taxRate, setTaxRate] = useState(12);
  const [localMessage, setLocalMessage] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return inventoryItems.slice(0, 12);
    return inventoryItems
      .filter((item) =>
        item.sku.toLowerCase().includes(normalized) ||
        item.name.toLowerCase().includes(normalized),
      )
      .slice(0, 12);
  }, [inventoryItems, query]);

  function addItem(item: CounterSaleInventoryOption) {
    if (item.quantity_on_hand <= 0) {
      setLocalMessage(`${item.sku} is out of stock.`);
      return;
    }
    setCart((current) => {
      const existing = current.find((line) => line.id === item.id);
      if (existing) {
        if (existing.quantity + 1 > item.quantity_on_hand) {
          setLocalMessage(`Only ${formatQuantity(item.quantity_on_hand, item.unit)} available.`);
          return current;
        }
        return current.map((line) =>
          line.id === item.id ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [
        ...current,
        {
          ...item,
          quantity: 1,
          unit_price: item.selling_price ?? 0,
        },
      ];
    });
    setLocalMessage("");
    setQuery("");
    requestAnimationFrame(() => searchRef.current?.focus());
  }

  function addFromSearch() {
    const normalized = query.trim().toLowerCase();
    const exact = inventoryItems.find((item) => item.sku.toLowerCase() === normalized);
    const selected = exact ?? (matches.length === 1 ? matches[0] : null);
    if (selected) addItem(selected);
    else setLocalMessage("Scan an exact SKU or choose a matching item below.");
  }

  function updateLine(id: string, field: "quantity" | "unit_price", value: number) {
    setCart((current) => current.map((line) => {
      if (line.id !== id) return line;
      const next = Number.isFinite(value) ? value : 0;
      if (field === "quantity") {
        return { ...line, quantity: Math.min(Math.max(next, 0), line.quantity_on_hand) };
      }
      return { ...line, unit_price: Math.max(next, 0) };
    }));
  }

  const subtotal = moneyRound(
    cart.reduce((sum, line) => sum + moneyRound(line.quantity * line.unit_price), 0),
  );
  const taxAmount = moneyRound(subtotal * taxRate / 100);
  const total = moneyRound(subtotal + taxAmount);
  const itemsJson = JSON.stringify(cart.map((line) => ({
    inventory_item_id: line.id,
    quantity: line.quantity,
    unit_price: line.unit_price,
  })));
  const cartValid = cart.length > 0 && cart.every((line) =>
    line.quantity > 0 &&
    line.quantity <= line.quantity_on_hand &&
    line.unit_price >= 0,
  );

  const inputClass =
    "mt-1 w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none disabled:opacity-50";

  return (
    <form action={action} className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
      <input type="hidden" name="items_json" value={itemsJson} />
      <section className="space-y-5">
        <div className="rounded border border-rule bg-paper p-5">
          <label className="block text-sm font-medium text-ink">
            Scan SKU or search parts
            <div className="mt-1 flex gap-2">
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addFromSearch();
                  }
                }}
                autoFocus
                autoComplete="off"
                placeholder="Scan barcode, type SKU, or part name"
                disabled={pending}
                className="w-full rounded border border-rule bg-bone px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none"
              />
              <button
                type="button"
                onClick={addFromSearch}
                disabled={pending}
                className="btn-secondary shrink-0 px-4 py-2 text-sm"
              >
                Add
              </button>
            </div>
          </label>
          <p className="mt-2 text-xs text-graph">
            USB/Bluetooth barcode scanners work as keyboard input; the Enter suffix adds an exact SKU.
          </p>
          {(localMessage || state.message) && (
            <p className="mt-3 text-sm text-weld" aria-live="polite">
              {localMessage || state.message}
            </p>
          )}
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {matches.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => addItem(item)}
                disabled={pending || item.quantity_on_hand <= 0}
                className="rounded border border-rule bg-bone p-3 text-left transition-colors hover:border-weld disabled:opacity-45"
              >
                <span className="font-mono text-xs text-weld">{item.sku}</span>
                <span className="mt-1 block text-sm font-medium text-ink">{item.name}</span>
                <span className="mt-1 flex justify-between gap-3 text-xs text-graph">
                  <span>{formatQuantity(item.quantity_on_hand, item.unit)} available</span>
                  <span>{item.selling_price === null ? "No list price" : formatCad(item.selling_price)}</span>
                </span>
              </button>
            ))}
            {matches.length === 0 && (
              <p className="text-sm text-graph">No active stock items match this search.</p>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded border border-rule bg-paper">
          <div className="grid grid-cols-[1fr_6rem_7rem_7rem_2rem] gap-3 border-b border-rule bg-ink/[0.03] px-4 py-3 text-xs uppercase tracking-wide text-graph">
            <span>Part</span><span>Qty</span><span>Price</span><span className="text-right">Total</span><span />
          </div>
          {cart.map((line) => (
            <div key={line.id} className="grid grid-cols-[1fr_6rem_7rem_7rem_2rem] items-center gap-3 border-b border-rule px-4 py-3 last:border-0">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{line.name}</p>
                <p className="mt-0.5 font-mono text-xs text-graph">{line.sku} · {line.unit}</p>
              </div>
              <input
                aria-label={`Quantity for ${line.name}`}
                type="number"
                min="0.001"
                max={line.quantity_on_hand}
                step="0.001"
                value={line.quantity}
                onChange={(event) => updateLine(line.id, "quantity", event.target.valueAsNumber)}
                disabled={pending}
                className="w-full rounded border border-rule bg-bone px-2 py-1.5 font-mono text-xs text-ink focus:border-weld focus:outline-none"
              />
              <input
                aria-label={`Unit price for ${line.name}`}
                type="number"
                min="0"
                step="0.01"
                value={line.unit_price}
                onChange={(event) => updateLine(line.id, "unit_price", event.target.valueAsNumber)}
                disabled={pending}
                className="w-full rounded border border-rule bg-bone px-2 py-1.5 font-mono text-xs text-ink focus:border-weld focus:outline-none"
              />
              <span className="text-right font-mono text-sm text-ink">
                {formatCad(moneyRound(line.quantity * line.unit_price))}
              </span>
              <button
                type="button"
                onClick={() => setCart((current) => current.filter((item) => item.id !== line.id))}
                disabled={pending}
                aria-label={`Remove ${line.name}`}
                className="text-graph hover:text-weld"
              >×</button>
            </div>
          ))}
          {cart.length === 0 && (
            <p className="px-4 py-12 text-center text-sm text-graph">
              Scan or select the first part to start the sale.
            </p>
          )}
        </div>
      </section>

      <aside className="h-fit rounded border border-rule bg-paper p-5 xl:sticky xl:top-6">
        <h2 className="font-display text-xl font-medium text-ink">Payment & receipt</h2>
        <div className="mt-5 space-y-4">
          <label className="block text-sm font-medium text-ink">
            Existing customer (optional)
            <select
              name="client_id"
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
              disabled={pending}
              className={inputClass}
            >
              <option value="">Walk-in / receipt name</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>{customer.name}</option>
              ))}
            </select>
          </label>
          {!clientId && (
            <label className="block text-sm font-medium text-ink">
              Receipt name
              <input
                name="customer_name"
                maxLength={200}
                placeholder="Walk-in customer"
                disabled={pending}
                className={inputClass}
              />
            </label>
          )}
          <label className="block text-sm font-medium text-ink">
            Payment method
            <select name="payment_method" defaultValue="card" disabled={pending} className={inputClass}>
              {COUNTER_SALE_PAYMENT_METHODS.map((method) => (
                <option key={method.value} value={method.value}>{method.label}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-ink">
            Payment reference (optional)
            <input
              name="payment_reference"
              maxLength={120}
              placeholder="Terminal or transfer reference"
              disabled={pending}
              className={inputClass}
            />
          </label>
          <p className="rounded border border-rule bg-bone p-3 text-xs leading-5 text-graph">
            This records an already received payment. It does not charge a card or connect to a terminal.
          </p>
          <label className="block text-sm font-medium text-ink">
            Tax rate (%)
            <input
              name="tax_rate_percent"
              type="number"
              min="0"
              max="100"
              step="0.001"
              value={taxRate}
              onChange={(event) => setTaxRate(event.target.valueAsNumber || 0)}
              disabled={pending}
              required
              className={inputClass}
            />
          </label>
        </div>

        <dl className="mt-6 space-y-3 border-t border-rule pt-5 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-graph">Subtotal</dt><dd className="font-mono">{formatCad(subtotal)}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-graph">Tax ({taxRate || 0}%)</dt><dd className="font-mono">{formatCad(taxAmount)}</dd></div>
          <div className="flex justify-between gap-4 border-t border-ink pt-3 text-lg"><dt className="font-display">Total paid</dt><dd className="font-mono">{formatCad(total)}</dd></div>
        </dl>
        <button
          type="submit"
          disabled={pending || !cartValid}
          className="btn-primary mt-6 w-full px-4 py-3 text-sm disabled:opacity-50"
        >
          {pending ? "Completing sale…" : `Complete sale · ${formatCad(total)}`}
        </button>
      </aside>
    </form>
  );
}
