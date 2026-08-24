import Link from "next/link";
import {
  counterSalePaymentMethodLabel,
  counterSaleStatusLabel,
} from "@/lib/counter-sales";
import { getCounterSales } from "@/lib/counter-sales-data";
import { formatCad, formatShortDate } from "@/lib/sales";

export default async function CounterSalesPage() {
  const sales = await getCounterSales();
  const completed = sales.filter((sale) => sale.status === "completed");
  const paidRevenue = completed.reduce((sum, sale) => sum + sale.total, 0);
  const paidTax = completed.reduce((sum, sale) => sum + sale.tax_amount, 0);

  return (
    <main className="mt-7">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-rule pb-5">
        <div>
          <h2 className="font-display text-2xl font-medium text-ink">Paid receipts</h2>
          <p className="mt-1 text-sm text-graph">
            Completed parts sales and void history. Card entries are records, not terminal charges.
          </p>
        </div>
        <Link href="/counter-sales/new" className="btn-primary px-4 py-2 text-sm">
          New counter sale
        </Link>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded border border-rule bg-paper p-4">
          <p className="text-xs uppercase tracking-wide text-graph">Paid sales</p>
          <p className="mt-2 font-mono text-2xl text-ink">{completed.length}</p>
          <p className="mt-1 text-xs text-graph">Excludes void receipts</p>
        </div>
        <div className="rounded border border-rule bg-paper p-4">
          <p className="text-xs uppercase tracking-wide text-graph">Collected</p>
          <p className="mt-2 font-mono text-2xl text-ink">{formatCad(paidRevenue)}</p>
          <p className="mt-1 text-xs text-graph">Including tax</p>
        </div>
        <div className="rounded border border-rule bg-paper p-4">
          <p className="text-xs uppercase tracking-wide text-graph">Tax recorded</p>
          <p className="mt-2 font-mono text-2xl text-ink">{formatCad(paidTax)}</p>
          <p className="mt-1 text-xs text-graph">On active receipts</p>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded border border-rule bg-paper">
        <table className="w-full min-w-[56rem] border-collapse text-left text-sm">
          <thead className="border-b border-rule bg-ink/[0.03] text-xs uppercase tracking-wide text-graph">
            <tr>
              <th className="px-4 py-3 font-medium">Receipt</th>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Payment</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 text-right font-medium">Subtotal</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((sale) => (
              <tr key={sale.id} className={`border-b border-rule last:border-0 ${sale.status === "void" ? "opacity-55" : ""}`}>
                <td className="px-4 py-3">
                  <Link href={`/counter-sales/${sale.id}`} className="font-mono text-xs font-medium text-ink hover:text-weld">
                    {sale.sale_number}
                  </Link>
                </td>
                <td className="px-4 py-3 text-ink">{sale.customer_name}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded border px-2.5 py-1 text-xs ${sale.status === "completed" ? "border-rule text-ink" : "border-weld text-weld"}`}>
                    {counterSaleStatusLabel(sale.status)}
                  </span>
                </td>
                <td className="px-4 py-3 text-graph">{counterSalePaymentMethodLabel(sale.payment_method)}</td>
                <td className="px-4 py-3 font-mono text-xs text-graph">{formatShortDate(sale.completed_at)}</td>
                <td className="px-4 py-3 text-right font-mono text-graph">{formatCad(sale.subtotal)}</td>
                <td className="px-4 py-3 text-right font-mono font-medium text-ink">{formatCad(sale.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {sales.length === 0 && (
          <p className="px-4 py-12 text-center text-sm text-graph">
            No counter sales yet. Complete the first paid parts receipt.
          </p>
        )}
      </div>
    </main>
  );
}
