import Link from "next/link";
import { notFound } from "next/navigation";
import { PaintCoatingLogForm } from "@/components/paint-coating-log-form";
import { PaintJobInvoiceForm } from "@/components/paint-job-invoice-form";
import { PaintJobPlanForm } from "@/components/paint-job-plan-form";
import { PaintStageControls } from "@/components/paint-stage-controls";
import { PaintTaskForm } from "@/components/paint-task-form";
import { TimeEntryForm } from "@/components/time-entry-form";
import { VoidPaintCoatingForm } from "@/components/void-paint-coating-form";
import { requirePaintYardViewer } from "@/lib/auth";
import { invoiceStatusLabel } from "@/lib/billing";
import {
  canAdministerPaintYard,
  canManageBilling,
  canViewBilling,
  canViewSales,
  canWorkPaintYard,
} from "@/lib/employee-roles";
import { formatHours, workOrderPriorityLabel } from "@/lib/operations";
import {
  applicationMethodLabel,
  coatingOperationLabel,
  hullMaterialLabel,
  PAINT_JOB_STAGES,
  paintScopeLabel,
  paintStageLabel,
} from "@/lib/paint-yard";
import { getPaintJob } from "@/lib/paint-yard-data";
import { addDays, vancouverDate } from "@/lib/schedule";
import { estimateStatusLabel, formatCad, formatShortDate } from "@/lib/sales";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Vancouver",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default async function PaintJobPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  if (!UUID_RE.test(jobId)) notFound();
  const { profile } = await requirePaintYardViewer();
  const { job, tasks, coatingLogs, stageEvents } = await getPaintJob(jobId);
  if (!job) notFound();

  const canAdminister = canAdministerPaintYard(profile.role);
  const canWork = canWorkPaintYard(profile.role);
  const canSeeFinancials = canViewSales(profile.role) || canViewBilling(profile.role);
  const canInvoice = canManageBilling(profile.role);
  const canLogTime = canAdminister || (canWork && job.current_user_assigned);
  const active = !["delivered", "cancelled"].includes(job.stage);
  const openForCoatings = !["expected", "delivered", "cancelled"].includes(job.stage);
  const overHours = Number(job.actual_hours) > Number(job.planned_hours);
  const today = vancouverDate();
  const taskStages = PAINT_JOB_STAGES.filter(({ value }) =>
    tasks.some((task) => task.stage === value),
  );

  return (
    <main className="mx-auto max-w-[105rem] px-8 pb-12 pt-8">
      <Link href="/paint-yard" className="text-sm text-graph hover:text-ink">← Paint Yard</Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-5 border-b border-rule pb-6">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl font-medium text-ink">{job.vessel_name}</h1>
            <span className="rounded border border-weld px-3 py-1 text-xs text-weld">
              {paintStageLabel(job.stage)}
            </span>
          </div>
          <p className="mt-2 text-sm text-graph">
            {job.vessel_make_model ?? "Make / model not recorded"}
            {job.vessel_length_ft ? ` · ${job.vessel_length_ft} ft` : ""}
            {` · ${hullMaterialLabel(job.hull_material)}`}
          </p>
          <p className="mt-1 font-mono text-xs text-graph">
            {job.work_order_number} · {job.client_name} · {job.project_name}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href={`/projects/${job.project_id}`} className="btn-secondary px-4 py-2 text-sm">Project</Link>
          <Link href={`/projects/${job.project_id}/work-orders/${job.work_order_id}`} className="btn-secondary px-4 py-2 text-sm">Work order →</Link>
        </div>
      </header>

      <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <div className="rounded border border-rule bg-paper p-4"><p className="text-xs uppercase tracking-wide text-graph">Arrival</p><p className="mt-2 text-sm text-ink">{formatShortDate(job.arrival_date)}</p></div>
        <div className="rounded border border-rule bg-paper p-4"><p className="text-xs uppercase tracking-wide text-graph">Due</p><p className="mt-2 text-sm text-ink">{formatShortDate(job.due_date)}</p></div>
        <div className="rounded border border-rule bg-paper p-4"><p className="text-xs uppercase tracking-wide text-graph">Yard row / bay</p><p className="mt-2 text-sm text-ink">{job.yard_location ?? "Not assigned"}</p></div>
        <div className="rounded border border-rule bg-paper p-4"><p className="text-xs uppercase tracking-wide text-graph">Priority</p><p className="mt-2 text-sm text-ink">{workOrderPriorityLabel(job.priority)}</p></div>
        <div className={`rounded border bg-paper p-4 ${overHours ? "border-weld" : "border-rule"}`}><p className="text-xs uppercase tracking-wide text-graph">Actual / planned</p><p className={`mt-2 font-mono text-sm ${overHours ? "text-weld" : "text-ink"}`}>{formatHours(job.actual_hours)} / {formatHours(job.planned_hours)}</p></div>
        <div className="rounded border border-rule bg-paper p-4"><p className="text-xs uppercase tracking-wide text-graph">Checklist</p><p className="mt-2 font-mono text-sm text-ink">{job.checklist_done} / {job.checklist_total}</p></div>
      </section>

      <section className="mt-5 rounded border border-rule bg-paper p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-graph">Paint scope</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {job.scope_areas.map((area) => <span key={area} className="rounded bg-bone px-2.5 py-1 text-xs text-ink">{paintScopeLabel(area)}</span>)}
            </div>
          </div>
          <div className="text-sm text-graph">Crew: {job.crew_names.length ? job.crew_names.join(", ") : "Unassigned"}</div>
        </div>
        {job.specification && <p className="mt-4 whitespace-pre-wrap border-t border-rule pt-4 text-sm leading-6 text-graph">{job.specification}</p>}
      </section>

      {canWork && active && (
        <div className="mt-6">
          <PaintStageControls
            jobId={job.job_id}
            projectId={job.project_id}
            workOrderId={job.work_order_id}
            stage={job.stage}
            canAdminister={canAdminister}
          />
        </div>
      )}

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
        <section>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-weld">Quality gates</p>
              <h2 className="mt-2 font-display text-2xl font-medium text-ink">Process checklist</h2>
            </div>
            <p className="text-xs text-graph">Forward movement is locked until required items are resolved.</p>
          </div>
          <div className="mt-4 space-y-3">
            {taskStages.map((stage) => {
              const stageTasks = tasks.filter((task) => task.stage === stage.value);
              const resolved = stageTasks.filter(({ status }) => status !== "pending").length;
              return (
                <details key={stage.value} open={stage.value === job.stage} className="rounded border border-rule bg-bone p-4">
                  <summary className="cursor-pointer text-sm font-medium text-ink">
                    {stage.label} <span className="ml-2 font-mono text-xs text-graph">{resolved}/{stageTasks.length}</span>
                  </summary>
                  <div className="mt-4 grid gap-3">
                    {stageTasks.map((task) => <PaintTaskForm key={task.task_id} jobId={job.job_id} task={task} canWork={canWork && active} />)}
                  </div>
                </details>
              );
            })}
          </div>
        </section>

        <aside className="space-y-6">
          {canAdminister && active && <PaintJobPlanForm job={job} />}

          <section className="rounded border border-rule bg-paper p-5">
            <h2 className="font-display text-xl font-medium text-ink">Stage history</h2>
            <ol className="mt-4 space-y-4">
              {stageEvents.map((event) => (
                <li key={event.event_id} className="border-l border-rule pl-3 text-xs">
                  <p className="font-medium text-ink">{event.old_stage ? `${paintStageLabel(event.old_stage)} → ` : "Created → "}{paintStageLabel(event.new_stage)}</p>
                  <p className="mt-1 text-graph">{formatDateTime(event.created_at)} · {event.changed_by_name}</p>
                  {event.note && <p className="mt-1 leading-5 text-graph">{event.note}</p>}
                </li>
              ))}
            </ol>
          </section>

          {canSeeFinancials && (
            <section className="rounded border border-rule bg-paper p-5">
              <h2 className="font-display text-xl font-medium text-ink">Quote & billing</h2>
              {job.estimate_id && job.opportunity_id && (
                <Link href={`/sales/${job.opportunity_id}/estimates/${job.estimate_id}`} className="mt-4 block rounded border border-rule bg-bone p-3 hover:border-weld">
                  <span className="block font-mono text-xs text-ink">{job.estimate_number}</span>
                  <span className="mt-1 block text-xs text-graph">{job.estimate_status ? estimateStatusLabel(job.estimate_status) : "—"} · {formatCad(job.estimate_total)}</span>
                </Link>
              )}
              {job.invoice_id ? (
                <Link href={`/billing/${job.invoice_id}`} className="mt-3 block rounded border border-rule bg-bone p-3 hover:border-weld">
                  <span className="block font-mono text-xs text-ink">{job.invoice_number}</span>
                  <span className="mt-1 block text-xs text-graph">{job.invoice_status ? invoiceStatusLabel(job.invoice_status) : "—"} · {formatCad(job.invoice_total)} · balance {formatCad(job.invoice_balance)}</span>
                </Link>
              ) : (
                <p className="mt-3 text-xs leading-5 text-graph">No invoice yet. The accepted quote can be converted after the vessel reaches Ready.</p>
              )}
              {job.material_cost !== null && <p className="mt-4 border-t border-rule pt-3 text-xs text-graph">Logged coating cost: <span className="font-mono text-ink">{formatCad(job.material_cost)}</span></p>}
            </section>
          )}
        </aside>
      </div>

      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-weld">Labor control</p>
            <h2 className="mt-2 font-display text-2xl font-medium text-ink">Actual hours</h2>
          </div>
          <p className={`font-mono text-sm ${overHours ? "text-weld" : "text-graph"}`}>{formatHours(job.actual_hours)} used · {formatHours(Math.max(0, Number(job.planned_hours) - Number(job.actual_hours)))} remaining</p>
        </div>
        <div className="mt-4">
          {canLogTime && active ? (
            <TimeEntryForm projectId={job.project_id} workOrderId={job.work_order_id} defaultWorkDate={today} />
          ) : (
            <p className="rounded border border-rule bg-paper p-4 text-sm text-graph">
              {canWork && !job.current_user_assigned ? "Ask a manager to assign you to this work order before logging hours." : "Labor entries are available from the linked work order."}
            </p>
          )}
        </div>
      </section>

      <section className="mt-10">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-weld">Coating traceability</p>
          <h2 className="mt-2 font-display text-2xl font-medium text-ink">Products, layers & conditions</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-graph">
            Record the exact product, batch, mix, quantity, conditions, film readings, and safety release for every application. The current manufacturer TDS and SDS remain the authority for product-specific preparation, pot life, recoat, and launch windows.
          </p>
        </div>

        {canWork && openForCoatings && active && (
          <div className="mt-5">
            <PaintCoatingLogForm
              jobId={job.job_id}
              projectId={job.project_id}
              workOrderId={job.work_order_id}
              allowedAreas={job.scope_areas}
              canViewFinancials={canSeeFinancials}
            />
          </div>
        )}

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {coatingLogs.map((log) => (
            <article key={log.log_id} className={`rounded border border-rule bg-paper p-5 ${log.voided_at ? "opacity-55" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-weld">{coatingOperationLabel(log.operation)} · {paintScopeLabel(log.area)}{log.coat_number ? ` · coat ${log.coat_number}` : ""}</p>
                  <h3 className="mt-2 font-display text-xl text-ink">{log.manufacturer} {log.product_name}</h3>
                  <p className="mt-1 text-xs text-graph">{[log.product_code, log.color, log.batch_lot ? `lot ${log.batch_lot}` : null].filter(Boolean).join(" · ") || "No code / color / lot recorded"}</p>
                </div>
                {log.voided_at && <span className="rounded border border-weld px-2 py-1 text-xs text-weld">Voided</span>}
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-rule pt-4 text-xs sm:grid-cols-4">
                <div><dt className="text-graph">Applied</dt><dd className="mt-1 text-ink">{formatDateTime(log.applied_at)}</dd></div>
                <div><dt className="text-graph">By</dt><dd className="mt-1 text-ink">{log.applied_by_name}</dd></div>
                <div><dt className="text-graph">Quantity</dt><dd className="mt-1 font-mono text-ink">{log.quantity_used} {log.quantity_unit}</dd></div>
                <div><dt className="text-graph">Method</dt><dd className="mt-1 text-ink">{applicationMethodLabel(log.application_method)}</dd></div>
                <div><dt className="text-graph">Ambient / substrate</dt><dd className="mt-1 font-mono text-ink">{log.ambient_temp_c ?? "—"} / {log.substrate_temp_c ?? "—"} °C</dd></div>
                <div><dt className="text-graph">RH / dew point</dt><dd className="mt-1 font-mono text-ink">{log.relative_humidity_pct ?? "—"}% / {log.dew_point_c ?? "—"} °C</dd></div>
                <div><dt className="text-graph">WFT / DFT</dt><dd className="mt-1 font-mono text-ink">{log.wet_film_mils ?? "—"} / {log.dry_film_mils ?? "—"} mils</dd></div>
                <div><dt className="text-graph">Mix / reducer</dt><dd className="mt-1 text-ink">{log.mix_ratio ?? "—"} / {log.reducer_thinner ?? "—"}</dd></div>
                {log.unit_cost !== null && <div><dt className="text-graph">Material cost</dt><dd className="mt-1 font-mono text-ink">{formatCad(Number(log.quantity_used) * Number(log.unit_cost))}</dd></div>}
              </dl>
              <p className="mt-4 text-xs text-graph">Releases: TDS · SDS · PPE · ventilation · clean/dry surface</p>
              {log.note && <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-graph">{log.note}</p>}
              {log.void_reason && <p className="mt-3 text-xs text-weld">Void reason: {log.void_reason}</p>}
              {canAdminister && !log.voided_at && <VoidPaintCoatingForm logId={log.log_id} jobId={job.job_id} />}
            </article>
          ))}
          {coatingLogs.length === 0 && <p className="col-span-full rounded border border-dashed border-rule py-12 text-center text-sm text-graph">No coating products logged yet.</p>}
        </div>
      </section>

      {canInvoice && !job.invoice_id && job.estimate_status === "accepted" && ["ready", "delivered"].includes(job.stage) && (
        <div className="mt-10">
          <PaintJobInvoiceForm jobId={job.job_id} issueDate={today} dueDate={addDays(today, 30)} />
        </div>
      )}
      {canInvoice && !job.invoice_id && job.estimate_status !== "accepted" && job.estimate_id && job.opportunity_id && (
        <p className="mt-10 rounded border border-rule bg-paper p-5 text-sm text-graph">
          Final invoice is locked until the quote is accepted. <Link href={`/sales/${job.opportunity_id}/estimates/${job.estimate_id}`} className="text-weld hover:underline">Review the quote →</Link>
        </p>
      )}
    </main>
  );
}
