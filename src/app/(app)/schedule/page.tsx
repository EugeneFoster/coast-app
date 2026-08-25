import Link from "next/link";
import { CancelScheduleSlotForm } from "@/components/cancel-schedule-slot-form";
import { ScheduleSlotForm } from "@/components/schedule-slot-form";
import { requireOperationsManager } from "@/lib/auth";
import { userRoleLabel } from "@/lib/employee-roles";
import {
  addDays,
  formatScheduleDay,
  formatScheduleTimeRange,
  isIsoDate,
  scheduleDurationHours,
  startOfWeek,
  vancouverDate,
  vancouverDateKey,
} from "@/lib/schedule";
import { getTeamSchedule } from "@/lib/schedule-data";
import { workOrderPriorityLabel, workOrderStatusLabel } from "@/lib/operations";

const priorityAccent = {
  low: "border-rule",
  normal: "border-rule",
  high: "border-ink/40",
  urgent: "border-weld",
} as const;

export default async function TeamSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  await requireOperationsManager();
  const query = await searchParams;
  const requestedDate = query.week && isIsoDate(query.week)
    ? query.week
    : vancouverDate();
  const weekStart = startOfWeek(requestedDate);
  const weekEnd = addDays(weekStart, 7);
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const { slots, employees, workOrders } = await getTeamSchedule(weekStart, weekEnd);
  const scheduledHours = slots.reduce(
    (sum, slot) => sum + scheduleDurationHours(slot.starts_at, slot.ends_at),
    0,
  );
  const scheduledEmployees = new Set(slots.map((slot) => slot.profile_id)).size;

  return (
    <main className="mx-auto max-w-[110rem] px-8 pb-12 pt-8">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-rule pb-5">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-weld">Operations planning</p>
          <h1 className="mt-2 font-display text-3xl font-medium text-ink">Team schedule</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-graph">
            One shift per employee and work order. Active overlaps are rejected by Postgres.
          </p>
        </div>
        <Link href="/my-day" className="btn-secondary px-4 py-2 text-sm">Open My day →</Link>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded border border-rule bg-paper p-4"><p className="text-xs uppercase tracking-wide text-graph">Shifts</p><p className="mt-2 font-mono text-2xl text-ink">{slots.length}</p></div>
        <div className="rounded border border-rule bg-paper p-4"><p className="text-xs uppercase tracking-wide text-graph">Scheduled hours</p><p className="mt-2 font-mono text-2xl text-ink">{scheduledHours.toFixed(1)} h</p></div>
        <div className="rounded border border-rule bg-paper p-4"><p className="text-xs uppercase tracking-wide text-graph">Crew scheduled</p><p className="mt-2 font-mono text-2xl text-ink">{scheduledEmployees} / {employees.length}</p></div>
      </div>

      <div className="mt-6">
        <ScheduleSlotForm employees={employees} workOrders={workOrders} weekStart={weekStart} />
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <Link href={`/schedule?week=${addDays(weekStart, -7)}`} className="text-sm text-graph hover:text-ink">← Previous week</Link>
        <div className="text-center">
          <h2 className="font-display text-xl font-medium text-ink">
            {formatScheduleDay(weekStart)} – {formatScheduleDay(addDays(weekStart, 6))}
          </h2>
          <Link href={`/schedule?week=${vancouverDate()}`} className="mt-1 inline-block text-xs text-weld">Current week</Link>
        </div>
        <Link href={`/schedule?week=${addDays(weekStart, 7)}`} className="text-sm text-graph hover:text-ink">Next week →</Link>
      </div>

      <section className="mt-5 overflow-x-auto pb-4">
        <div className="grid min-w-[105rem] grid-cols-7 gap-3">
          {days.map((day) => {
            const daySlots = slots.filter((slot) => vancouverDateKey(slot.starts_at) === day);
            const today = day === vancouverDate();
            return (
              <div key={day} className={`min-w-0 rounded border bg-paper ${today ? "border-weld" : "border-rule"}`}>
                <div className={`border-b px-3 py-3 ${today ? "border-weld bg-weld/5" : "border-rule"}`}>
                  <p className="font-medium text-ink">{formatScheduleDay(day)}</p>
                  <p className="mt-0.5 font-mono text-xs text-graph">{daySlots.length} shifts</p>
                </div>
                <div className="space-y-3 p-3">
                  {daySlots.map((slot) => (
                    <article key={slot.slot_id} className={`rounded border bg-bone p-3 ${priorityAccent[slot.work_order_priority]}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-mono text-[0.68rem] text-weld">{formatScheduleTimeRange(slot.starts_at, slot.ends_at)}</p>
                          <p className="mt-1 truncate text-sm font-medium text-ink">{slot.employee_name}</p>
                          <p className="mt-0.5 text-[0.68rem] text-graph">{userRoleLabel(slot.employee_role)}</p>
                        </div>
                        <span className="rounded border border-rule px-1.5 py-0.5 text-[0.62rem] text-graph">{workOrderPriorityLabel(slot.work_order_priority)}</span>
                      </div>
                      <Link href={`/projects/${slot.project_id}/work-orders/${slot.work_order_id}`} className="mt-3 block text-xs font-medium leading-5 text-ink hover:text-weld">
                        {slot.work_order_number} · {slot.work_order_title}
                      </Link>
                      <p className="mt-1 truncate text-xs text-graph">{slot.project_name}{slot.location ? ` · ${slot.location}` : ""}</p>
                      {slot.note && <p className="mt-2 text-xs leading-5 text-graph">{slot.note}</p>}
                      <p className="mt-2 text-[0.65rem] text-graph">{workOrderStatusLabel(slot.work_order_status)}</p>
                      <details className="mt-3 border-t border-rule pt-2">
                        <summary className="cursor-pointer text-xs text-weld">Reschedule / reassign</summary>
                        <div className="mt-3">
                          <ScheduleSlotForm employees={employees} workOrders={workOrders} weekStart={weekStart} slot={slot} compact />
                          <CancelScheduleSlotForm slotId={slot.slot_id} weekStart={weekStart} />
                        </div>
                      </details>
                    </article>
                  ))}
                  {daySlots.length === 0 && <p className="py-8 text-center text-xs text-graph">No shifts</p>}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
