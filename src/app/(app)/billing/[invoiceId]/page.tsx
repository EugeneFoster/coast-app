import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceDetailsForm } from "@/components/invoice-details-form";
import { InvoiceItemForm } from "@/components/invoice-item-form";
import { InvoicePaymentForm } from "@/components/invoice-payment-form";
import { InvoicePrintButton } from "@/components/invoice-print-button";
import { PaymentReversalForm } from "@/components/payment-reversal-form";
import {
  deleteInvoiceItemAction,
  updateInvoiceStatusAction,
} from "@/lib/actions/billing";
import { requireBillingViewer } from "@/lib/auth";
import {
  invoicePaymentMethodLabel,
  invoicePaymentTypeLabel,
  invoiceStatusLabel,
} from "@/lib/billing";
import { getBillingInvoiceDetail } from "@/lib/billing-data";
import {
  canManageBilling,
  canViewProfitability,
} from "@/lib/employee-roles";
import { ESTIMATE_ITEM_TYPES, formatCad, formatShortDate } from "@/lib/sales";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function vancouverDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Vancouver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { invoiceId } = await params;
  if (!UUID_RE.test(invoiceId)) notFound();
  const { profile } = await requireBillingViewer();
  const detail = await getBillingInvoiceDetail(invoiceId);
  if (!detail) notFound();
  const { invoice, customer, contact, project, sourceEstimate, items, payments } = detail;
  const canManage = canManageBilling(profile.role);
  const editableDraft = canManage && invoice.status === "draft";
  const canTakePayment =
    canManage &&
    (invoice.status === "sent" || invoice.status === "partially_paid") &&
    Number(invoice.balance_due) > 0;

  return (
    <main className="quote-page mt-7">
      <div className="print-hidden">
        <Link href="/billing" className="text-sm text-graph hover:text-ink">← Billing</Link>
      </div>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-5 border-b border-rule pb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-graph">COAST Metal Works</p>
          <h2 className="mt-2 font-display text-3xl font-medium text-ink">
            {invoice.invoice_number}
          </h2>
          <p className="mt-1 text-sm text-graph">{invoice.title}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded border border-weld px-3 py-1.5 text-sm text-weld">
            {invoiceStatusLabel(invoice.status)}
          </span>
          <InvoicePrintButton />
        </div>
      </header>

      <section className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="rounded border border-rule bg-paper p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-graph">Bill to</p>
          <h3 className="mt-2 font-display text-xl text-ink">
            {customer?.name ?? "Unknown customer"}
          </h3>
          <p className="mt-2 text-sm text-graph">{contact?.contact_name ?? ""}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-graph">
            {contact?.billing_address ?? contact?.service_address ?? ""}
          </p>
          <p className="mt-1 text-sm text-graph">{contact?.email ?? ""}</p>
          <p className="mt-1 text-sm text-graph">{contact?.phone ?? ""}</p>
        </div>
        <dl className="grid grid-cols-2 gap-4 rounded border border-rule bg-paper p-5 text-sm">
          <div><dt className="text-xs text-graph">Issue date</dt><dd className="mt-1">{formatShortDate(invoice.issue_date)}</dd></div>
          <div><dt className="text-xs text-graph">Due date</dt><dd className="mt-1">{formatShortDate(invoice.due_date)}</dd></div>
          <div>
            <dt className="text-xs text-graph">Project</dt>
            <dd className="mt-1">
              {project ? (
                <Link href={`/projects/${project.id}`} className="hover:text-weld">{project.name}</Link>
              ) : "No project"}
            </dd>
          </div>
          <div><dt className="text-xs text-graph">Currency</dt><dd className="mt-1">CAD</dd></div>
          {sourceEstimate && (
            <div className="col-span-2">
              <dt className="text-xs text-graph">Source quote</dt>
              <dd className="mt-1 font-mono text-xs">{sourceEstimate.estimate_number}</dd>
            </div>
          )}
        </dl>
      </section>

      <div className="mt-6 print-hidden">
        {editableDraft ? (
          <InvoiceDetailsForm invoice={invoice} />
        ) : (
          <div className="rounded border border-rule bg-paper p-5 text-sm text-graph">
            {canManage
              ? "Sent invoices are locked. Use the payment ledger or void an unpaid invoice."
              : "Invoice details are read-only for your role."}
          </div>
        )}
      </div>

      <section className="mt-8">
        <div className="flex items-center justify-between gap-4">
          <h3 className="font-display text-xl font-medium text-ink">Line items</h3>
          <span className="font-mono text-xs text-graph">{items.length} items</span>
        </div>
        <div className="mt-4 overflow-hidden rounded border border-rule bg-paper">
          <div className="hidden grid-cols-[8rem_1fr_6rem_6rem_8rem_8rem_3rem] gap-3 border-b border-rule px-4 py-2 text-xs uppercase tracking-wide text-graph lg:grid">
            <span>Type</span><span>Description</span><span>Qty</span><span>Unit</span><span>Unit price</span><span>Total</span><span />
          </div>
          {items.map((item) => (
            <div key={item.id} className="grid gap-2 border-b border-rule px-4 py-3 text-sm last:border-b-0 lg:grid-cols-[8rem_1fr_6rem_6rem_8rem_8rem_3rem] lg:items-center lg:gap-3">
              <span className="text-xs text-graph">{ESTIMATE_ITEM_TYPES.find(({ value }) => value === item.item_type)?.label ?? item.item_type}</span>
              <span className="text-ink">{item.description}</span>
              <span className="font-mono text-xs text-graph">{item.quantity}</span>
              <span className="text-xs text-graph">{item.unit}</span>
              <span className="font-mono text-xs text-ink">{formatCad(item.unit_price)}</span>
              <span className="font-mono text-sm text-ink">{formatCad(item.line_total)}</span>
              {editableDraft ? (
                <form action={deleteInvoiceItemAction.bind(null, invoice.id, item.id)} className="print-hidden">
                  <button type="submit" className="text-xs text-graph hover:text-weld" aria-label={`Remove ${item.description}`}>×</button>
                </form>
              ) : <span />}
            </div>
          ))}
          {items.length === 0 && <p className="px-4 py-10 text-center text-sm text-graph">No line items yet.</p>}
        </div>
        {editableDraft && <div className="mt-4"><InvoiceItemForm invoiceId={invoice.id} /></div>}
      </section>

      <section className="mt-8 ml-auto max-w-md rounded border border-rule bg-paper p-5">
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-graph">Subtotal</dt><dd className="font-mono">{formatCad(invoice.subtotal)}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-graph">Discount</dt><dd className="font-mono">− {formatCad(invoice.discount_amount)}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-graph">Tax ({Number(invoice.tax_rate_percent)}%)</dt><dd className="font-mono">{formatCad(invoice.tax_amount)}</dd></div>
          <div className="flex justify-between gap-4 border-t border-ink pt-3 text-lg"><dt className="font-display">Total</dt><dd className="font-mono">{formatCad(invoice.total)}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-graph">Paid</dt><dd className="font-mono text-graph">− {formatCad(invoice.amount_paid)}</dd></div>
          <div className="flex justify-between gap-4 border-t border-rule pt-3 text-lg"><dt className="font-display">Balance due</dt><dd className="font-mono text-weld">{formatCad(invoice.balance_due)}</dd></div>
        </dl>
      </section>

      {(invoice.notes || invoice.terms) && (
        <section className="mt-8 grid gap-6 md:grid-cols-2">
          {invoice.notes && <div><h3 className="font-display text-lg text-ink">Notes</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-graph">{invoice.notes}</p></div>}
          {invoice.terms && <div><h3 className="font-display text-lg text-ink">Terms</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-graph">{invoice.terms}</p></div>}
        </section>
      )}

      <section className="print-hidden mt-10 border-t border-rule pt-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="font-display text-xl font-medium text-ink">Payment ledger</h3>
            <p className="mt-1 text-sm text-graph">Recorded entries remain visible after reversal.</p>
          </div>
          {project && canViewProfitability(profile.role) && (
            <Link href={`/billing/projects/${project.id}`} className="btn-secondary px-4 py-2 text-sm">Project profitability</Link>
          )}
        </div>
        {canTakePayment && (
          <div className="mt-5">
            <InvoicePaymentForm invoiceId={invoice.id} balanceDue={Number(invoice.balance_due)} paymentDate={vancouverDate()} />
          </div>
        )}
        <div className="mt-5 space-y-3">
          {payments.map((payment) => (
            <article key={payment.id} className={`rounded border border-rule bg-paper p-4 ${payment.reversed_at ? "opacity-55" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-ink">
                    {invoicePaymentTypeLabel(payment.payment_type)} · {invoicePaymentMethodLabel(payment.method)}
                  </p>
                  <p className="mt-1 text-xs text-graph">
                    {formatShortDate(payment.payment_date)}{payment.reference ? ` · ${payment.reference}` : ""}
                  </p>
                  {payment.note && <p className="mt-2 text-sm text-graph">{payment.note}</p>}
                  {payment.reversed_at && (
                    <p className="mt-2 text-xs text-weld">Reversed: {payment.reversal_reason}</p>
                  )}
                </div>
                <p className={`font-mono text-lg ${payment.reversed_at ? "line-through text-graph" : "text-ink"}`}>{formatCad(payment.amount)}</p>
              </div>
              {canManage && !payment.reversed_at && (
                <PaymentReversalForm invoiceId={invoice.id} paymentId={payment.id} />
              )}
            </article>
          ))}
          {payments.length === 0 && <p className="rounded border border-dashed border-rule py-8 text-center text-sm text-graph">No payments recorded.</p>}
        </div>
      </section>

      {canManage && (
        <section className="print-hidden mt-10 flex flex-wrap gap-3 border-t border-rule pt-6">
          {invoice.status === "draft" && (
            <>
              <form action={updateInvoiceStatusAction.bind(null, invoice.id, "sent")}>
                <button type="submit" className="btn-primary px-4 py-2 text-sm">Mark sent</button>
              </form>
              <form action={updateInvoiceStatusAction.bind(null, invoice.id, "void")}>
                <button type="submit" className="btn-secondary px-4 py-2 text-sm">Void draft</button>
              </form>
            </>
          )}
          {invoice.status === "sent" && Number(invoice.amount_paid) === 0 && (
            <form action={updateInvoiceStatusAction.bind(null, invoice.id, "void")}>
              <button type="submit" className="btn-secondary px-4 py-2 text-sm">Void unpaid invoice</button>
            </form>
          )}
          {invoice.status === "void" && (
            <form action={updateInvoiceStatusAction.bind(null, invoice.id, "draft")}>
              <button type="submit" className="btn-secondary px-4 py-2 text-sm">Reopen as draft</button>
            </form>
          )}
        </section>
      )}
    </main>
  );
}
