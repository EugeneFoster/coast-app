import Link from "next/link";
import { HairlineMotif } from "@/components/hairline-motif";
import { requireSalesViewer } from "@/lib/auth";
import { canManageSales } from "@/lib/employee-roles";
import {
  formatCad,
  formatShortDate,
  OPPORTUNITY_STATUSES,
  opportunityStatusLabel,
} from "@/lib/sales";
import { createClient } from "@/lib/supabase/server";
import type { EstimateStatus, OpportunityStatus } from "@/lib/types";

type PipelineRow = {
  id: string;
  title: string;
  status: OpportunityStatus;
  estimated_value: number | null;
  target_date: string | null;
  updated_at: string;
  clients: { id: string; name: string } | null;
  assignee: { id: string; full_name: string | null; login: string } | null;
  estimates: Array<{
    id: string;
    estimate_number: string;
    status: EstimateStatus;
    total: number;
  }>;
};

const statusAccent: Record<OpportunityStatus, string> = {
  new: "border-rule",
  qualified: "border-ink/30",
  estimating: "border-weld/40",
  quoted: "border-weld",
  won: "border-ink bg-ink text-bone",
  lost: "border-rule opacity-65",
};

export default async function SalesPage() {
  const { profile } = await requireSalesViewer();
  const canEdit = canManageSales(profile.role);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunities")
    .select(
      "id, title, status, estimated_value, target_date, updated_at, clients(id, name), assignee:profiles!opportunities_assigned_to_fkey(id, full_name, login), estimates(id, estimate_number, status, total)",
    )
    .order("updated_at", { ascending: false });
  const opportunities = (data ?? []) as unknown as PipelineRow[];

  const active = opportunities.filter(
    ({ status }) => status !== "won" && status !== "lost",
  );
  const pipelineValue = active.reduce(
    (sum, item) => sum + Number(item.estimated_value ?? 0),
    0,
  );
  const quotedValue = opportunities.reduce(
    (sum, item) =>
      sum +
      item.estimates
        .filter(({ status }) => status === "sent" || status === "accepted")
        .reduce((estimateSum, estimate) => estimateSum + Number(estimate.total), 0),
    0,
  );

  return (
    <div className="px-8 pb-10">
      <section className="pt-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-medium text-ink">Sales CRM</h1>
            <p className="mt-1 text-sm text-graph">
              Leads, customers, quotes, and project handoff.
            </p>
          </div>
          <div className="flex gap-3">
            <Link href="/sales/clients" className="btn-secondary px-4 py-2 text-sm">
              Customers
            </Link>
            {canEdit && (
              <Link href="/sales/new" className="btn-primary px-4 py-2 text-sm">
                New opportunity
              </Link>
            )}
          </div>
        </div>

        <div className="mt-7 grid gap-4 sm:grid-cols-3">
          <div className="rounded border border-rule bg-paper p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-graph">Open pipeline</p>
            <p className="mt-2 font-display text-2xl text-ink">{active.length}</p>
          </div>
          <div className="rounded border border-rule bg-paper p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-graph">Estimated value</p>
            <p className="mt-2 font-display text-2xl text-ink">{formatCad(pipelineValue)}</p>
          </div>
          <div className="rounded border border-rule bg-paper p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-graph">Quoted / accepted</p>
            <p className="mt-2 font-display text-2xl text-ink">{formatCad(quotedValue)}</p>
          </div>
        </div>

        <HairlineMotif className="mt-6 pb-1" />
      </section>

      {error && (
        <p className="mt-6 rounded border border-weld/40 bg-weld/10 px-3 py-2 text-sm text-weld">
          Could not load pipeline: {error.message}
        </p>
      )}

      <section className="mt-8 overflow-x-auto pb-4">
        <div className="grid min-w-[1500px] grid-cols-6 gap-4">
          {OPPORTUNITY_STATUSES.map((column) => {
            const rows = opportunities.filter(({ status }) => status === column.value);
            return (
              <div key={column.value} className="min-w-0">
                <div className="mb-3 flex items-center justify-between border-b border-rule pb-2">
                  <h2 className="text-sm font-medium text-ink">{column.label}</h2>
                  <span className="font-mono text-xs text-graph">{rows.length}</span>
                </div>
                <div className="space-y-3">
                  {rows.map((opportunity) => (
                    <Link
                      key={opportunity.id}
                      href={`/sales/${opportunity.id}`}
                      className={`block rounded border bg-paper p-4 transition-colors hover:border-weld ${statusAccent[opportunity.status]}`}
                    >
                      <p className="font-medium leading-snug">{opportunity.title}</p>
                      <p className="mt-1 text-sm opacity-70">
                        {opportunity.clients?.name ?? "Unknown customer"}
                      </p>
                      <p className="mt-4 font-mono text-sm">
                        {formatCad(opportunity.estimated_value)}
                      </p>
                      <div className="mt-3 flex items-end justify-between gap-2 text-xs opacity-65">
                        <span className="truncate">
                          {opportunity.assignee?.full_name ??
                            opportunity.assignee?.login ??
                            "Unassigned"}
                        </span>
                        <span className="shrink-0">
                          {formatShortDate(opportunity.target_date)}
                        </span>
                      </div>
                    </Link>
                  ))}
                  {rows.length === 0 && (
                    <p className="rounded border border-dashed border-rule px-3 py-8 text-center text-xs text-graph">
                      No {opportunityStatusLabel(column.value).toLowerCase()} opportunities
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
