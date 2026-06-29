import { requireUser } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { ServiceWorkerRegister } from "@/components/service-worker-register";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireUser();

  return (
    <>
      <ServiceWorkerRegister />
      <AppShell profile={profile}>{children}</AppShell>
    </>
  );
}
