import Link from "next/link";
import { ApprovalCard } from "@/components/approval-card";
import { HairlineMotif } from "@/components/hairline-motif";
import { APPROVAL_FILTERS, isApprovalFilter, type ApprovalFilter } from "@/lib/approvals";
import { getApprovalCounts, getApprovalRequests } from "@/lib/approvals-data";
import { requireUser } from "@/lib/auth";
import { canApproveSupplierChange } from "@/lib/employee-roles";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { profile } = await requireUser();
  const { filter: rawFilter } = await searchParams;
  const filter: ApprovalFilter =
    rawFilter && isApprovalFilter(rawFilter) ? rawFilter : "pending";

  const [requests, counts] = await Promise.all([
    getApprovalRequests(filter),
    getApprovalCounts(),
  ]);
  const canDecide = canApproveSupplierChange(profile.role);

  return (
    <div className="px-8 pb-12">
      <section className="pt-8">
        <h1 className="font-display text-3xl font-medium text-ink">Approvals</h1>
        <p className="mt-1 text-sm text-graph">
          Supplier-driven changes wait here. Nothing is written to Coastal CRM or Xero until
          someone approves it.
        </p>

        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          <div className="rounded border border-rule bg-paper p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-graph">Awaiting decision</p>
            <p className="mt-2 font-display text-2xl text-ink">{counts.pending}</p>
          </div>
          <div className="rounded border border-rule bg-paper p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-graph">Failed</p>
            <p className="mt-2 font-display text-2xl text-ink">{counts.failed}</p>
          </div>
        </div>
        <HairlineMotif className="mt-6 pb-1" />
      </section>

      <nav className="mt-8 flex flex-wrap gap-2">
        {APPROVAL_FILTERS.map((option) => {
          const active = option.value === filter;
          return (
            <Link
              key={option.value}
              href={`/approvals?filter=${option.value}`}
              className={`rounded border px-3 py-1.5 text-sm ${
                active
                  ? "border-weld text-weld"
                  : "border-rule text-graph hover:text-ink"
              }`}
            >
              {option.label}
            </Link>
          );
        })}
      </nav>

      <section className="mt-6 space-y-4">
        {requests.map((request) => (
          <ApprovalCard key={request.id} request={request} canDecide={canDecide} />
        ))}
        {requests.length === 0 && (
          <p className="rounded border border-dashed border-rule px-4 py-8 text-center text-sm text-graph">
            Nothing here. Supplier lookups only create a request when someone asks to change a
            part, a cost, or a part number.
          </p>
        )}
      </section>
    </div>
  );
}
