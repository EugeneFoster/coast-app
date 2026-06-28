import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { resolveStructureType } from "@/components/structure-thumbnail";
import type { Project } from "@/lib/types";

export default async function LibraryPage() {
  await requireUser();

  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select("*, clients(id, name)")
    .neq("status", "archived")
    .order("name", { ascending: true });

  const projects = (data ?? []) as Project[];
  const totalDrawings = projects.reduce(
    (sum, p) => sum + (p.drawing_count ?? 0),
    0,
  );

  return (
    <div className="p-8">
      <h1 className="font-display text-3xl font-medium text-ink">Library</h1>
      <p className="mt-2 text-sm text-graph">
        Drawings and models across all active projects — {totalDrawings} files.
      </p>

      {projects.length > 0 ? (
        <div className="mt-8 overflow-hidden rounded border border-rule">
          <table className="w-full text-sm">
            <thead className="border-b border-rule bg-ink/[0.03] text-left font-mono text-xs uppercase tracking-wide text-graph dark:bg-paper/[0.04]">
              <tr>
                <th className="px-4 py-3 font-medium">Project</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 text-right font-medium">Rev</th>
                <th className="px-4 py-3 text-right font-medium">Drawings</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-rule/60 last:border-0 hover:bg-ink/[0.02] dark:hover:bg-paper/[0.03]"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/projects/${p.id}`}
                      className="font-medium text-ink hover:text-weld"
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 capitalize text-graph">
                    {resolveStructureType(p.name, p.structure_type)}
                  </td>
                  <td className="px-4 py-3 text-graph">
                    {p.clients?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-graph">
                    rev{p.revision ?? 1}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-ink">
                    {p.drawing_count ?? 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-12 text-center text-graph">No drawings yet</p>
      )}
    </div>
  );
}
