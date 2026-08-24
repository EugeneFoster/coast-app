import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoicePrintButton } from "@/components/invoice-print-button";
import { VoidCounterSaleForm } from "@/components/void-counter-sale-form";
import { requireCounterSalesViewer } from "@/lib/auth";
import {
  counterSalePaymentMethodLabel,
  counterSaleStatusLabel,
} from "@/lib/counter-sales";
import {
  getCounterSaleCosts,
  getCounterSaleDetail,
} from "@/lib/counter-sales-data";
import { canViewProfitability } from "@/lib/employee-roles";
import { formatQuantity } from "@/lib/inventory";
import { formatCad } from "@/lib/sales";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function formatReceiptDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Vancouver",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default async function CounterSaleReceiptPage({
  params,
}: {
  params: Promise<{ counterSaleId: string }>;
}) {
  const { counterSaleId } = await params;
  if (!UUID_RE.test(counterSaleId)) notFound();
  const { profile } = await requireCounterSalesViewer();
  const detail = await getCounterSaleDetail(counterSaleId);
  if (!detail) notFound();
  const { sale, items } = detail;
  const canSeeProfitability = canViewProfitability(profile.role);
  const costs = canSeeProfitability
    ? await getCounterSaleCosts(counterSaleId)
    : [];
  const cogs = costs.reduce((sum, cost) => sum + cost.total_cost, 0);
  const revenueBeforeTax = sale.subtotal;
  const grossProfit = revenueBeforeTax - cogs;
  const margin = revenueBeforeTax > 0 ? grossProfit * 100 / revenueBeforeTax : null;

  return (
    <main className="quote-page mt-7">
      <div className="print-hidden">
        <Link href="/counter-sales" className="text-sm text-graph hover:text-ink">← Counter sales</Link>
      </div>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-5 border-b border-rule pb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-graph">COAST Metal Works</p>
          <h2 className="mt-2 font-display text-3xl font-medium text-ink">Sales receipt</h2>
          <p className="mt-1 font-mono text-sm text-graph">{sale.sale_number}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className={`rounded border px-3 py-1.5 text-sm ${sale.status === "completed" ? "border-rule text-ink" : "border-weld text-weld"}`}>
            {counterSaleStatusLabel(sale.status)}
          </span>
          <InvoicePrintButton />
        </div>
      </header>

      {sale.status === "void" && (
        <section className="mt-6 rounded border border-weld p-4 text-sm text-weld">
          <p className="font-medium">VOID RECEIPT — stock returned</p>
          <p className="mt-1">{sale.void_reason}</p>
          <p className="mt-1 text-xs">Voided {sale.voided_at ? formatReceiptDate(sale.voided_at) : ""}</p>
        </section>
      )}

      <section className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="rounded border border-rule bg-paper p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-graph">Sold to</p>
          <h3 className="mt-2 font-display text-xl text-ink">{sale.customer_name}</h3>
          <p className="mt-2 text-sm text-graph">
            {sale.client_id ? "CRM customer" : "Walk-in sale"}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-4 rounded border border-rule bg-paper p-5 text-sm">
          <div><dt className="text-xs text-graph">Completed</dt><dd className="mt-1">{formatReceiptDate(sale.completed_at)}</dd></div>
          <div><dt className="text-xs text-graph">Currency</dt><dd className="mt-1">CAD</dd></div>
          <div><dt className="text-xs text-graph">Payment</dt><dd className="mt-1">{counterSalePaymentMethodLabel(sale.payment_method)}</dd></div>
          <div><dt className="text-xs text-graph">Reference</dt><dd className="mt-1 break-words">{sale.payment_reference ?? "—"}</dd></div>
        </dl>
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between gap-4">
          <h3 className="font-display text-xl font-medium text-ink">Items</h3>
          <span className="font-mono text-xs text-graph">{items.length} items</span>
        </div>
        <div className="mt-4 overflow-hidden rounded border border-rule bg-paper">
          <div className="hidden grid-cols-[8rem_1fr_8rem_8rem_8rem] gap-3 border-b border-rule px-4 py-2 text-xs uppercase tracking-wide text-graph md:grid">
            <span>SKU</span><span>Description</span><span>Quantity</span><span>Unit price</span><span className="text-right">Total</span>
          </div>
          {items.map((item) => (
            <div key={item.id} className="grid gap-2 border-b border-rule px-4 py-3 text-sm last:border-0 md:grid-cols-[8rem_1fr_8rem_8rem_8rem] md:items-center md:gap-3">
              <span className="font-mono text-xs text-weld">{item.sku}</span>
              <span className="text-ink">{item.description}</span>
              <span className="font-mono text-xs text-graph">{formatQuantity(item.quantity, item.unit)}</span>
              <span className="font-mono text-xs text-ink">{formatCad(item.unit_price)}</span>
              <span className="text-right font-mono text-sm text-ink">{formatCad(item.line_total)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 ml-auto max-w-md rounded border border-rule bg-paper p-5">
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-graph">Subtotal</dt><dd className="font-mono">{formatCad(sale.subtotal)}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-graph">Tax ({sale.tax_rate_percent}%)</dt><dd className="font-mono">{formatCad(sale.tax_amount)}</dd></div>
          <div className="flex justify-between gap-4 border-t border-ink pt-3 text-lg"><dt className="font-display">Total paid</dt><dd className="font-mono">{formatCad(sale.total)}</dd></div>
        </dl>
      </section>

      <p className="mt-8 text-center text-xs text-graph">
        Thank you. Payment recorded as {counterSalePaymentMethodLabel(sale.payment_method).toLowerCase()}.
      </p>

      {canSeeProfitability && sale.status === "completed" && (
        <section className="print-hidden mt-8 rounded border border-rule bg-paper p-5">
          <h3 className="font-display text-lg font-medium text-ink">Parts margin</h3>
          <p className="mt-1 text-xs text-graph">Internal only · excludes sales tax.</p>
          <dl className="mt-4 grid gap-4 sm:grid-cols-3">
            <div><dt className="text-xs text-graph">Revenue</dt><dd className="mt-1 font-mono text-lg text-ink">{formatCad(revenueBeforeTax)}</dd></div>
            <div><dt className="text-xs text-graph">COGS</dt><dd className="mt-1 font-mono text-lg text-ink">{formatCad(cogs)}</dd></div>
            <div><dt className="text-xs text-graph">Gross profit</dt><dd className="mt-1 font-mono text-lg text-ink">{formatCad(grossProfit)}{margin === null ? "" : ` · ${margin.toFixed(2)}%`}</dd></div>
          </dl>
        </section>
      )}

      {sale.status === "completed" && (
        <section className="print-hidden mt-8 border-t border-rule pt-8">
          <VoidCounterSaleForm counterSaleId={sale.id} />
        </section>
      )}
    </main>
  );
}
