import { requireCounterSalesViewer } from "@/lib/auth";

export default async function CounterSalesLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireCounterSalesViewer();
  return (
    <div className="billing-shell mx-auto max-w-7xl px-8 pb-12 pt-8">
      <header className="print-hidden">
        <p className="text-xs uppercase tracking-[0.2em] text-weld">Parts counter</p>
        <h1 className="mt-2 font-display text-3xl font-medium text-ink">Counter sales</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-graph">
          Paid parts receipts with fast SKU entry, live stock, and auditable returns.
        </p>
      </header>
      {children}
    </div>
  );
}
