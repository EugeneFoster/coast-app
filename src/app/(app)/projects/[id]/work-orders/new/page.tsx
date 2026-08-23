import Link from "next/link";
import { notFound } from "next/navigation";
import { NewWorkOrderForm } from "@/components/new-work-order-form";
import { requireOperationsManager } from "@/lib/auth";
import { ASSIGNABLE_WORK_ORDER_ROLES } from "@/lib/employee-roles";
import { getOperationsDirectory } from "@/lib/operations-data";
import { createClient } from "@/lib/supabase/server";

export default async function NewWorkOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireOperationsManager();
  const supabase = await createClient();
  const [{ data: project }, directory] = await Promise.all([
    supabase.from("projects").select("id, name").eq("id", id).maybeSingle(),
    getOperationsDirectory(),
  ]);
  if (!project) notFound();
  const employees = directory.filter(({ role }) =>
    ASSIGNABLE_WORK_ORDER_ROLES.includes(role),
  );

  return (
    <div className="mx-auto max-w-5xl px-8 pb-12 pt-8">
      <Link
        href={`/projects/${id}/work-orders`}
        className="text-sm text-graph hover:text-ink"
      >
        ← {project.name} work orders
      </Link>
      <h1 className="mt-4 font-display text-3xl font-medium text-ink">
        New work order
      </h1>
      <p className="mt-2 text-sm text-graph">
        Plan a clear scope, schedule it, and assign the right trade crew.
      </p>
      <NewWorkOrderForm projectId={id} employees={employees} />
    </div>
  );
}
