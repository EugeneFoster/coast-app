import { requireUser } from "@/lib/auth";
import { ApprovalsBell } from "@/components/approvals-bell";
import { HeaderBreadcrumb } from "@/components/header-breadcrumb";
import { Sidebar } from "@/components/sidebar";
import { ThemeToggle } from "@/components/theme-provider";
import { getApprovalCounts } from "@/lib/approvals-data";
import { canProposeSupplierChange } from "@/lib/employee-roles";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireUser();

  // Only fetch approval counts for roles that can see approvals; others get 0
  // from RLS anyway, so skip the query for them.
  const canSeeApprovals = canProposeSupplierChange(profile.role);
  const counts: Record<string, number> = canSeeApprovals
    ? { approvals: (await getApprovalCounts()).pending }
    : {};

  return (
    <div className="flex min-h-screen">
      <Sidebar profile={profile} counts={counts} />
      <div className="flex min-w-0 flex-1 flex-col bg-bone">
        <header className="print-hidden flex items-center justify-between gap-3 border-b border-rule px-6 py-3">
          <HeaderBreadcrumb />
          <div className="flex items-center gap-3">
            {canSeeApprovals && <ApprovalsBell />}
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
