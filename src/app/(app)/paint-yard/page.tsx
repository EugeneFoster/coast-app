import Link from "next/link";
import { NewPaintJobForm } from "@/components/new-paint-job-form";
import { PaintStageControls } from "@/components/paint-stage-controls";
import { requirePaintYardViewer } from "@/lib/auth";
import {
  canAdministerPaintYard,
  canWorkPaintYard,
} from "@/lib/employee-roles";
import { formatHours, workOrderPriorityLabel } from "@/lib/operations";
import {
  ACTIVE_PAINT_STAGES,
  coatingOperationLabel,
  paintDeadlineState,
  paintScopeLabel,
  paintStageShortLabel,
} from "@/lib/paint-yard";
import {
  getPaintYardBoard,
  getPaintYardCreationOptions,
  type PaintYardJob,
} from "@/lib/paint-yard-data";
import { addDays, vancouverDate } from "@/lib/schedule";
import { estimateStatusLabel, formatCad, formatShortDate } from "@/lib/sales";

const deadlineAccent = {
  overdue: "border-weld bg-weld/5",
  due_soon: "border-weld/50",
  on_track: "border-rule",
  closed: "border-rule opacity-75",
} as const;

function deadlineLabel(job: PaintYardJob, today: string) {
  const state = paintDeadlineState(job.due_date, job.stage, today);
  if (state === "overdue") return `Overdue · ${formatShortDate(job.due_date)}`;
  if (state === "due_soon") return `Due soon · ${formatShortDate(job.due_date)}`;
  return `Due ${formatShortDate(job.due_date)}`;
}

function PaintJobCard({
  job,
  today,
  canWork,
  canAdminister,
}: {
  job: PaintYardJob;
  today: string;
  canWork: boolean;
  canAdminister: boolean;
}) {
  const deadline = paintDeadlineState(job.due_date, job.stage, today);
  const overHours = Number(job.actual_hours) > Number(job.planned_hours);

  return (
    <article className={`rounded border bg-paper p-4 ${deadlineAccent[deadline]}`}>
      <Link href={`/paint-yard/${job.job_id}`} className="block group">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-display text-lg font-medium text-ink group-hover:text-weld">
              {job.vessel_name}
            </p>
            <p className="mt-0.5 truncate text-xs text-graph">
              {job.vessel_make_model ?? job.project_name}
              {job.vessel_length_ft ? ` · ${job.vessel_length_ft} ft` : ""}
            </p>
          </div>
          <span className={`shrink-0 rounded border px-2 py-1 text-[0.62rem] uppercase tracking-wide ${job.priority === "urgent" ? "border-weld text-weld" : "border-rule text-graph"}`}>
            {workOrderPriorityLabel(job.priority)}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {job.scope_areas.map((area) => (
            <span key={area} className="rounded bg-bone px-2 py-1 text-[0.64rem] text-graph">
              {paintScopeLabel(area)}
            </span>
          ))}
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-rule pt-3 text-xs">
          <div>
            <dt className="text-graph">Deadline</dt>
            <dd className={deadline === "overdue" || deadline === "due_soon" ? "mt-1 text-weld" : "mt-1 text-ink"}>
              {deadlineLabel(job, today)}
            </dd>
          </div>
          <div>
            <dt className="text-graph">Yard row / bay</dt>
            <dd className="mt-1 text-ink">{job.yard_location ?? "Not assigned"}</dd>
          </div>
          <div>
            <dt className="text-graph">Hours</dt>
            <dd className={`mt-1 font-mono ${overHours ? "text-weld" : "text-ink"}`}>
              {formatHours(job.actual_hours)} / {formatHours(job.planned_hours)}
            </dd>
          </div>
          <div>
            <dt className="text-graph">Stage gates</dt>
            <dd className="mt-1 font-mono text-ink">
              {job.checklist_done} / {job.checklist_total}
            </dd>
          </div>
        </dl>

        <p className="mt-3 truncate text-xs text-graph">
          {job.client_name} · {job.work_order_number}
        </p>
        <p className="mt-1 truncate text-xs text-graph">
          Crew: {job.crew_names.length > 0 ? job.crew_names.join(", ") : "Unassigned"}
        </p>
        {job.last_coating_product && (
          <p className="mt-3 rounded border border-rule bg-bone px-2.5 py-2 text-xs leading-5 text-graph">
            Last: {job.last_coating_operation ? coatingOperationLabel(job.last_coating_operation) : "Coating"} · {job.last_coating_product}
            {job.last_coating_color ? ` · ${job.last_coating_color}` : ""}
          </p>
        )}
        {job.estimate_number && (
          <p className="mt-3 text-xs text-graph">
            Quote {job.estimate_number} · {job.estimate_status ? estimateStatusLabel(job.estimate_status) : "—"} · {formatCad(job.estimate_total)}
          </p>
        )}
        {job.invoice_number && (
          <p className="mt-1 text-xs text-graph">
            Invoice {job.invoice_number} · balance {formatCad(job.invoice_balance)}
          </p>
        )}
      </Link>
      {canWork && (
        <PaintStageControls
          jobId={job.job_id}
          projectId={job.project_id}
          workOrderId={job.work_order_id}
          stage={job.stage}
          canAdminister={canAdminister}
          compact
        />
      )}
    </article>
  );
}

