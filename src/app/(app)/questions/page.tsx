import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type ProfileLite = { full_name: string | null; login: string };

const filters = [
  { label: "Open", value: "open" },
  { label: "Resolved", value: "resolved" },
  { label: "All", value: "all" },
] as const;

function name(raw: ProfileLite | ProfileLite[] | null) {
  const p = Array.isArray(raw) ? raw[0] : raw;
  return p?.full_name ?? p?.login ?? "Unknown";
}

function firstName(raw: { name: string } | { name: string }[] | null) {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v?.name ?? null;
}

export default async function QuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireUser();
  const { status } = await searchParams;
  const active = status ?? "open";

  const supabase = await createClient();
  let query = supabase
    .from("drawing_pins")
    .select(
      "id, body, status, page_no, version, created_at, project_id, drawing_id, projects(name), drawings(original_name), author:created_by(full_name, login), pin_comments(count)",
    )
    .order("created_at", { ascending: false });

  if (active !== "all") {
    query = query.eq("status", active);
  }

  const { data } = await query;

  type Row = {
    id: string;
    body: string | null;
    status: string;
    page_no: number;
    version: number;
    created_at: string;
    project_id: string;
    projects: { name: string } | { name: string }[] | null;
    drawings: { original_name: string } | { original_name: string }[] | null;
    author: ProfileLite | ProfileLite[] | null;
    pin_comments: { count: number }[] | null;
  };
  const rows = (data ?? []) as Row[];

  return (
    <div className="p-6 sm:p-8">
      <h1 className="font-display text-3xl font-medium text-ink">Questions</h1>
      <p className="mt-2 text-sm text-graph">
        Notes and questions pinned to drawing sheets across your projects.
      </p>

      <div className="mt-6 flex gap-6 border-b border-rule">
        {filters.map((f) => {
          const isActive = active === f.value;
          return (
            <Link
              key={f.value}
              href={
                f.value === "open"
                  ? "/questions"
                  : `/questions?status=${f.value}`
              }
              className={`relative pb-3 text-sm transition-colors ${
                isActive ? "text-ink" : "text-graph hover:text-ink"
              }`}
            >
              {f.label}
              {isActive && (
                <span className="absolute bottom-0 left-0 h-0.5 w-full bg-weld" />
              )}
            </Link>
          );
        })}
      </div>

      {rows.length > 0 ? (
        <ul className="mt-6 space-y-3">
          {rows.map((r) => {
            const drawing = firstName(
              Array.isArray(r.drawings)
                ? r.drawings.map((d) => ({ name: d.original_name }))
                : r.drawings
                  ? { name: r.drawings.original_name }
                  : null,
            );
            const replies = r.pin_comments?.[0]?.count ?? 0;
            return (
              <li key={r.id}>
                <Link
                  href={`/projects/${r.project_id}`}
                  className="block rounded border border-rule bg-paper p-4 transition-colors hover:border-ink/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm text-ink">
                      {r.body ?? "(no text)"}
                    </p>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-wide ${
                        r.status === "open"
                          ? "border-weld text-weld"
                          : "border-graph text-graph"
                      }`}
                    >
                      {r.status}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-graph">
                    <span className="font-medium text-ink/70">
                      {firstName(r.projects)}
                    </span>
                    {drawing && <span>{drawing}</span>}
                    <span className="font-mono">
                      rev{r.version} · p{r.page_no}
                    </span>
                    <span>{name(r.author)}</span>
                    {replies > 0 && <span>{replies} ↩</span>}
                    <span className="ml-auto font-mono">
                      {new Date(r.created_at).toLocaleDateString("en-CA")}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-12 flex flex-col items-center justify-center rounded border border-dashed border-rule py-16 text-center">
          <p className="font-display text-lg text-ink">
            {active === "open" ? "No open questions" : "Nothing here"}
          </p>
          <p className="mt-2 max-w-sm text-sm text-graph">
            Questions appear when someone uses{" "}
            <span className="text-ink">Pin a note</span> on a drawing sheet to
            ask about a region.
          </p>
        </div>
      )}
    </div>
  );
}
