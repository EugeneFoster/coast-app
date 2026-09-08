import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
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

const pipelineStatuses = OPPORTUNITY_STATUSES.filter(
  ({ value }) => value !== "won" && value !== "lost",
);

function CornerMarks() {
  return (
    <>
      <span className="blueprint-corner tl" aria-hidden>+</span>
      <span className="blueprint-corner tr" aria-hidden>+</span>
      <span className="blueprint-corner bl" aria-hidden>+</span>
      <span className="blueprint-corner br" aria-hidden>+</span>
    </>
  );
}

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
  const won = opportunities.filter(({ status }) => status === "won");
  const lost = opportunities.filter(({ status }) => status === "lost");
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
  const wonValue = won.reduce(
    (sum, item) => sum + Number(item.estimated_value ?? 0),
    0,
  );
  const lostValue = lost.reduce(
    (sum, item) => sum + Number(item.estimated_value ?? 0),
    0,
  );
  const stats = [
    { label: "Open pipeline", value: String(active.length), note: "active opportunities" },
    { label: "Estimated value", value: formatCad(pipelineValue), note: "across open deals" },
    { label: "Quoted / accepted", value: formatCad(quotedValue), note: "current estimate value" },
    { label: "Won", value: formatCad(wonValue), note: `${won.length} closed opportunities` },
  ];

  return (
    <div className="px-3 pb-8 pt-3 md:px-4 md:pt-4 xl:px-6 xl:pb-10 xl:pt-6">
      <section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="hidden md:block">
            <h1 className="font-display text-[28px] font-medium leading-none text-ink">Sales CRM</h1>
            <p className="mt-2 text-[13px] text-graph">
              Leads, customers, quotes, and project handoff.
            </p>
          </div>
          <div className="ml-auto flex gap-2">
            <Link href="/sales/clients" className="btn-secondary flex h-10 items-center px-3.5 text-sm">
              Customers
            </Link>
            {canEdit && (
              <Link href="/sales/new" className="btn-primary flex h-10 items-center gap-2 px-4 text-sm">
                <Plus size={17} strokeWidth={1.5} aria-hidden />
                <span className="hidden sm:inline">New opportunity</span>
                <span className="sm:hidden">New</span>
              </Link>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 md:mt-5 md:grid-cols-4 md:gap-4">
          {stats.map((stat) => (
            <div key={stat.label} className="relative rounded-[4px] border border-rule bg-paper p-3.5 md:p-4">
              <CornerMarks />
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-graph">{stat.label}</p>
              <p className="mt-2.5 font-display text-[26px] font-medium leading-none text-ink">{stat.value}</p>
              <p className="mt-2 text-xs text-graph">{stat.note}</p>
            </div>
          ))}
        </div>
      </section>

      {error && (
        <p className="mt-5 rounded-[4px] border border-weld bg-weld/10 px-3 py-2 text-sm text-weld-text">
          Could not load pipeline: {error.message}
        </p>
      )}

      <section className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-3">
          <div className="flex items-baseline gap-2.5">
            <h2 className="font-display text-xl font-medium text-ink">Pipeline</h2>
            <span className="hidden font-mono text-[11px] text-graph lg:inline">
              Lead → Qualified → Estimating → Quoted → Won / Lost
            </span>
          </div>
          <div className="flex overflow-hidden rounded-[4px] border border-rule text-[13px]">
            <span className="flex h-9 items-center bg-ink px-3.5 font-medium text-bone">Board</span>
            <span className="flex h-9 items-center bg-paper px-3.5 text-graph">Table</span>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_236px]">
          {pipelineStatuses.map((column) => {
            const rows = opportunities.filter(({ status }) => status === column.value);
            const columnValue = rows.reduce(
              (sum, row) => sum + Number(row.estimated_value ?? 0),
              0,
            );
            return (
              <div key={column.value} className="min-w-0">
                <div className={`mb-3 flex items-baseline justify-between gap-2 border-b-2 pb-2 ${column.value === "quoted" ? "border-weld" : "border-rule"}`}>
                  <h3 className="text-sm font-medium text-ink">{column.label}</h3>
                  <span className="font-mono text-[11px] text-graph">
                    {rows.length} · {formatCad(columnValue)}
                  </span>
                </div>
                <div className="space-y-3">
                  {rows.map((opportunity) => (
                    <Link
                      key={opportunity.id}
                      href={`/sales/${opportunity.id}`}
                      className={`block rounded-[4px] border bg-paper p-3.5 transition-colors hover:border-weld ${statusAccent[opportunity.status]}`}
                    >
                      <p className="font-medium leading-snug">{opportunity.title}</p>
                      <p className="mt-1 text-[13px] opacity-70">
                        {opportunity.clients?.name ?? "Unknown customer"}
                      </p>
                      <p className="mt-3 font-mono text-[13px]">
                        {formatCad(opportunity.estimated_value)}
                      </p>
                      <div className="mt-3 flex items-end justify-between gap-2 text-xs opacity-65">
                        <span className="truncate">
                          {opportunity.assignee?.full_name ?? opportunity.assignee?.login ?? "Unassigned"}
                        </span>
                        <span className="shrink-0">{formatShortDate(opportunity.target_date)}</span>
                      </div>
                    </Link>
                  ))}
                  {rows.length === 0 && (
                    <p className="rounded-[4px] border border-dashed border-rule px-3 py-8 text-center text-xs text-graph">
                      No {opportunityStatusLabel(column.value).toLowerCase()} opportunities
                    </p>
                  )}
                </div>
              </div>
            );
          })}

          <div className="flex flex-col gap-3 md:col-span-2 xl:col-span-1 xl:border-l xl:border-rule xl:pl-4">
            <div className="flex items-baseline justify-between gap-2 border-b-2 border-rule pb-2">
              <h3 className="text-sm font-medium text-ink">Closed</h3>
              <span className="font-mono text-[11px] text-graph">all time</span>
            </div>
            <div className="rounded-[4px] border border-ink bg-ink p-3.5 text-bone">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] opacity-70">Won · {won.length}</p>
              <p className="mt-2 font-display text-[22px] font-medium leading-none">{formatCad(wonValue)}</p>
              <p className="mt-1.5 text-xs opacity-70">Converted to project work</p>
            </div>
            <div className="rounded-[4px] border border-rule bg-paper p-3.5">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-graph">Lost · {lost.length}</p>
              <p className="mt-2 font-display text-[22px] font-medium leading-none text-ink">{formatCad(lostValue)}</p>
              <p className="mt-1.5 text-xs text-graph">Closed without handoff</p>
            </div>
            <Link href="/sales/clients" className="flex min-h-10 items-center justify-between rounded-[4px] border border-rule px-3 text-[13px] text-ink hover:border-ink/40">
              Open customers
              <ChevronRight size={16} strokeWidth={1.5} aria-hidden />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
