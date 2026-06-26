import { requireUser, isAdmin } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";
import { ThemeToggle } from "@/components/theme-provider";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireUser();

  return (
    <div className="flex min-h-full">
      <Sidebar profile={profile} isAdminUser={isAdmin(profile)} />
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-end border-b border-rule px-6 py-3">
          <ThemeToggle />
        </header>
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
