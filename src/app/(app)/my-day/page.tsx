import Link from "next/link";
import { updateWorkOrderStatusAction } from "@/lib/actions/operations";
import { requireUser } from "@/lib/auth";
import { canManageOperations } from "@/lib/employee-roles";
import {
  allowedWorkOrderTransitions,
  workOrderPriorityLabel,
  workOrderStatusLabel,
} from "@/lib/operations";
import {
  addDays,
  formatScheduleDay,
  formatScheduleTimeRange,
  isIsoDate,
  scheduleDurationHours,
  vancouverDate,
} from "@/lib/schedule";
import { getMyDay } from "@/lib/schedule-data";
import { serviceCategoryLabel } from "@/lib/sales";

export default async function MyDayPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { profile } = await requireUser();
  const query = await searchParams;
  const day = query.date && isIsoDate(query.date) ? query.date : vancouverDate();
  const { slots, unscheduled } = await getMyDay(day, addDays(day, 1));
  const scheduledHours = slots.reduce(
    (sum, slot) => sum + scheduleDurationHours(slot.starts_at, slot.ends_at),
    0,
  );
  const canManage = canManageOperations(profile.role);

  return (
    <main className="mx-auto max-w-5xl px-5 pb-12 pt-5 sm:px-8 sm:pt-8">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-rule pb-5">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-weld">Personal operations</p>
          <h1 className="mt-2 font-display text-3xl font-medium text-ink">My day</h1>
          <p className="mt-2 text-sm text-graph">{formatScheduleDay(day)} · Vancouver time</p>
        </div>
        {canManage && <Link href={`/schedule?week=${day}`} className="btn-secondary px-4 py-2 text-sm">Team schedule →</Link>}
      </div>

      <div className="mt-5 flex items-center justify-between gap-4">
        <Link href={`/my-day?date=${addDays(day, -1)}`} className="text-sm text-graph hover:text-ink">← Previous</Link>
        <Link href="/my-day" className="text-sm text-weld">Today</Link>
        <Link href={`/my-day?date=${addDays(day, 1)}`} className="text-sm text-graph hover:text-ink">Next →</Link>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded border border-rule bg-paper p-4"><p className="text-xs uppercase tracking-wide text-graph">Scheduled shifts</p><p className="mt-2 font-mono text-2xl text-ink">{slots.length}</p></div>
        <div className="rounded border border-rule bg-paper p-4"><p className="text-xs uppercase tracking-wide text-graph">Scheduled time</p><p className="mt-2 font-mono text-2xl text-ink">{scheduledHours.toFixed(1)} h</p></div>
      </div>

      <section className="mt-7 space-y-4">
        {slots.map((slot) => {
          const transitions = allowedWorkOrderTransitions(slot.work_order_status, canManage);
          return (
            <article key={slot.slot_id} className="rounded border border-rule bg-paper p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-sm font-medium text-weld">{formatScheduleTimeRange(slot.starts_at, slot.ends_at)}</p>
                  <Link href={`/projects/${slot.project_id}/work-orders/${slot.work_order_id}`} className="mt-2 block font-display text-xl font-medium text-ink hover:text-weld">
                    {slot.work_order_title}
                  </Link>
                  <p className="mt-1 font-mono text-xs text-graph">{slot.work_order_number} · {slot.project_name}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded border border-rule px-2.5 py-1 text-xs text-graph">{workOrderPriorityLabel(slot.work_order_priority)}</span>
                  <span className="rounded border border-rule px-2.5 py-1 text-xs text-ink">{workOrderStatusLabel(slot.work_order_status)}</span>
                </div>
              </div>
              <dl className="mt-5 grid gap-4 border-t border-rule pt-4 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-graph">Service</dt><dd className="mt-1 text-ink">{serviceCategoryLabel(slot.service_category)}</dd></div>
                <div><dt className="text-xs text-graph">Location</dt><dd className="mt-1 text-ink">{slot.location ?? "—"}</dd></div>
              </dl>
              {slot.note && <p className="mt-4 rounded border border-rule bg-bone p-3 text-sm leading-6 text-graph"><span className="font-medium text-ink">Shift note:</span> {slot.note}</p>}
              {slot.work_order_description && <p className="mt-4 text-sm leading-6 text-graph">{slot.work_order_description}</p>}
              {transitions.length > 0 && (
                <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-rule pt-4">
                  <span className="mr-2 text-xs text-graph">Update work:</span>
                  {transitions.map((nextStatus) => (
                    <form key={nextStatus} action={updateWorkOrderStatusAction.bind(null, slot.project_id, slot.work_order_id, nextStatus)}>
                      <button type="submit" className={nextStatus === "in_progress" || nextStatus === "completed" ? "btn-primary px-3 py-2 text-xs" : "btn-secondary px-3 py-2 text-xs"}>
                        {workOrderStatusLabel(nextStatus)}
                      </button>
                    </form>
                  ))}
                </div>
              )}
            </article>
          );
        })}
        {slots.length === 0 && (
          <div className="rounded border border-dashed border-rule bg-paper px-5 py-12 text-center">
            <p className="font-display text-xl text-ink">No scheduled shifts</p>
            <p className="mt-2 text-sm text-graph">Your assigned work without a scheduled shift appears below.</p>
          </div>
        )}
      </section>

      <section className="mt-10 border-t border-rule pt-7">
        <h2 className="font-display text-2xl font-medium text-ink">Assigned, not scheduled</h2>
        <p className="mt-1 text-sm text-graph">Active work orders assigned to you without a shift.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {unscheduled.map((workOrder) => (
            <Link key={workOrder.work_order_id} href={`/projects/${workOrder.project_id}/work-orders/${workOrder.work_order_id}`} className="rounded border border-rule bg-paper p-4 transition-colors hover:border-weld">
              <div className="flex items-start justify-between gap-3">
                <div><p className="font-mono text-xs text-weld">{workOrder.work_order_number}</p><h3 className="mt-1 font-medium text-ink">{workOrder.work_order_title}</h3></div>
                <span className="text-xs text-graph">{workOrderPriorityLabel(workOrder.work_order_priority)}</span>
              </div>
              <p className="mt-2 text-xs text-graph">{workOrder.project_name}{workOrder.location ? ` · ${workOrder.location}` : ""}</p>
            </Link>
          ))}
          {unscheduled.length === 0 && <p className="text-sm text-graph">No unscheduled assigned work.</p>}
        </div>
      </section>
    </main>
  );
}
