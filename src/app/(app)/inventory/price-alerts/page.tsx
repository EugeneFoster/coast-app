import Link from "next/link";
import { CheckSupplierPriceWatchButton, ConfirmPriceWatchCurrencyForm, ConfirmSupplierAccountCurrencyForm, PriceAlertDecisionButtons } from "@/components/supplier-price-watch-controls";
import { requirePurchasingViewer } from "@/lib/auth";
import { canManageInventory } from "@/lib/employee-roles";
import { createClient } from "@/lib/supabase/server";

type AlertRow = {
  id: string;
  reason: string;
  previous_dealer_cost: number | null;
  dealer_cost: number | null;
  previous_list_price: number | null;
  list_price: number | null;
  currency: string | null;
  current_selling_price: number | null;
  suggested_selling_price: number | null;
  detected_at: string;
  inventory_items: { id: string; sku: string; name: string; quantity_on_hand: number } | null;
  supplier_price_watches: { id: string; supplier_code: string; query_part_number: string; confirmed_currency: string | null } | null;
};

type WatchRow = {
  id: string;
  supplier_code: string;
  query_part_number: string;
  confirmed_currency: string | null;
  last_dealer_cost: number | null;
  last_list_price: number | null;
  last_currency: string | null;
  last_checked_at: string | null;
  last_error: string | null;
  inventory_items: { id: string; sku: string; name: string; quantity_on_hand: number } | null;
};

