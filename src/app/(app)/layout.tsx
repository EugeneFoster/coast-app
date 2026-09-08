import { requireUser } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { getApprovalCounts, getUnreadNotificationCount } from "@/lib/approvals-data";
import { canProposeSupplierChange } from "@/lib/employee-roles";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireUser();
  let approvalBadge = 0;
  if (canProposeSupplierChange(profile.role)) {
    const [counts, unread] = await Promise.all([
      getApprovalCounts(),
      getUnreadNotificationCount(),
    ]);
    approvalBadge = counts.pending + counts.failed || unread;
  }

  return <AppShell profile={profile} approvalBadge={approvalBadge}>{children}</AppShell>;
}
