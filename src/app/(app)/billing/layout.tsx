import { requireBillingViewer } from "@/lib/auth";

export default async function BillingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireBillingViewer();
  return (
    <div className="billing-shell mx-auto max-w-7xl px-8 pb-12 pt-8">
      <header className="print-hidden">
        <p className="text-xs uppercase tracking-[0.2em] text-weld">Accounts receivable</p>
        <h1 className="mt-2 font-display text-3xl font-medium text-ink">Billing</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-graph">
          Customer invoices, deposits, payment history, and project profitability.
        </p>
      </header>
      {children}
    </div>
  );
}
