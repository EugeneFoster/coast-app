import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ProjectCard } from "@/components/project-card";

export default async function ArchivePage() {
  await requireUser();

  const supabase = await createClient();
  const { data: projects } = await supabase
    .from("projects")
    .select("*, clients(id, name)")
    .eq("status", "archived")
    .order("updated_at", { ascending: false });

  return (
    <div className="p-6 sm:p-8">
      <h1 className="font-display text-3xl font-medium text-ink">Archive</h1>
      <p className="mt-2 text-sm text-graph">Completed and retired projects.</p>

      {projects && projects.length > 0 ? (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      ) : (
        <p className="mt-12 text-center text-graph">No archived projects</p>
      )}
    </div>
  );
}
