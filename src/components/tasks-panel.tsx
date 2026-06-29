"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createTask,
  deleteTask,
  setTaskStatus,
  updateTask,
} from "@/lib/actions/tasks";
import type { Task, TaskStatus } from "@/lib/types";

type Member = { id: string; name: string };

const COLUMNS: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "blocked", label: "Blocked" },
  { value: "done", label: "Done" },
];

const STATUS_DOT: Record<TaskStatus, string> = {
  todo: "bg-graph",
  in_progress: "bg-weld",
  blocked: "bg-weld",
  done: "bg-ink",
};

export function TasksPanel({
  projectId,
  tasks,
  members,
  canManage,
}: {
  projectId: string;
  tasks: Task[];
  members: Member[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitNew() {
    const t = title.trim();
    if (!t) {
      setError("Task title is required.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await createTask({
      projectId,
      title: t,
      description: description.trim() || null,
      assigneeId: assigneeId || null,
      dueDate: dueDate || null,
    });
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setTitle("");
    setDescription("");
    setAssigneeId("");
    setDueDate("");
    setCreating(false);
    router.refresh();
  }

  async function changeStatus(taskId: string, status: TaskStatus) {
    const result = await setTaskStatus(taskId, status);
    if (result.error) setError(result.error);
    else router.refresh();
  }

  async function changeAssignee(taskId: string, value: string) {
    const result = await updateTask(taskId, { assigneeId: value || null });
    if (result.error) setError(result.error);
    else router.refresh();
  }

  async function remove(taskId: string) {
    const result = await deleteTask(taskId);
    if (result.error) setError(result.error);
    else router.refresh();
  }

  const open = tasks.filter((t) => t.status !== "done").length;

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-graph">
          {tasks.length === 0
            ? "No tasks yet."
            : `${open} open · ${tasks.length} total`}
        </p>
        {canManage && (
          <button
            type="button"
            onClick={() => setCreating((v) => !v)}
            className="rounded bg-weld px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-90"
          >
            {creating ? "Cancel" : "New task"}
          </button>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded border border-weld/40 bg-weld/10 px-3 py-2 text-sm text-weld">
          {error}
        </p>
      )}

      {canManage && creating && (
        <div className="mt-4 space-y-3 rounded border border-rule bg-paper p-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title (e.g. Weld gangway hinge brackets)"
            className="w-full rounded border border-rule bg-bone px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Details (optional)"
            className="w-full rounded border border-rule bg-bone px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none"
          />
          <div className="flex flex-wrap gap-3">
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="rounded border border-rule bg-bone px-3 py-2 text-sm text-ink"
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="rounded border border-rule bg-bone px-3 py-2 text-sm text-ink"
            />
            <button
              type="button"
              onClick={submitNew}
              disabled={busy}
              className="rounded bg-weld px-4 py-2 text-sm font-medium text-paper disabled:opacity-60"
            >
              {busy ? "Saving…" : "Add task"}
            </button>
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.value);
          return (
            <div
              key={col.value}
              className="rounded border border-rule bg-ink/[0.015] dark:bg-paper/[0.02]"
            >
              <div className="flex items-center gap-2 border-b border-rule px-3 py-2">
                <span
                  className={`h-2 w-2 rounded-full ${STATUS_DOT[col.value]}`}
                />
                <span className="text-sm font-medium text-ink">
                  {col.label}
                </span>
                <span className="ml-auto font-mono text-xs text-graph">
                  {colTasks.length}
                </span>
              </div>
              <div className="space-y-2 p-2">
                {colTasks.map((task) => (
                  <div
                    key={task.id}
                    className="rounded border border-rule bg-paper p-3"
                  >
                    <p className="text-sm font-medium text-ink">{task.title}</p>
                    {task.description && (
                      <p className="mt-1 whitespace-pre-wrap text-xs text-graph">
                        {task.description}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-graph">
                      <span>{task.assigneeName ?? "Unassigned"}</span>
                      {task.dueDate && (
                        <span className="font-mono">
                          due {task.dueDate}
                        </span>
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <select
                        value={task.status}
                        onChange={(e) =>
                          changeStatus(task.id, e.target.value as TaskStatus)
                        }
                        className="rounded border border-rule bg-bone px-2 py-1 text-xs text-ink focus:border-weld focus:outline-none"
                      >
                        {COLUMNS.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        ))}
                      </select>

                      {canManage && (
                        <>
                          <select
                            value={task.assigneeId ?? ""}
                            onChange={(e) =>
                              changeAssignee(task.id, e.target.value)
                            }
                            className="rounded border border-rule bg-bone px-2 py-1 text-xs text-ink focus:border-weld focus:outline-none"
                          >
                            <option value="">Unassigned</option>
                            {members.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => remove(task.id)}
                            className="text-xs text-graph hover:text-weld"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {colTasks.length === 0 && (
                  <p className="px-1 py-3 text-center text-xs text-graph">
                    —
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