export default async function PaintYardPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { profile } = await requirePaintYardViewer();
  const query = await searchParams;
  const archive = query.view === "archive";
  const canAdminister = canAdministerPaintYard(profile.role);
  const canWork = canWorkPaintYard(profile.role);
  const [jobs, creationOptions] = await Promise.all([
    getPaintYardBoard(),
    canAdminister ? getPaintYardCreationOptions() : Promise.resolve(null),
  ]);
  const today = vancouverDate();
  const activeJobs = jobs.filter(({ stage }) => ACTIVE_PAINT_STAGES.includes(stage));
  const closedJobs = jobs.filter(({ stage }) => stage === "delivered" || stage === "cancelled");
  const overdue = activeJobs.filter((job) => paintDeadlineState(job.due_date, job.stage, today) === "overdue").length;
  const atYard = activeJobs.filter(({ stage }) => stage !== "expected").length;

  return (
    <main className="px-8 pb-12 pt-8">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-rule pb-5">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-weld">Marine coating operations</p>
          <h1 className="mt-2 font-display text-3xl font-medium text-ink">Paint Yard</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-graph">
            Vessel position, gated preparation, coating traceability, labor budget, quote, and invoice in one workflow.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href={archive ? "/paint-yard" : "/paint-yard?view=archive"} className="btn-secondary px-4 py-2 text-sm">
            {archive ? "Active board" : `Archive (${closedJobs.length})`}
          </Link>
          <Link href="/schedule" className="btn-secondary px-4 py-2 text-sm">Team schedule →</Link>
        </div>
      </header>

      <section className="mt-6 grid gap-3 sm:grid-cols-4">
        <div className="rounded border border-rule bg-paper p-4"><p className="text-xs uppercase tracking-wide text-graph">Active vessels</p><p className="mt-2 font-mono text-2xl text-ink">{activeJobs.length}</p></div>
        <div className="rounded border border-rule bg-paper p-4"><p className="text-xs uppercase tracking-wide text-graph">At the yard</p><p className="mt-2 font-mono text-2xl text-ink">{atYard}</p></div>
        <div className="rounded border border-rule bg-paper p-4"><p className="text-xs uppercase tracking-wide text-graph">Overdue</p><p className={`mt-2 font-mono text-2xl ${overdue ? "text-weld" : "text-ink"}`}>{overdue}</p></div>
        <div className="rounded border border-rule bg-paper p-4"><p className="text-xs uppercase tracking-wide text-graph">Planned labor</p><p className="mt-2 font-mono text-2xl text-ink">{formatHours(activeJobs.reduce((sum, job) => sum + Number(job.planned_hours), 0))}</p></div>
      </section>

      {!archive && canAdminister && creationOptions && (
        <details className="mt-6 rounded border border-rule bg-paper p-4">
          <summary className="cursor-pointer font-medium text-ink">+ Add incoming vessel and create draft quote</summary>
          <div className="mt-4">
            <NewPaintJobForm
              projects={creationOptions.projects}
              employees={creationOptions.employees}
              arrivalDate={today}
              dueDate={addDays(today, 14)}
            />
          </div>
        </details>
      )}

      {archive ? (
        <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {closedJobs.map((job) => <PaintJobCard key={job.job_id} job={job} today={today} canWork={false} canAdminister={canAdminister} />)}
          {closedJobs.length === 0 && <p className="col-span-full rounded border border-dashed border-rule py-16 text-center text-sm text-graph">No delivered or cancelled vessels yet.</p>}
        </section>
      ) : (
        <section className="mt-8 overflow-x-auto pb-4">
          <div className="grid min-w-[162rem] grid-cols-9 gap-4">
            {ACTIVE_PAINT_STAGES.map((stage) => {
              const stageJobs = activeJobs.filter((job) => job.stage === stage);
              return (
                <div key={stage} className="min-w-0">
                  <div className="mb-3 flex items-center justify-between border-b border-rule pb-2">
                    <h2 className="text-sm font-medium text-ink">{paintStageShortLabel(stage)}</h2>
                    <span className="font-mono text-xs text-graph">{stageJobs.length}</span>
                  </div>
                  <div className="space-y-3">
                    {stageJobs.map((job) => (
                      <PaintJobCard key={job.job_id} job={job} today={today} canWork={canWork} canAdminister={canAdminister} />
                    ))}
                    {stageJobs.length === 0 && <p className="rounded border border-dashed border-rule px-3 py-8 text-center text-xs text-graph">No vessels</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
