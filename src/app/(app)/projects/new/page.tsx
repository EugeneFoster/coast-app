import { requireAdmin } from "@/lib/auth";
import { createProject } from "@/lib/actions/projects";
import Link from "next/link";

export default async function NewProjectPage() {
  await requireAdmin();

  return (
    <div className="mx-auto max-w-lg p-8">
      <Link
        href="/projects"
        className="text-sm text-graph hover:text-ink"
      >
        ← Back to projects
      </Link>

      <h1 className="mt-4 font-display text-3xl font-medium text-ink">
        Create project
      </h1>

      <form action={createProject} className="mt-8 space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm text-ink">
            Project name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            placeholder="Dock · Roberts Creek"
            className="mt-1 w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="client_name" className="block text-sm text-ink">
            Client
          </label>
          <input
            id="client_name"
            name="client_name"
            type="text"
            placeholder="Coastal Marine Ltd"
            className="mt-1 w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="description" className="block text-sm text-ink">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            rows={4}
            className="mt-1 w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="rounded bg-weld px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-90"
        >
          Create project
        </button>
      </form>
    </div>
  );
}
