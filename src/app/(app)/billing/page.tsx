import Link from "next/link";
import { getBillingDashboard, getBillingProjects } from "@/lib/billing-data";
import { invoiceStatusLabel } from "@/lib/billing";
import { requireBillingViewer } from "@/lib/auth";
import {
  canManageBilling,
  canViewProfitability,
} from "@/lib/employee-roles";
import { formatCad, formatShortDate } from "@/lib/sales";
import type { InvoiceStatus } from "@/lib/types";

const statusClass: Record<InvoiceStatus, string> = {
  draft: "border-rule text-graph",
  sent: "border-ink/40 text-ink",
  partially_paid: "border-weld text-weld",
  paid: "border-ink bg-ink text-bone",
  void: "border-rule text-graph opacity-60",
};

function vancouverDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Vancouver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default async function BillingPage() {
  const { profile } = await requireBillingViewer();
  const showProfitability = canViewProfitability(profile.role);
  const [invoices, projects] = await Promise.all([
    getBillingDashboard(),
    showProfitability ? getBillingProjects() : Promise.resolve([]),
  ]);
  const today = vancouverDate();
  const openInvoices = invoices.filter(({ status }) =>
    status === "sent" || status === "partially_paid",
  );
  const overdue = openInvoices.filter(
    ({ due_date, balance_due }) => Boolean(due_date && due_date < today && balance_due > 0),
  );
  const openBalance = openInvoices.reduce(
    (sum, invoice) => sum + Number(invoice.balance_due),
    0,
  );
  const received = invoices.reduce(
    (sum, invoice) => sum + Number(invoice.amount_paid),
    0,
  );
  const drafts = invoices.filter(({ status }) => status === "draft").length;

  return (
    <main className="mt-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-medium text-ink">Accounts receivable</h2>
          <p className="mt-1 text-sm text-graph">{invoices.length} customer invoices</p>
        </div>
        {canManageBilling(profile.role) && (
          <Link href="/billing/new" className="btn-primary px-4 py-2 text-sm">
            + New invoice
          </Link>
        )}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded border border-rule bg-paper p-4">
          <p className="text-xs uppercase tracking-wide text-graph">Open A/R</p>
          <p className="mt-2 font-mono text-2xl text-ink">{formatCad(openBalance)}</p>
          <p className="mt-1 text-xs text-graph">{openInvoices.length} open invoices</p>
        </div>
        <div className="rounded border border-rule bg-paper p-4">
          <p className="text-xs uppercase tracking-wide text-graph">Overdue</p>
          <p className={`mt-2 font-mono text-2xl ${overdue.length ? "text-weld" : "text-ink"}`}>
            {overdue.length}
          </p>
          <p className="mt-1 text-xs text-graph">Past due with a balance</p>
        </div>
        <div className="rounded border border-rule bg-paper p-4">
          <p className="text-xs uppercase tracking-wide text-graph">Received</p>
          <p className="mt-2 font-mono text-2xl text-ink">{formatCad(received)}</p>
          <p className="mt-1 text-xs text-graph">Active deposits and payments</p>
        </div>
        <div className="rounded border border-rule bg-paper p-4">
          <p className="text-xs uppercase tracking-wide text-graph">Drafts</p>
          <p className="mt-2 font-mono text-2xl text-ink">{drafts}</p>
          <p className="mt-1 text-xs text-graph">Not yet sent</p>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded border border-rule bg-paper">
        <table className="w-full min-w-[68rem] border-collapse text-left text-sm">
          <thead className="border-b border-rule bg-ink/[0.03] text-xs uppercase tracking-wide text-graph">
            <tr>
              <th className="px-4 py-3 font-medium">Invoice</th>
              <th className="px-4 py-3 font-medium">Customer / project</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Issued</th>
              <th className="px-4 py-3 font-medium">Due</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
              <th className="px-4 py-3 text-right font-medium">Paid</th>
              <th className="px-4 py-3 text-right font-medium">Balance</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => {
              const isOverdue = Boolean(
                invoice.due_date &&
                  invoice.due_date < today &&
                  invoice.balance_due > 0 &&
                  (invoice.status === "sent" || invoice.status === "partially_paid"),
              );
              return (
                <tr key={invoice.id} className="border-b border-rule last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/billing/${invoice.id}`} className="font-medium text-ink hover:text-weld">
                      {invoice.invoice_number}
                    </Link>
                    <p className="mt-0.5 max-w-64 truncate text-xs text-graph">{invoice.title}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-ink">{invoice.customer_name}</p>
                    <p className="mt-0.5 text-xs text-graph">{invoice.project_name ?? "No project"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded border px-2.5 py-1 text-xs ${statusClass[invoice.status]}`}>
                      {invoiceStatusLabel(invoice.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-graph">{formatShortDate(invoice.issue_date)}</td>
                  <td className={`px-4 py-3 font-mono text-xs ${isOverdue ? "font-medium text-weld" : "text-graph"}`}>
                    {formatShortDate(invoice.due_date)}{isOverdue ? " · overdue" : ""}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-ink">{formatCad(invoice.total)}</td>
                  <td className="px-4 py-3 text-right font-mono text-graph">{formatCad(invoice.amount_paid)}</td>
                  <td className="px-4 py-3 text-right font-mono font-medium text-ink">{formatCad(invoice.balance_due)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {invoices.length === 0 && (
          <p className="px-4 py-12 text-center text-sm text-graph">
            No invoices yet. Create one from an accepted quote or start a blank invoice.
          </p>
        )}
      </div>

      {showProfitability && (
        <section className="mt-10 border-t border-rule pt-8">
          <div>
            <h2 className="font-display text-2xl font-medium text-ink">Project profitability</h2>
            <p className="mt-1 text-sm text-graph">
              Revenue, labor, materials, overhead, and gross margin by project.
            </p>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/billing/projects/${project.id}`}
                className="rounded border border-rule bg-paper p-4 transition-colors hover:border-weld"
              >
                <p className="font-medium text-ink">{project.name}</p>
                <p className="mt-1 text-xs text-graph">{project.client_name ?? "No customer"}</p>
                <p className="mt-4 text-xs font-medium text-weld">View profitability →</p>
              </Link>
            ))}
            {projects.length === 0 && (
              <p className="text-sm text-graph">No customer projects available.</p>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
