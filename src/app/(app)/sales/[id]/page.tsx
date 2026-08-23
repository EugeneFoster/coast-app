import Link from "next/link";
import { notFound } from "next/navigation";
import { OpportunityEditForm } from "@/components/opportunity-edit-form";
import { createEstimateAction } from "@/lib/actions/sales";
import { requireSalesViewer } from "@/lib/auth";
import { canManageSales } from "@/lib/employee-roles";
import {
  estimateStatusLabel,
  formatCad,
  formatShortDate,
  opportunityStatusLabel,
  serviceCategoryLabel,
} from "@/lib/sales";
import { createClient } from "@/lib/supabase/server";
import type {
  Client,
  ClientContact,
  Estimate,
  Opportunity,
  Profile,
} from "@/lib/types";

export default async function OpportunityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profile } = await requireSalesViewer();
  const canEdit = canManageSales(profile.role);
  const supabase = await createClient();
  const { data: opportunityData } = await supabase
    .from("opportunities")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!opportunityData) notFound();
  const opportunity = opportunityData as Opportunity;

  const [
    { data: clientData },
    { data: contactData },
    { data: estimatesData },
    { data: assigneeData },
  ] =
    await Promise.all([
      supabase.from("clients").select("*").eq("id", opportunity.client_id).single(),
      supabase
        .from("client_contacts")
        .select("*")
        .eq("client_id", opportunity.client_id)
        .maybeSingle(),
      supabase
        .from("estimates")
        .select("*")
        .eq("opportunity_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("profiles")
        .select("id, full_name, login, role, status")
        .in("role", ["owner", "project_manager", "sales", "draftsperson"])
        .eq("status", "active")
        .order("full_name"),
    ]);
  const customer = clientData as Client | null;
  const contact = contactData as ClientContact | null;
  const estimates = (estimatesData ?? []) as Estimate[];
  const assignees = (assigneeData ?? []) as Pick<
    Profile,
    "id" | "full_name" | "login" | "role" | "status"
  >[];
  const assigned = assignees.find(({ id: assigneeId }) => assigneeId === opportunity.assigned_to);

  return (
    <div className="mx-auto max-w-6xl px-8 pb-12 pt-8">
      <Link href="/sales" className="text-sm text-graph hover:text-ink">
        ← Sales pipeline
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl font-medium text-ink">
              {opportunity.title}
            </h1>
            <span className="rounded border border-weld px-2.5 py-1 text-xs text-weld">
              {opportunityStatusLabel(opportunity.status)}
            </span>
          </div>
          <p className="mt-2 text-sm text-graph">
            {customer?.name ?? "Unknown customer"} · {assigned?.full_name ?? assigned?.login ?? "Unassigned"}
          </p>
        </div>
        {opportunity.project_id && (
          <Link
            href={`/projects/${opportunity.project_id}`}
            className="btn-primary px-4 py-2 text-sm"
          >
            Open project →
          </Link>
        )}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        {canEdit ? (
          <OpportunityEditForm opportunity={opportunity} assignees={assignees} />
        ) : (
          <section className="rounded border border-rule bg-paper p-6">
            <h2 className="font-display text-xl text-ink">Opportunity details</h2>
            <dl className="mt-5 grid gap-4 md:grid-cols-2">
              <div><dt className="text-xs text-graph">Value</dt><dd className="mt-1 text-sm">{formatCad(opportunity.estimated_value)}</dd></div>
              <div><dt className="text-xs text-graph">Target</dt><dd className="mt-1 text-sm">{formatShortDate(opportunity.target_date)}</dd></div>
              <div className="md:col-span-2"><dt className="text-xs text-graph">Requested work</dt><dd className="mt-1 whitespace-pre-wrap text-sm">{opportunity.description ?? "—"}</dd></div>
            </dl>
          </section>
        )}

        <aside className="space-y-4">
          {customer && (
            <Link
              href={`/sales/clients/${customer.id}`}
              className="block rounded border border-rule bg-paper p-5 transition-colors hover:border-weld"
            >
              <p className="text-xs uppercase tracking-[0.16em] text-graph">Customer</p>
              <h2 className="mt-2 font-display text-xl text-ink">{customer.name}</h2>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-graph">Contact</dt><dd className="text-right">{contact?.contact_name ?? "—"}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-graph">Phone</dt><dd className="text-right">{contact?.phone ?? "—"}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-graph">Email</dt><dd className="break-all text-right">{contact?.email ?? "—"}</dd></div>
              </dl>
            </Link>
          )}

          <div className="rounded border border-rule bg-paper p-5">
            <p className="text-xs uppercase tracking-[0.16em] text-graph">Work profile</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {opportunity.service_categories.map((category) => (
                <span
                  key={category}
                  className="rounded border border-rule px-2 py-1 text-xs text-ink"
                >
                  {serviceCategoryLabel(category)}
                </span>
              ))}
              {opportunity.service_categories.length === 0 && (
                <span className="text-sm text-graph">No services selected</span>
              )}
            </div>
            <dl className="mt-5 space-y-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-graph">Vessel</dt><dd className="text-right">{opportunity.vessel_name ?? "—"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-graph">Make / model</dt><dd className="text-right">{opportunity.vessel_make_model ?? "—"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-graph">Length</dt><dd>{opportunity.vessel_length_ft ? `${opportunity.vessel_length_ft} ft` : "—"}</dd></div>
            </dl>
          </div>
        </aside>
      </div>

      <section className="mt-10">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-medium text-ink">Estimates / quotes</h2>
            <p className="mt-1 text-sm text-graph">Every revision keeps its own number and total.</p>
          </div>
          {canEdit &&
            !opportunity.project_id &&
            opportunity.status !== "won" &&
            opportunity.status !== "lost" && (
            <form action={createEstimateAction.bind(null, opportunity.id)}>
              <button type="submit" className="btn-primary px-4 py-2 text-sm">
                Create estimate
              </button>
            </form>
          )}
        </div>

        <div className="mt-4 space-y-3">
          {estimates.map((estimate) => (
            <Link
              key={estimate.id}
              href={`/sales/${opportunity.id}/estimates/${estimate.id}`}
              className="grid gap-3 rounded border border-rule bg-paper p-4 transition-colors hover:border-weld sm:grid-cols-[auto_1fr_auto_auto] sm:items-center"
            >
              <span className="font-mono text-sm text-ink">{estimate.estimate_number}</span>
              <span className="text-sm text-graph">{estimate.title}</span>
              <span className="rounded border border-rule px-2 py-1 text-xs text-graph">
                {estimateStatusLabel(estimate.status)}
              </span>
              <span className="font-mono text-sm text-ink">{formatCad(estimate.total)}</span>
            </Link>
          ))}
          {estimates.length === 0 && (
            <p className="rounded border border-dashed border-rule py-12 text-center text-sm text-graph">
              No estimates yet.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
