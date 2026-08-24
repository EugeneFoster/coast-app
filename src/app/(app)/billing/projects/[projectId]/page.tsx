import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectFinancialSettingsForm } from "@/components/project-financial-settings-form";
import { requireProfitabilityViewer } from "@/lib/auth";
import { invoiceStatusLabel } from "@/lib/billing";
import { getProjectProfitability } from "@/lib/billing-data";
import { canManageProjectFinancials } from "@/lib/employee-roles";
import { formatCad, formatShortDate } from "@/lib/sales";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function ProjectProfitabilityPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  if (!UUID_RE.test(projectId)) notFound();
  const { profile } = await requireProfitabilityViewer();
  const { profitability, settings, invoices } = await getProjectProfitability(projectId);
  if (!profitability) notFound();
  const margin = profitability.gross_margin_percent;
  const profitable = profitability.gross_profit >= 0;

  return (
    <main className="mt-7">
      <Link href="/billing" className="text-sm text-graph hover:text-ink">← Billing</Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-weld">Project profitability</p>
          <h2 className="mt-2 font-display text-2xl font-medium text-ink">{profitability.project_name}</h2>
          <p className="mt-1 text-sm text-graph">{profitability.client_name ?? "No customer"}</p>
        </div>
        <Link href={`/projects/${projectId}`} className="btn-secondary px-4 py-2 text-sm">Open project</Link>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded border border-rule bg-paper p-4">
          <p className="text-xs uppercase tracking-wide text-graph">Invoiced revenue</p>
          <p className="mt-2 font-mono text-2xl text-ink">{formatCad(profitability.invoiced_revenue)}</p>
          <p className="mt-1 text-xs text-graph">Before tax, after discounts</p>
        </div>
        <div className="rounded border border-rule bg-paper p-4">
          <p className="text-xs uppercase tracking-wide text-graph">Payments received</p>
          <p className="mt-2 font-mono text-2xl text-ink">{formatCad(profitability.payments_received)}</p>
          <p className="mt-1 text-xs text-graph">Outstanding {formatCad(profitability.outstanding_balance)}</p>
        </div>
        <div className="rounded border border-rule bg-paper p-4">
          <p className="text-xs uppercase tracking-wide text-graph">Estimated project cost</p>
          <p className="mt-2 font-mono text-2xl text-ink">{formatCad(profitability.total_cost)}</p>
          <p className="mt-1 text-xs text-graph">Labor + materials + overhead</p>
        </div>
        <div className="rounded border border-rule bg-paper p-4">
          <p className="text-xs uppercase tracking-wide text-graph">Gross profit</p>
          <p className={`mt-2 font-mono text-2xl ${profitable ? "text-ink" : "text-weld"}`}>{formatCad(profitability.gross_profit)}</p>
          <p className="mt-1 text-xs text-graph">{margin === null ? "No invoiced revenue" : `${margin.toFixed(2)}% gross margin`}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_24rem]">
        <section className="rounded border border-rule bg-paper p-5">
          <h3 className="font-display text-xl font-medium text-ink">Cost breakdown</h3>
          <dl className="mt-5 space-y-4 text-sm">
            <div className="flex justify-between gap-4 border-b border-rule pb-3">
              <dt>
                <span className="text-ink">Labor</span>
                <span className="ml-2 text-xs text-graph">{Number(profitability.labor_hours)} hr × {formatCad(profitability.labor_cost_rate)}</span>
              </dt>
              <dd className="font-mono text-ink">{formatCad(profitability.labor_cost)}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-rule pb-3">
              <dt className="text-ink">Materials & direct parts COGS</dt>
              <dd className="font-mono text-ink">{formatCad(profitability.material_cost)}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-rule pb-3">
              <dt className="text-ink">Project overhead</dt>
              <dd className="font-mono text-ink">{formatCad(profitability.overhead_cost)}</dd>
            </div>
            <div className="flex justify-between gap-4 pt-1 text-lg">
              <dt className="font-display text-ink">Total estimated cost</dt>
              <dd className="font-mono text-ink">{formatCad(profitability.total_cost)}</dd>
            </div>
          </dl>
        </section>
        <aside className="rounded border border-rule bg-paper p-5 text-sm leading-6 text-graph">
          <h3 className="font-display text-lg font-medium text-ink">How this is calculated</h3>
          <p className="mt-3">Revenue includes Sent, Partially paid, and Paid invoices before sales tax.</p>
          <p className="mt-3">Labor uses approved time entries multiplied by the internal blended cost rate below.</p>
          <p className="mt-3">Materials exclude reversed warehouse issues and include COGS captured when stock-linked invoice lines are sent.</p>
          <p className="mt-3">Margin is operational gross margin, not final accounting profit.</p>
        </aside>
      </div>

      {canManageProjectFinancials(profile.role) && (
        <div className="mt-6">
          <ProjectFinancialSettingsForm
            projectId={projectId}
            laborCostRate={Number(settings?.labor_cost_rate ?? 0)}
            overheadCost={Number(settings?.overhead_cost ?? 0)}
          />
        </div>
      )}

      <section className="mt-10 border-t border-rule pt-8">
        <h3 className="font-display text-xl font-medium text-ink">Project invoices</h3>
        <div className="mt-4 overflow-x-auto rounded border border-rule bg-paper">
          <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
            <thead className="border-b border-rule text-xs uppercase tracking-wide text-graph">
              <tr><th className="px-4 py-3 font-medium">Invoice</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Issued</th><th className="px-4 py-3 text-right font-medium">Revenue pre-tax</th><th className="px-4 py-3 text-right font-medium">Balance</th></tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="border-b border-rule last:border-0">
                  <td className="px-4 py-3"><Link href={`/billing/${invoice.id}`} className="font-medium text-ink hover:text-weld">{invoice.invoice_number}</Link><p className="mt-0.5 text-xs text-graph">{invoice.title}</p></td>
                  <td className="px-4 py-3 text-graph">{invoiceStatusLabel(invoice.status)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-graph">{formatShortDate(invoice.issue_date)}</td>
                  <td className="px-4 py-3 text-right font-mono text-ink">{formatCad(Number(invoice.subtotal) - Number(invoice.discount_amount))}</td>
                  <td className="px-4 py-3 text-right font-mono text-ink">{formatCad(invoice.balance_due)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {invoices.length === 0 && <p className="px-4 py-10 text-center text-sm text-graph">No invoices assigned to this project.</p>}
        </div>
      </section>
    </main>
  );
}
