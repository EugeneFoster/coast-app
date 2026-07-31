import { requireUser, isAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ProjectCard } from "@/components/project-card";

export default async function ArchivePage() {
  const { profile } = await requireUser();
  const admin = isAdmin(profile);

  const supabase = await createClient();
  const { data: projects } = await supabase
    .from("projects")
    .select("*, clients(id, name)")
    .eq("status", "archived")
    .order("updated_at", { ascending: false });

  return (
    <>
      <section className="bg-bone px-8 pt-8 pb-4">
        <h1 className="font-display text-3xl font-medium text-ink">Archive</h1>
        <p className="mt-2 text-sm text-graph">Completed and retired projects.</p>
      </section>

      <section className="blueprint px-8 pb-8 pt-4">
        {projects && projects.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} canEdit={admin} />
            ))}
          </div>
        ) : (
          <p className="text-center text-graph">No archived projects</p>
        )}
      </section>
    </>
  );
}