function money(value: number | null, currency: string | null) {
  if (value === null) return "—";
  const formatted = new Intl.NumberFormat("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  return currency ? `${formatted} ${currency}` : `${formatted} (currency unconfirmed)`;
}

export default async function SupplierPriceAlertsPage() {
  const { profile } = await requirePurchasingViewer();
  const canManage = canManageInventory(profile.role);
  const supabase = await createClient();
  const [alertResult, watchResult, currencyResult] = await Promise.all([
    supabase.from("supplier_price_alerts")
      .select("id, reason, previous_dealer_cost, dealer_cost, previous_list_price, list_price, currency, current_selling_price, suggested_selling_price, detected_at, inventory_items(id, sku, name, quantity_on_hand), supplier_price_watches(id, supplier_code, query_part_number, confirmed_currency)")
      .eq("status", "open").order("detected_at", { ascending: false }).limit(100),
    supabase.from("supplier_price_watches")
      .select("id, supplier_code, query_part_number, confirmed_currency, last_dealer_cost, last_list_price, last_currency, last_checked_at, last_error, inventory_items(id, sku, name, quantity_on_hand)")
      .eq("active", true).order("created_at", { ascending: false }).limit(100),
    supabase.from("supplier_price_currency_settings")
      .select("supplier_code, currency, confirmed_at"),
  ]);
  const alerts = (alertResult.data ?? []) as unknown as AlertRow[];
  const watches = (watchResult.data ?? []) as unknown as WatchRow[];
  const currencies = currencyResult.data ?? [];

  return (
    <main className="mt-5 max-w-6xl space-y-8">
      <div>
        <h2 className="font-display text-2xl font-medium text-ink">Supplier price alerts</h2>
        <p className="mt-1 max-w-3xl text-sm text-graph">
          Supplier Net/SRP changes are checked against watched stock. Exact MPS SKU matches are enrolled gradually by the hourly monitor; Western Marine can be linked from an item page. A selling-price suggestion needs human approval; historical purchase cost and average cost never change here.
        </p>
      </div>
      {(alertResult.error || watchResult.error || currencyResult.error) && (
        <p role="alert" className="rounded border border-weld/30 bg-weld/5 p-4 text-sm text-ink">
          Price monitoring tables are not ready. Apply the supplier-price migration before using this page.
        </p>
      )}
      <section className="grid gap-3 md:grid-cols-2">
        {(["marinepartssupply", "westernmarine"] as const).map((supplierCode) => {
          const setting = currencies.find((row) => row.supplier_code === supplierCode);
          return <div key={supplierCode} className="rounded border border-rule bg-paper p-4">
            <h3 className="font-medium text-ink">{supplierCode === "marinepartssupply" ? "Marine Parts Supply" : "Western Marine"} account currency</h3>
            <p className="mt-1 text-xs text-graph">{setting ? `${setting.currency} verified ${new Date(setting.confirmed_at).toLocaleString("en-CA")}` : "Not confirmed. Price changes are tracked, but CAD selling-price suggestions are withheld."}</p>
            {!setting && canManage && <ConfirmSupplierAccountCurrencyForm supplierCode={supplierCode} />}
          </div>;
        })}
      </section>
      <section>
        <h3 className="font-display text-xl text-ink">Open alerts <span className="font-mono text-sm text-graph">{alerts.length}</span></h3>
        <div className="mt-3 space-y-3">
          {alerts.map((alert) => (
            <article key={alert.id} className="rounded border border-weld/30 bg-paper p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link href={`/inventory/items/${alert.inventory_items?.id}`} className="font-medium text-ink hover:text-weld-text">
                    {alert.inventory_items?.name ?? "Stock item"} →
                  </Link>
                  <p className="mt-1 font-mono text-xs text-graph">{alert.inventory_items?.sku} · {alert.supplier_price_watches?.supplier_code === "marinepartssupply" ? "Marine Parts Supply" : "Western Marine"} {alert.supplier_price_watches?.query_part_number}</p>
                </div>
                <p className="text-xs text-graph">{new Date(alert.detected_at).toLocaleString("en-CA")}</p>
              </div>
              <p className="mt-3 text-sm text-ink">
                {alert.reason === "below_current_srp" ? "Initial price check: our item is below current SRP." : "Supplier Net and/or SRP increased."}
              </p>
              <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-5">
                <div><dt className="text-graph">Dealer Net</dt><dd className="mt-1 font-mono text-ink">{money(alert.previous_dealer_cost, alert.currency)} → {money(alert.dealer_cost, alert.currency)}</dd></div>
                <div><dt className="text-graph">Supplier SRP</dt><dd className="mt-1 font-mono text-ink">{money(alert.previous_list_price, alert.currency)} → {money(alert.list_price, alert.currency)}</dd></div>
                <div><dt className="text-graph">Our sell</dt><dd className="mt-1 font-mono text-ink">{money(alert.current_selling_price, "CAD")}</dd></div>
                <div><dt className="text-graph">Suggested sell</dt><dd className="mt-1 font-mono text-ink">{money(alert.suggested_selling_price, alert.suggested_selling_price === null ? null : "CAD")}</dd></div>
                <div><dt className="text-graph">On hand</dt><dd className="mt-1 font-mono text-ink">{alert.inventory_items?.quantity_on_hand ?? "—"}</dd></div>
              </dl>
              <p className="mt-3 text-xs text-graph">
                Suggestion = greater of current sell + supplier Net increase or current SRP. This protects the current gross-profit amount; review market fit before approving.
              </p>
              {alert.suggested_selling_price === null && !alert.supplier_price_watches?.confirmed_currency && canManage && (
                <div className="mt-3 rounded border border-rule bg-canvas p-3">
                  <p className="text-xs text-graph">The portal does not state its currency. Confirm the dealer account currency to enable a CAD suggestion.</p>
                  {alert.supplier_price_watches && <ConfirmPriceWatchCurrencyForm watchId={alert.supplier_price_watches.id} />}
                </div>
              )}
              {canManage && <PriceAlertDecisionButtons alertId={alert.id} canApprove={alert.suggested_selling_price !== null} />}
            </article>
          ))}
          {!alerts.length && <p className="rounded border border-rule bg-paper p-5 text-sm text-graph">No open price changes. Watches are listed below.</p>}
        </div>
      </section>
      <section>
        <h3 className="font-display text-xl text-ink">Watched stock <span className="font-mono text-sm text-graph">{watches.length}</span></h3>
        <p className="mt-1 text-xs text-graph">Add a watch from an inventory item page. Only exact dealer part/code matches are accepted.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {watches.map((watch) => (
            <article key={watch.id} className="rounded border border-rule bg-paper p-4">
              <Link href={`/inventory/items/${watch.inventory_items?.id}`} className="font-medium text-ink hover:text-weld-text">
                {watch.inventory_items?.name ?? "Stock item"} →
              </Link>
              <p className="mt-1 font-mono text-xs text-graph">{watch.inventory_items?.sku} · {watch.supplier_code === "marinepartssupply" ? "Marine Parts Supply" : "Western Marine"} {watch.query_part_number}</p>
              <p className="mt-2 text-xs text-graph">Last Net {money(watch.last_dealer_cost, watch.last_currency)} · SRP {money(watch.last_list_price, watch.last_currency)}</p>
              <p className="mt-1 text-xs text-graph">Checked {watch.last_checked_at ? new Date(watch.last_checked_at).toLocaleString("en-CA") : "not yet"}</p>
              {watch.last_error && <p role="alert" className="mt-2 text-xs text-weld-text">Check failed: {watch.last_error}</p>}
              {canManage && <div className="mt-3"><CheckSupplierPriceWatchButton watchId={watch.id} /></div>}
              {canManage && !watch.confirmed_currency && <ConfirmPriceWatchCurrencyForm watchId={watch.id} />}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
