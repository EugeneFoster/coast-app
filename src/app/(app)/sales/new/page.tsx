import Link from "next/link";
import { NewOpportunityForm } from "@/components/new-opportunity-form";
import { requireSalesManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function NewOpportunityPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  await requireSalesManager();
  const { client: requestedClientId } = await searchParams;
  const supabase = await createClient();
  const [{ data: customers }, { data: assignees }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name")
      .order("name"),
    supabase
      .from("profiles")
      .select("id, full_name, login")
      .in("role", ["owner", "project_manager", "sales", "draftsperson"])
      .eq("status", "active")
      .order("full_name"),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-8 pb-12 pt-8">
      <Link href="/sales" className="text-sm text-graph hover:text-ink">
        ← Back to sales
      </Link>
      <h1 className="mt-4 font-display text-3xl font-medium text-ink">
        New opportunity
      </h1>
      <p className="mt-2 text-sm text-graph">
        Capture the customer request once, then carry it through quote and project.
      </p>
      <NewOpportunityForm
        customers={customers ?? []}
        assignees={assignees ?? []}
        initialCustomerId={
          customers?.some(({ id }) => id === requestedClientId)
            ? requestedClientId
            : ""
        }
      />
    </div>
  );
}
