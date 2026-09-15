import { requireUser } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { canViewPurchasing } from "@/lib/employee-roles";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireUser();
  let priceAlertCount = 0;
  if (canViewPurchasing(profile.role)) {
    const supabase = await createClient();
    const { count } = await supabase.from("supplier_price_alerts")
      .select("id", { count: "exact", head: true }).eq("status", "open");
    priceAlertCount = count ?? 0;
  }

  return <AppShell profile={profile} priceAlertCount={priceAlertCount}>{children}</AppShell>;
}
