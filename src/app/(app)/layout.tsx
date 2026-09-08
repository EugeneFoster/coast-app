import { requireUser, isAdmin } from "@/lib/auth";
import { ApprovalsBell } from "@/components/approvals-bell";
import { Sidebar } from "@/components/sidebar";
import { ThemeToggle } from "@/components/theme-provider";
import { canProposeSupplierChange } from "@/lib/employee-roles";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireUser();

  return (
    <div className="flex min-h-screen">
      <Sidebar profile={profile} isAdminUser={isAdmin(profile)} />
      <div className="flex min-w-0 flex-1 flex-col bg-bone">
        <header className="print-hidden flex items-center justify-end gap-3 px-6 py-3">
          {canProposeSupplierChange(profile.role) && <ApprovalsBell />}
          <ThemeToggle />
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
