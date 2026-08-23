import Link from "next/link";
import { notFound } from "next/navigation";
import { ClientForm } from "@/components/client-form";
import { requireSalesViewer } from "@/lib/auth";
import { canManageSales } from "@/lib/employee-roles";
import {
  formatCad,
  formatShortDate,
  opportunityStatusLabel,
} from "@/lib/sales";
import { createClient } from "@/lib/supabase/server";
import type { Client, ClientContact, Opportunity } from "@/lib/types";

export default async function CustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profile } = await requireSalesViewer();
  const canEdit = canManageSales(profile.role);
  const supabase = await createClient();
  const [
    { data: customerData },
    { data: contactData },
    { data: opportunityData },
  ] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("client_contacts")
      .select("*")
      .eq("client_id", id)
      .maybeSingle(),
    supabase
      .from("opportunities")
      .select("*")
      .eq("client_id", id)
      .order("updated_at", { ascending: false }),
  ]);
  if (!customerData) notFound();
  const customer = customerData as Client;
  const contact = contactData as ClientContact | null;
  const opportunities = (opportunityData ?? []) as Opportunity[];

  return (
    <div className="mx-auto max-w-5xl px-8 pb-12 pt-8">
      <Link href="/sales/clients" className="text-sm text-graph hover:text-ink">
        ← Customers
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-medium text-ink">
            {customer.name}
          </h1>
          <p className="mt-1 text-sm capitalize text-graph">{customer.type}</p>
        </div>
        {canEdit && (
          <Link
            href={`/sales/new?client=${customer.id}`}
            className="btn-primary px-4 py-2 text-sm"
          >
            New opportunity
          </Link>
        )}
      </div>

      <div className="mt-8">
        {canEdit ? (
          <ClientForm client={customer} contact={contact} />
        ) : (
          <dl className="grid gap-4 rounded border border-rule bg-paper p-6 md:grid-cols-2">
            <div><dt className="text-xs text-graph">Contact</dt><dd className="mt-1 text-sm">{contact?.contact_name ?? "—"}</dd></div>
            <div><dt className="text-xs text-graph">Phone</dt><dd className="mt-1 text-sm">{contact?.phone ?? "—"}</dd></div>
            <div><dt className="text-xs text-graph">Email</dt><dd className="mt-1 text-sm">{contact?.email ?? "—"}</dd></div>
            <div><dt className="text-xs text-graph">Service address</dt><dd className="mt-1 text-sm">{contact?.service_address ?? "—"}</dd></div>
          </dl>
        )}
      </div>

      <section className="mt-10">
        <h2 className="font-display text-xl font-medium text-ink">Opportunities</h2>
        <div className="mt-4 space-y-3">
          {opportunities.map((opportunity) => (
            <Link
              key={opportunity.id}
              href={`/sales/${opportunity.id}`}
              className="grid gap-3 rounded border border-rule bg-paper p-4 transition-colors hover:border-weld sm:grid-cols-[1fr_auto_auto] sm:items-center"
            >
              <div>
                <p className="font-medium text-ink">{opportunity.title}</p>
                <p className="mt-1 text-xs text-graph">
                  {opportunityStatusLabel(opportunity.status)} · target {formatShortDate(opportunity.target_date)}
                </p>
              </div>
              <span className="font-mono text-sm text-ink">
                {formatCad(opportunity.estimated_value)}
              </span>
              <span className="text-graph">→</span>
            </Link>
          ))}
          {opportunities.length === 0 && (
            <p className="rounded border border-dashed border-rule py-12 text-center text-sm text-graph">
              No opportunities for this customer.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
