import Link from "next/link";
import { notFound } from "next/navigation";
import { EstimateDetailsForm } from "@/components/estimate-details-form";
import { EstimateItemForm } from "@/components/estimate-item-form";
import { QuotePrintButton } from "@/components/quote-print-button";
import {
  convertEstimateToProjectAction,
  deleteEstimateItemAction,
  updateEstimateStatusAction,
} from "@/lib/actions/sales";
import { requireSalesViewer } from "@/lib/auth";
import { canManageSales } from "@/lib/employee-roles";
import {
  ESTIMATE_ITEM_TYPES,
  estimateStatusLabel,
  formatCad,
  formatShortDate,
} from "@/lib/sales";
import { createClient } from "@/lib/supabase/server";
import type {
  Client,
  ClientContact,
  Estimate,
  EstimateItem,
  Opportunity,
} from "@/lib/types";

const transitions: Record<string, Array<{ value: string; label: string }>> = {
  draft: [{ value: "sent", label: "Mark sent" }],
  sent: [
    { value: "accepted", label: "Accept" },
    { value: "declined", label: "Decline" },
    { value: "expired", label: "Expire" },
    { value: "draft", label: "Return to draft" },
  ],
  accepted: [],
  declined: [{ value: "draft", label: "Return to draft" }],
  expired: [{ value: "draft", label: "Return to draft" }],
};

