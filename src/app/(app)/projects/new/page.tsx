import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NewProjectForm } from "@/components/new-project-form";

export default async function NewProjectPage() {
  await requireAdmin();

  const supabase = await createClient();

  const { data: welders } = await supabase
    .from("profiles")
    .select("id, full_name, login")
    .eq("role", "welder")
    .eq("status", "active")
    .order("full_name");

  return (
    <div className="mx-auto max-w-lg p-8">
      <Link href="/projects" className="text-sm text-graph hover:text-ink">
        ← Back to projects
      </Link>

      <h1 className="mt-4 font-display text-3xl font-medium text-ink">
        Create project
      </h1>

      <NewProjectForm welders={welders ?? []} />
    </div>
  );
}
