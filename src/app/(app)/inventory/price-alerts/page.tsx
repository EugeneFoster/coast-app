import Link from "next/link";
import { CheckSupplierPriceWatchButton, ConfirmPriceWatchCurrencyForm, ConfirmSupplierAccountCurrencyForm, PriceAlertDecisionButtons } from "@/components/supplier-price-watch-controls";
import { requirePurchasingViewer } from "@/lib/auth";
import { canManageInventory } from "@/lib/employee-roles";
import { requiresPriceAlertReview } from "@/lib/suppliers/price-alert-review";
import { suspiciousPackageDifference } from "@/lib/suppliers/package-pricing";
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
  package_units: number | null;
  pack_check_required: boolean;
  detected_at: string;
  inventory_items: { id: string; sku: string; name: string; unit: string; quantity_on_hand: number } | null;
  supplier_price_watches: { id: string; supplier_code: string; query_part_number: string; confirmed_currency: string | null; pack_source: string | null } | null;
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
  supplier_units_per_pack: number | null;
  pack_source: string | null;
  inventory_items: { id: string; sku: string; name: string; unit: string; quantity_on_hand: number } | null;
};

function money(value: number | null, currency: string | null) {
  if (value === null) return "—";
  const formatted = new Intl.NumberFormat("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  return currency ? `${formatted} ${currency}` : `${formatted} (currency unconfirmed)`;
}

function date(value: string | null) {
  return value ? new Date(value).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" }) : "Not checked yet";
}

function supplierName(code: string | undefined) {
  return code === "marinepartssupply" ? "Marine Parts Supply" : "Western Marine";
}

function AlertCard({ alert, canManage }: { alert: AlertRow; canManage: boolean }) {
  const unitDealerCost = alert.dealer_cost === null ? null : alert.dealer_cost / (alert.package_units ?? 1);
  const needsReview = requiresPriceAlertReview(alert.current_selling_price, unitDealerCost, alert.suggested_selling_price);
  const increase = alert.current_selling_price !== null && alert.suggested_selling_price !== null
    ? alert.suggested_selling_price - alert.current_selling_price : null;
  const jump = alert.current_selling_price !== null && alert.current_selling_price > 0 && alert.suggested_selling_price !== null
    ? Math.round(alert.suggested_selling_price / alert.current_selling_price) : null;
  const stock = alert.inventory_items;
  const supplier = alert.supplier_price_watches;
  const unit = stock?.unit ?? "ea";
  const isUnverified = alert.pack_check_required ||
    (alert.package_units === null && suspiciousPackageDifference(alert.current_selling_price, alert.list_price));

  return (
    <article className={`rounded-[4px] border bg-paper p-4 md:p-5 ${needsReview || isUnverified ? "border-amber-500/70" : "border-rule"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {stock ? <Link href={`/inventory/items/${stock.id}`} className="text-base font-medium leading-tight text-ink hover:text-weld-text">
            {stock.name} <span aria-hidden>↗</span>
          </Link> : <span className="text-base font-medium text-ink">Stock item</span>}
          <p className="mt-1 font-mono text-[11px] text-graph">{stock?.sku ?? "No SKU"} · {supplierName(supplier?.supplier_code)} {supplier?.query_part_number}</p>
        </div>
        <span className={`shrink-0 rounded-[3px] border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] ${alert.reason === "supplier_increase" ? "border-weld/50 text-weld-text" : "border-rule text-graph"}`}>
          {alert.reason === "supplier_increase" ? "Supplier increased price" : "Initial SRP review"}
        </span>
      </div>

      <div className="mt-4 grid gap-3 rounded-[4px] border border-rule bg-bone p-3 sm:p-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-graph">Our price now</p>
          <p className="mt-1 font-display text-[26px] font-medium leading-none text-ink">{money(alert.current_selling_price, "CAD")}<span className="ml-1 font-sans text-xs text-graph">/{unit}</span></p>
        </div>
        <div className="border-t border-rule pt-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-graph">Suggested new price</p>
          <p className="mt-1 font-display text-[28px] font-medium leading-none text-weld-text">
            {alert.suggested_selling_price === null ? (isUnverified ? "Check package size" : "Pending currency") : money(alert.suggested_selling_price, "CAD")}
          </p>
          {alert.suggested_selling_price !== null && <p className="mt-1 text-xs text-graph">per {unit}</p>}
          {increase !== null && <p className="mt-2 font-mono text-xs text-graph">+{money(increase, "CAD")}</p>}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-graph">
        <span>{alert.reason === "supplier_increase" ? "Dealer Net or SRP increased since the last check." : "First CAD comparison: our price is below supplier SRP. This is not a new supplier increase."}</span>
        <span>On hand: <strong className="font-medium text-ink">{stock?.quantity_on_hand ?? "—"}</strong></span>
      </div>

      {alert.package_units !== null && <p className="mt-3 rounded-[4px] border border-rule bg-bone p-3 text-xs text-ink">
        Dealer package: <strong>{alert.package_units} pieces</strong>. Net {money(alert.dealer_cost, alert.currency)} ÷ {alert.package_units} = <strong>{money(unitDealerCost, alert.currency)}/{unit}</strong>;
        SRP {money(alert.list_price, alert.currency)} ÷ {alert.package_units} = <strong>{money(alert.list_price === null ? null : alert.list_price / alert.package_units, alert.currency)}/{unit}</strong>.
        {supplier?.pack_source?.startsWith("https://") && <a href={supplier.pack_source} target="_blank" rel="noopener noreferrer" className="ml-2 text-weld-text underline">Package source ↗</a>}
      </p>}

      {isUnverified && <div role="alert" className="mt-4 rounded-[4px] border border-amber-500/60 bg-bone p-3 text-sm text-ink">
        <p className="font-medium">Package quantity not verified — approval blocked</p>
        <p className="mt-1 text-xs leading-5">The dealer price may be for a whole package while this stock item is sold per {unit}. Verify the supplier pack count before comparing prices.</p>
      </div>}

      {needsReview && !isUnverified && <div role="alert" className="mt-4 rounded-[4px] border border-amber-500/60 bg-bone p-3 text-sm text-ink">
        <p className="font-medium">Check the SKU and selling unit before approving</p>
        <p className="mt-1 text-xs leading-5">Our current price is below dealer Net, and the proposal is {jump ? `about ${jump}×` : "at least 3×"} higher. A pack-size or item-mapping difference could explain this jump. Approval requires an explicit item check.</p>
      </div>}

      <details className="mt-4 border-t border-rule pt-3 text-xs text-graph">
        <summary className="cursor-pointer select-none font-medium text-ink marker:text-graph">Supplier prices and calculation</summary>
        <dl className="mt-3 grid gap-3">
          <div><dt className="font-mono text-[10px] uppercase tracking-[0.12em]">Dealer Net</dt><dd className="mt-1 font-mono text-sm text-ink">{money(alert.previous_dealer_cost, alert.currency)} → {money(alert.dealer_cost, alert.currency)}</dd></div>
          <div><dt className="font-mono text-[10px] uppercase tracking-[0.12em]">Supplier SRP</dt><dd className="mt-1 font-mono text-sm text-ink">{money(alert.previous_list_price, alert.currency)} → {money(alert.list_price, alert.currency)}</dd></div>
        </dl>
        <p className="mt-3 leading-5">Dealer Net and SRP are divided by the verified package quantity before comparing with our per-{unit} selling price. The proposal protects the current gross-profit amount. Historical purchase cost does not change.</p>
        <p className="mt-2">Checked {date(alert.detected_at)}</p>
      </details>

      {alert.suggested_selling_price === null && !isUnverified && !supplier?.confirmed_currency && canManage && (
        <div className="mt-3 rounded-[4px] border border-rule bg-bone p-3">
          <p className="text-xs text-graph">Confirm the dealer account currency to enable a CAD proposal.</p>
          {supplier && <ConfirmPriceWatchCurrencyForm watchId={supplier.id} />}
        </div>
      )}
      {canManage && <PriceAlertDecisionButtons alertId={alert.id} canApprove={!isUnverified && alert.suggested_selling_price !== null} suggestedPrice={alert.suggested_selling_price} requiresReview={needsReview} />}
    </article>
  );
}

export default async function SupplierPriceAlertsPage() {
  const { profile } = await requirePurchasingViewer();
  const canManage = canManageInventory(profile.role);
  const supabase = await createClient();
  const [alertResult, watchResult, currencyResult] = await Promise.all([
    supabase.from("supplier_price_alerts")
      .select("id, reason, previous_dealer_cost, dealer_cost, previous_list_price, list_price, currency, current_selling_price, suggested_selling_price, package_units, pack_check_required, detected_at, inventory_items(id, sku, name, unit, quantity_on_hand), supplier_price_watches(id, supplier_code, query_part_number, confirmed_currency, pack_source)")
      .eq("status", "open").order("detected_at", { ascending: false }).limit(100),
    supabase.from("supplier_price_watches")
      .select("id, supplier_code, query_part_number, confirmed_currency, last_dealer_cost, last_list_price, last_currency, last_checked_at, last_error, supplier_units_per_pack, pack_source, inventory_items(id, sku, name, unit, quantity_on_hand)")
      .eq("active", true).order("created_at", { ascending: false }).limit(100),
    supabase.from("supplier_price_currency_settings")
      .select("supplier_code, currency, confirmed_at"),
  ]);
  const alerts = (alertResult.data ?? []) as unknown as AlertRow[];
  const watches = (watchResult.data ?? []) as unknown as WatchRow[];
  const currencies = currencyResult.data ?? [];
  const increases = alerts.filter((alert) => alert.reason === "supplier_increase");
  const firstReviews = alerts.filter((alert) => alert.reason !== "supplier_increase")
    .sort((left, right) => Number(right.pack_check_required) - Number(left.pack_check_required));

  return (
    <main className="mt-5 max-w-6xl space-y-7">
      <header>
        <h2 className="font-display text-2xl font-medium text-ink">Supplier price alerts</h2>
        <p className="mt-1 text-sm text-graph">Review proposed CAD selling prices. Nothing changes on stock until you approve it.</p>
      </header>

      {(alertResult.error || watchResult.error || currencyResult.error) && (
        <p role="alert" className="rounded border border-weld/30 bg-weld/5 p-4 text-sm text-ink">
          Price monitoring tables are not ready. Apply the supplier-price migration before using this page.
        </p>
      )}

      {increases.length > 0 && <section aria-labelledby="supplier-increases-heading">
        <div className="flex items-baseline gap-2">
          <h3 id="supplier-increases-heading" className="font-display text-xl text-ink">Changed by supplier</h3>
          <span className="font-mono text-xs text-graph">{increases.length}</span>
        </div>
        <div className="mt-3 space-y-3">
          {increases.map((alert) => <AlertCard key={alert.id} alert={alert} canManage={canManage} />)}
        </div>
      </section>}

      {firstReviews.length > 0 && <section aria-labelledby="initial-reviews-heading">
        <div className="flex items-baseline gap-2">
          <h3 id="initial-reviews-heading" className="font-display text-xl text-ink">Initial price reviews</h3>
          <span className="font-mono text-xs text-graph">{firstReviews.length}</span>
        </div>
        <p className="mt-1 text-xs text-graph">First comparison with CAD supplier SRP, not a newly increased supplier price.</p>
        <div className="mt-3 space-y-3">
          {firstReviews.map((alert) => <AlertCard key={alert.id} alert={alert} canManage={canManage} />)}
        </div>
      </section>}
      {!increases.length && !firstReviews.length && !alertResult.error && (
        <p className="rounded-[4px] border border-rule bg-paper p-4 text-sm text-graph">No price alerts need review.</p>
      )}

      <details className="rounded-[4px] border border-rule bg-paper p-4 md:p-5">
        <summary className="cursor-pointer select-none font-display text-lg text-ink marker:text-graph">Monitored stock · {watches.length} items</summary>
        <p className="mt-2 text-xs text-graph">Exact supplier part-code matches. Open an item to change or add its watch.</p>
        <div className="mt-4 space-y-3">
          {watches.map((watch) => (
            <article key={watch.id} className="rounded-[4px] border border-rule bg-bone p-3">
              {watch.inventory_items ? <Link href={`/inventory/items/${watch.inventory_items.id}`} className="font-medium text-ink hover:text-weld-text">{watch.inventory_items.name} ↗</Link> : <span className="font-medium text-ink">Stock item</span>}
              <p className="mt-1 font-mono text-[11px] text-graph">{watch.inventory_items?.sku} · {supplierName(watch.supplier_code)} {watch.query_part_number}</p>
              <p className="mt-2 text-xs text-graph">Net {money(watch.last_dealer_cost, watch.last_currency)} · SRP {money(watch.last_list_price, watch.last_currency)}{watch.supplier_units_per_pack && ` · package of ${watch.supplier_units_per_pack}`}</p>
              <p className="mt-1 text-xs text-graph">Checked {date(watch.last_checked_at)}</p>
              {watch.last_error && <p role="alert" className="mt-2 text-xs text-weld-text">Check failed: {watch.last_error}</p>}
              {canManage && <div className="mt-3"><CheckSupplierPriceWatchButton watchId={watch.id} /></div>}
              {canManage && !watch.confirmed_currency && <ConfirmPriceWatchCurrencyForm watchId={watch.id} />}
            </article>
          ))}
        </div>
      </details>

      <details className="rounded-[4px] border border-rule bg-paper p-4 md:p-5">
        <summary className="cursor-pointer select-none font-display text-lg text-ink marker:text-graph">
          Dealer account currencies <span className="ml-2 font-sans text-xs text-graph">{(["marinepartssupply", "westernmarine"] as const).map((code) => {
            const setting = currencies.find((row) => row.supplier_code === code);
            return `${code === "marinepartssupply" ? "MPS" : "Western Marine"} ${setting?.currency ?? "unconfirmed"}`;
          }).join(" · ")}</span>
        </summary>
        <div className="mt-4 space-y-3">
          {(["marinepartssupply", "westernmarine"] as const).map((supplierCode) => {
            const setting = currencies.find((row) => row.supplier_code === supplierCode);
            return <div key={supplierCode} className="rounded-[4px] border border-rule bg-bone p-4">
              <h3 className="font-medium text-ink">{supplierName(supplierCode)}</h3>
              <p className="mt-1 text-xs text-graph">{setting ? `${setting.currency} confirmed ${date(setting.confirmed_at)}` : "Not confirmed. CAD proposals are withheld."}</p>
              {!setting && canManage && <ConfirmSupplierAccountCurrencyForm supplierCode={supplierCode} />}
            </div>;
          })}
        </div>
      </details>
    </main>
  );
}