export default async function EstimatePage({
  params,
}: {
  params: Promise<{ id: string; estimateId: string }>;
}) {
  const { id, estimateId } = await params;
  const { profile } = await requireSalesViewer();
  const canEdit = canManageSales(profile.role);
  const supabase = await createClient();
  const { data: estimateData } = await supabase
    .from("estimates")
    .select("*")
    .eq("id", estimateId)
    .eq("opportunity_id", id)
    .maybeSingle();
  if (!estimateData) notFound();
  const estimate = estimateData as Estimate;

  const [
    { data: opportunityData },
    { data: clientData },
    { data: contactData },
    { data: itemData },
  ] =
    await Promise.all([
      supabase.from("opportunities").select("*").eq("id", id).single(),
      supabase.from("clients").select("*").eq("id", estimate.client_id).single(),
      supabase
        .from("client_contacts")
        .select("*")
        .eq("client_id", estimate.client_id)
        .maybeSingle(),
      supabase
        .from("estimate_items")
        .select("*")
        .eq("estimate_id", estimate.id)
        .order("sort_order")
        .order("created_at"),
    ]);
  const opportunity = opportunityData as Opportunity | null;
  const customer = clientData as Client | null;
  const contact = contactData as ClientContact | null;
  const items = (itemData ?? []) as EstimateItem[];
  if (!opportunity) notFound();
  const editableDraft = canEdit && estimate.status === "draft";

  return (
    <div className="quote-page mx-auto max-w-6xl px-8 pb-12 pt-8">
      <div className="print-hidden">
        <Link href={`/sales/${id}`} className="text-sm text-graph hover:text-ink">
          ← {opportunity.title}
        </Link>
      </div>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-5 border-b border-rule pb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-graph">COAST Metal Works</p>
          <h1 className="mt-2 font-display text-3xl font-medium text-ink">
            {estimate.estimate_number}
          </h1>
          <p className="mt-1 text-sm text-graph">{estimate.title}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded border border-weld px-3 py-1.5 text-sm text-weld">
            {estimateStatusLabel(estimate.status)}
          </span>
          <QuotePrintButton />
        </div>
      </header>

      <section className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="rounded border border-rule bg-paper p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-graph">Prepared for</p>
          <h2 className="mt-2 font-display text-xl text-ink">
            {customer?.name ?? "Unknown customer"}
          </h2>
          <p className="mt-2 text-sm text-graph">{contact?.contact_name ?? ""}</p>
          <p className="mt-1 text-sm text-graph">
            {contact?.service_address ?? contact?.billing_address ?? ""}
          </p>
          <p className="mt-1 text-sm text-graph">{contact?.email ?? ""}</p>
          <p className="mt-1 text-sm text-graph">{contact?.phone ?? ""}</p>
        </div>
        <dl className="grid grid-cols-2 gap-4 rounded border border-rule bg-paper p-5 text-sm">
          <div><dt className="text-xs text-graph">Quote date</dt><dd className="mt-1">{formatShortDate(estimate.created_at)}</dd></div>
          <div><dt className="text-xs text-graph">Valid until</dt><dd className="mt-1">{formatShortDate(estimate.valid_until)}</dd></div>
          <div><dt className="text-xs text-graph">Opportunity</dt><dd className="mt-1">{opportunity.title}</dd></div>
          <div><dt className="text-xs text-graph">Currency</dt><dd className="mt-1">CAD</dd></div>
        </dl>
      </section>

      <div className="mt-6 print-hidden">
        {editableDraft ? (
          <EstimateDetailsForm estimate={estimate} />
        ) : (
          <div className="rounded border border-rule bg-paper p-5 text-sm text-graph">
            {canEdit
              ? "This quote is locked. Return it to Draft to edit details or line items."
              : "Quote details are read-only for your role."}
          </div>
        )}
      </div>

      <section className="print-only mt-8 hidden">
        <h2 className="font-display text-xl text-ink">Scope of work</h2>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-ink">
          {estimate.scope ?? "—"}
        </p>
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-medium text-ink">Line items</h2>
          <span className="font-mono text-xs text-graph">{items.length} items</span>
        </div>

        <div className="mt-4 overflow-hidden rounded border border-rule bg-paper">
          <div className="hidden grid-cols-[8rem_1fr_6rem_6rem_8rem_8rem_3rem] gap-3 border-b border-rule px-4 py-2 text-xs uppercase tracking-wide text-graph lg:grid">
            <span>Type</span><span>Description</span><span>Qty</span><span>Unit</span><span>Unit price</span><span>Total</span><span />
          </div>
          {items.map((item) => (
            <div
              key={item.id}
              className="grid gap-2 border-b border-rule px-4 py-3 text-sm last:border-b-0 lg:grid-cols-[8rem_1fr_6rem_6rem_8rem_8rem_3rem] lg:items-center lg:gap-3"
            >
              <span className="text-xs text-graph">
                {ESTIMATE_ITEM_TYPES.find(({ value }) => value === item.item_type)?.label ?? item.item_type}
              </span>
              <span className="text-ink">{item.description}</span>
              <span className="font-mono text-xs text-graph">{item.quantity}</span>
              <span className="text-xs text-graph">{item.unit}</span>
              <span className="font-mono text-xs text-ink">{formatCad(item.unit_price)}</span>
              <span className="font-mono text-sm text-ink">{formatCad(item.line_total)}</span>
              {editableDraft ? (
                <form
                  action={deleteEstimateItemAction.bind(
                    null,
                    opportunity.id,
                    estimate.id,
                    item.id,
                  )}
                  className="print-hidden"
                >
                  <button type="submit" className="text-xs text-graph hover:text-weld" aria-label={`Remove ${item.description}`}>
                    ×
                  </button>
                </form>
              ) : (
                <span />
              )}
            </div>
          ))}
          {items.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-graph">No line items yet.</p>
          )}
        </div>

        {editableDraft && (
          <div className="mt-4">
            <EstimateItemForm opportunityId={opportunity.id} estimateId={estimate.id} />
          </div>
        )}
      </section>

      <section className="mt-8 ml-auto max-w-md rounded border border-rule bg-paper p-5">
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-graph">Subtotal</dt><dd className="font-mono">{formatCad(estimate.subtotal)}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-graph">Discount</dt><dd className="font-mono">− {formatCad(estimate.discount_amount)}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-graph">Tax ({Number(estimate.tax_rate_percent)}%)</dt><dd className="font-mono">{formatCad(estimate.tax_amount)}</dd></div>
          <div className="flex justify-between gap-4 border-t border-ink pt-3 text-lg"><dt className="font-display">Total</dt><dd className="font-mono">{formatCad(estimate.total)}</dd></div>
        </dl>
      </section>

      {(estimate.notes || estimate.terms) && (
        <section className="mt-8 grid gap-6 md:grid-cols-2">
          {estimate.notes && <div><h2 className="font-display text-lg text-ink">Notes</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-graph">{estimate.notes}</p></div>}
          {estimate.terms && <div><h2 className="font-display text-lg text-ink">Terms</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-graph">{estimate.terms}</p></div>}
        </section>
      )}

      {canEdit && (
        <section className="print-hidden mt-10 flex flex-wrap items-center gap-3 border-t border-rule pt-6">
          {(transitions[estimate.status] ?? []).map((transition) => (
            <form
              key={transition.value}
              action={updateEstimateStatusAction.bind(
                null,
                opportunity.id,
                estimate.id,
                transition.value,
              )}
            >
              <button
                type="submit"
                className={
                  transition.value === "accepted"
                    ? "btn-primary px-4 py-2 text-sm"
                    : "btn-secondary px-4 py-2 text-sm"
                }
              >
                {transition.label}
              </button>
            </form>
          ))}

          {estimate.status === "accepted" && !opportunity.project_id && (
            <form
              action={convertEstimateToProjectAction.bind(
                null,
                opportunity.id,
                estimate.id,
              )}
            >
              <button type="submit" className="btn-primary px-4 py-2 text-sm">
                Create project from accepted quote
              </button>
            </form>
          )}
          {opportunity.project_id && (
            <Link href={`/projects/${opportunity.project_id}`} className="btn-primary px-4 py-2 text-sm">
              Open project →
            </Link>
          )}
        </section>
      )}
    </div>
  );
}
