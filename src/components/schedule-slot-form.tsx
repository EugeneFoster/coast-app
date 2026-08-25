"use client";

import { useActionState } from "react";
import { saveScheduleSlotAction } from "@/lib/actions/schedule";
import { userRoleLabel } from "@/lib/employee-roles";
import {
  INITIAL_SCHEDULE_ACTION_STATE,
  toVancouverDateTimeLocal,
} from "@/lib/schedule";
import type {
  ScheduleEmployee,
  ScheduleWorkOrder,
  TeamScheduleSlot,
} from "@/lib/schedule-data";

export function ScheduleSlotForm({
  employees,
  workOrders,
  weekStart,
  slot,
  compact = false,
}: {
  employees: ScheduleEmployee[];
  workOrders: ScheduleWorkOrder[];
  weekStart: string;
  slot?: TeamScheduleSlot;
  compact?: boolean;
}) {
  const [state, action, pending] = useActionState(
    saveScheduleSlotAction,
    INITIAL_SCHEDULE_ACTION_STATE,
  );
  const startsDefault = slot
    ? toVancouverDateTimeLocal(slot.starts_at)
    : `${weekStart}T08:00`;
  const endsDefault = slot
    ? toVancouverDateTimeLocal(slot.ends_at)
    : `${weekStart}T16:00`;
  const inputClass =
    "mt-1 w-full rounded border border-rule bg-bone px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none disabled:opacity-50";

  return (
    <form action={action} className={compact ? "space-y-3" : "rounded border border-rule bg-paper p-5"}>
      <input type="hidden" name="slot_id" value={slot?.slot_id ?? ""} />
      <input type="hidden" name="return_week" value={weekStart} />
      {!compact && (
        <div>
          <h2 className="font-display text-xl font-medium text-ink">Schedule a shift</h2>
          <p className="mt-1 text-sm text-graph">
            Times are entered in Vancouver time. Overlapping active shifts are blocked.
          </p>
        </div>
      )}
      <div className={`grid gap-4 ${compact ? "" : "mt-5 md:grid-cols-2 xl:grid-cols-4"}`}>
        <label className={`text-sm font-medium text-ink ${compact ? "" : "md:col-span-2"}`}>
          Work order
          <select
            name="work_order_id"
            required
            defaultValue={slot?.work_order_id ?? ""}
            disabled={pending}
            className={inputClass}
          >
            <option value="" disabled>Select work order</option>
            {workOrders.map((workOrder) => (
              <option key={workOrder.id} value={workOrder.id}>
                {workOrder.work_order_number} · {workOrder.project_name} · {workOrder.title}
              </option>
            ))}
          </select>
        </label>
        <label className={`text-sm font-medium text-ink ${compact ? "" : "md:col-span-2"}`}>
          Employee
          <select
            name="profile_id"
            required
            defaultValue={slot?.profile_id ?? ""}
            disabled={pending}
            className={inputClass}
          >
            <option value="" disabled>Select employee</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.full_name ?? employee.login} · {userRoleLabel(employee.role)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-ink">
          Start
          <input
            name="starts_local"
            type="datetime-local"
            required
            defaultValue={startsDefault}
            disabled={pending}
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium text-ink">
          End
          <input
            name="ends_local"
            type="datetime-local"
            required
            defaultValue={endsDefault}
            disabled={pending}
            className={inputClass}
          />
        </label>
        <label className={`text-sm font-medium text-ink ${compact ? "" : "md:col-span-2"}`}>
          Shift note (optional)
          <input
            name="note"
            maxLength={500}
            defaultValue={slot?.note ?? ""}
            placeholder="Gate code, tools, handoff…"
            disabled={pending}
            className={inputClass}
          />
        </label>
      </div>
      <div className={`${compact ? "" : "mt-5"} flex flex-wrap items-center gap-4`}>
        <button
          type="submit"
          disabled={pending || employees.length === 0 || workOrders.length === 0}
          className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
        >
          {pending ? "Saving…" : slot ? "Save new schedule" : "Add shift"}
        </button>
        {state.message && (
          <p className="text-sm text-weld" aria-live="polite">{state.message}</p>
        )}
      </div>
    </form>
  );
}
