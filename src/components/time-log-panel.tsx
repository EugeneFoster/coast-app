"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteTimeLog, logTime } from "@/lib/actions/time";
import type { Task, TimeLog } from "@/lib/types";

function formatHours(minutes: number) {
  return (Math.round((minutes / 60) * 10) / 10).toString();
}

export function TimeLogPanel({
  projectId,
  tasks,
  logs,
  totalMinutes,
  canViewAll,
  currentUserId,
}: {
  projectId: string;
  tasks: Task[];
  logs: TimeLog[];
  totalMinutes: number;
  canViewAll: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [hours, setHours] = useState("");
  const [workDate, setWorkDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [taskId, setTaskId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const h = Number(hours);
    if (!Number.isFinite(h) || h <= 0) {
      setError("Enter hours worked (e.g. 1.5).");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await logTime({
      projectId,
      taskId: taskId || null,
      minutes: Math.round(h * 60),
      workDate,
      note: note.trim() || null,
    });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setHours("");
    setNote("");
    setTaskId("");
    router.refresh();
  }

  async function remove(id: string) {
    const result = await deleteTimeLog(id);
    if (result.error) setError(result.error);
    else router.refresh();
  }

  return (
    <section className="mt-10 border-t border-rule pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-medium text-ink">Time</h2>
        <span className="font-mono text-sm text-graph">
          {formatHours(totalMinutes)} h {canViewAll ? "total" : "by you"}
        </span>
      </div>

      {error && (
        <p className="mt-3 rounded border border-weld/40 bg-weld/10 px-3 py-2 text-sm text-weld">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-3 rounded border border-rule bg-paper p-4">
        <label className="text-xs text-graph">
          Hours
          <input
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            inputMode="decimal"
            placeholder="1.5"
            className="mt-1 block w-24 rounded border border-rule bg-bone px-2 py-1.5 text-sm text-ink focus:border-weld focus:outline-none"
          />
        </label>
        <label className="text-xs text-graph">
          Date
          <input
            type="date"
            value={workDate}
            onChange={(e) => setWorkDate(e.target.value)}
            className="mt-1 block rounded border border-rule bg-bone px-2 py-1.5 text-sm text-ink focus:border-weld focus:outline-none"
          />
        </label>
        {tasks.length > 0 && (
          <label className="text-xs text-graph">
            Task (optional)
            <select
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
              className="mt-1 block max-w-[12rem] rounded border border-rule bg-bone px-2 py-1.5 text-sm text-ink focus:border-weld focus:outline-none"
            >
              <option value="">—</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex-1 text-xs text-graph">
          Note (optional)
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What did you work on?"
            className="mt-1 block w-full rounded border border-rule bg-bone px-2 py-1.5 text-sm text-ink focus:border-weld focus:outline-none"
          />
        </label>
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="rounded bg-weld px-4 py-2 text-sm font-medium text-paper disabled:opacity-60"
        >
          {busy ? "Logging…" : "Log time"}
        </button>
      </div>

      {logs.length > 0 ? (
        <ul className="mt-4 divide-y divide-rule/60 overflow-hidden rounded border border-rule">
          {logs.map((l) => (
            <li
              key={l.id}
              className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
            >
              <div className="min-w-0">
                <span className="font-mono text-ink">{formatHours(l.minutes)} h</span>
                {canViewAll && (
                  <span className="ml-2 text-graph">{l.author}</span>
                )}
                {l.note && (
                  <span className="ml-2 truncate text-graph">— {l.note}</span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="font-mono text-xs text-graph">
                  {l.workDate}
                </span>
                {(canViewAll || l.authorId === currentUserId) && (
                  <button
                    type="button"
                    onClick={() => remove(l.id)}
                    className="text-xs text-graph hover:text-weld"
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-graph">No time logged yet.</p>
      )}
    </section>
  );
}
