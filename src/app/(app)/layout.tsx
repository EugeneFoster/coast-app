import { requireUser, isAdmin } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";
import { ThemeToggle } from "@/components/theme-provider";
import { ServiceWorkerRegister } from "@/components/service-worker-register";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireUser();

  return (
    <div className="flex min-h-screen">
      <ServiceWorkerRegister />
      <Sidebar profile={profile} isAdminUser={isAdmin(profile)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end px-6 py-3">
          <ThemeToggle />
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
