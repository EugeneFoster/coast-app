import Link from "next/link";
import { requireSalesViewer } from "@/lib/auth";
import { canManageSales } from "@/lib/employee-roles";
import { formatCad } from "@/lib/sales";
import { createClient } from "@/lib/supabase/server";
import type { Client, ClientContact, OpportunityStatus } from "@/lib/types";

type OpportunitySummary = {
  client_id: string;
  status: OpportunityStatus;
  estimated_value: number | null;
};

export default async function CustomersPage() {
  const { profile } = await requireSalesViewer();
  const canEdit = canManageSales(profile.role);
  const supabase = await createClient();
  const [
    { data: customerData, error },
    { data: contactData },
    { data: opportunityData },
  ] =
    await Promise.all([
      supabase.from("clients").select("*").order("name"),
      supabase.from("client_contacts").select("*"),
      supabase
        .from("opportunities")
        .select("client_id, status, estimated_value"),
    ]);
  const customers = (customerData ?? []) as Client[];
  const contacts = (contactData ?? []) as ClientContact[];
  const opportunities = (opportunityData ?? []) as OpportunitySummary[];

  return (
    <div className="px-8 pb-12 pt-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/sales" className="text-sm text-graph hover:text-ink">
            ← Sales pipeline
          </Link>
          <h1 className="mt-3 font-display text-3xl font-medium text-ink">
            Customers
          </h1>
        </div>
        {canEdit && (
          <Link href="/sales/clients/new" className="btn-primary px-4 py-2 text-sm">
            New customer
          </Link>
        )}
      </div>

      {error && (
        <p className="mt-6 rounded border border-weld/40 bg-weld/10 px-3 py-2 text-sm text-weld">
          Could not load customers: {error.message}
        </p>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {customers.map((customer) => {
          const contact = contacts.find(({ client_id }) => client_id === customer.id);
          const customerOpportunities = opportunities.filter(
            ({ client_id }) => client_id === customer.id,
          );
          const open = customerOpportunities.filter(
            ({ status }) => status !== "won" && status !== "lost",
          );
          const openValue = open.reduce(
            (sum, item) => sum + Number(item.estimated_value ?? 0),
            0,
          );
          return (
            <Link
              key={customer.id}
              href={`/sales/clients/${customer.id}`}
              className="rounded border border-rule bg-paper p-5 transition-colors hover:border-weld"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl font-medium text-ink">
                    {customer.name}
                  </h2>
                  <p className="mt-1 text-sm text-graph">
                    {contact?.contact_name ?? contact?.email ?? "No contact recorded"}
                  </p>
                </div>
                <span className="rounded border border-rule px-2 py-1 text-[0.65rem] uppercase tracking-wide text-graph">
                  {customer.type}
                </span>
              </div>
              <div className="mt-5 flex items-end justify-between border-t border-rule pt-4">
                <div>
                  <p className="text-xs text-graph">Open opportunities</p>
                  <p className="mt-1 font-mono text-sm text-ink">{open.length}</p>
                </div>
                <p className="font-mono text-sm text-ink">{formatCad(openValue)}</p>
              </div>
            </Link>
          );
        })}
      </div>

      {!error && customers.length === 0 && (
        <p className="mt-10 rounded border border-dashed border-rule py-16 text-center text-sm text-graph">
          No customers yet.
        </p>
      )}
    </div>
  );
}
