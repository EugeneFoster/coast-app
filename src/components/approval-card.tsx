"use client";

import { useActionState, useState } from "react";
import {
  APPROVAL_ACTION_LABELS,
  APPROVAL_STATUS_LABELS,
  EXTERNAL_SYNC_LABELS,
  INITIAL_APPROVAL_ACTION_STATE,
  XERO_IMPACT_LABELS,
  buildApprovalDiff,
  formatCad,
  formatCheckedAt,
  isDecidable,
} from "@/lib/approvals";
import {
  decideApprovalAction,
  executeApprovedRequestAction,
  retryExternalSyncAction,
} from "@/lib/actions/approvals";
import type { ChangeApprovalRequest, ChangeApprovalStatus } from "@/lib/types";

const STATUS_STYLES: Record<ChangeApprovalStatus, string> = {
  pending_approval: "border-weld text-weld",
  stale_requires_reapproval: "border-weld text-weld",
  approved: "border-rule text-graph",
  executing: "border-rule text-graph",
  executed: "border-rule text-graph",
  rejected: "border-rule text-graph",
  expired: "border-rule text-graph",
  failed: "border-weld text-weld",
};

function personLabel(person: { full_name: string | null; login: string } | null | undefined) {
  if (!person) return "someone";
  return person.full_name?.trim() || person.login;
}

function formatTime(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.valueOf())
    ? ""
    : date.toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" });
}

export function ApprovalCard({
  request,
  canDecide,
}: {
  request: ChangeApprovalRequest;
  canDecide: boolean;
}) {
  const [showReason, setShowReason] = useState(false);
  const [syncState, setSyncState] = useState<{ status: string; message: string } | null>(null);
  const [syncing, setSyncing] = useState(false);

  const approve = decideApprovalAction.bind(null, request.id, "approved");
  const reject = decideApprovalAction.bind(null, request.id, "rejected");
  const [approveState, approveAction, approvePending] = useActionState(
    approve,
    INITIAL_APPROVAL_ACTION_STATE,
  );
  const [rejectState, rejectAction, rejectPending] = useActionState(
    reject,
    INITIAL_APPROVAL_ACTION_STATE,
  );

  const diff = buildApprovalDiff(request);
  const decidable = isDecidable(request);
  const pending = approvePending || rejectPending;
  const feedback =
    approveState.message ? approveState : rejectState.message ? rejectState : null;

  const costDelta = diff.find((row) => row.delta !== null && row.delta !== 0)?.delta ?? null;
  const syncNeedsAttention =
    request.status === "executed" &&
    (request.external_sync_status === "pending" || request.external_sync_status === "failed");

  return (
    <article className="rounded border border-rule bg-paper p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-graph">
            {APPROVAL_ACTION_LABELS[request.action_type]}
          </p>
          <h3 className="mt-1 font-display text-lg font-medium text-ink">{request.summary}</h3>
          <p className="mt-1 text-xs text-graph">
            Proposed by {personLabel(request.requester)} · {formatTime(request.created_at)}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center rounded-[14px] border px-2 py-0.5 font-mono text-xs ${
            STATUS_STYLES[request.status]
          }`}
        >
          {APPROVAL_STATUS_LABELS[request.status]}
        </span>
      </header>

      {diff.length > 0 && (
        <dl className="mt-4 divide-y divide-rule border-y border-rule">
          {diff.map((row) => (
            <div
              key={row.key}
              className="grid grid-cols-[8rem_1fr] gap-2 py-2 text-sm sm:grid-cols-[10rem_1fr]"
            >
              <dt className="text-graph">{row.label}</dt>
              <dd className="font-mono text-ink">
                {row.before ? (
                  <>
                    <span className="text-graph line-through">{row.before}</span>
                    <span className="px-2 text-graph">→</span>
                  </>
                ) : null}
                <span>{row.after ?? "—"}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}

      {costDelta !== null && (
        <p className="mt-3 font-mono text-sm text-ink">
          Cost change: {costDelta > 0 ? "+" : ""}
          {formatCad(costDelta)}
        </p>
      )}

      <dl className="mt-4 grid gap-2 text-xs text-graph sm:grid-cols-2">
        {request.supplier && (
          <div>
            <dt className="inline">Supplier data: </dt>
            <dd className="inline text-ink">
              {String(request.current_values.supplierName ?? request.supplier)} ·{" "}
              {formatCheckedAt(request.supplier_checked_at)}
            </dd>
          </div>
        )}
        <div>
          <dt className="inline">Xero: </dt>
          <dd className="inline text-ink">
            {request.xero_impact_detail ?? XERO_IMPACT_LABELS[request.xero_impact]}
          </dd>
        </div>
        {request.status === "executed" && (
          <div>
            <dt className="inline">Sync: </dt>
            <dd className="inline text-ink">
              {EXTERNAL_SYNC_LABELS[request.external_sync_status]}
            </dd>
          </div>
        )}
        {typeof request.current_values.productUrl === "string" && (
          <div>
            <a
              href={request.current_values.productUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-weld underline"
            >
              Open at supplier
            </a>
          </div>
        )}
      </dl>

      {request.status === "rejected" && (
        <p className="mt-3 text-sm text-graph">
          Rejected by {personLabel(request.decider)} · {formatTime(request.decided_at)}
          {request.rejection_reason ? ` — “${request.rejection_reason}”` : ""}
        </p>
      )}
      {request.status === "executed" && (
        <p className="mt-3 text-sm text-graph">
          Approved by {personLabel(request.decider)} · {formatTime(request.decided_at)}
        </p>
      )}
      {request.status === "failed" && request.execution_error && (
        <p className="mt-3 text-sm text-weld">{request.execution_error}</p>
      )}
      {request.status === "stale_requires_reapproval" && (
        <p className="mt-3 text-sm text-weld">
          Supplier data changed after the earlier decision. Review the values above before
          approving again.
        </p>
      )}

      {syncNeedsAttention && (
        <div className="mt-3 rounded border border-weld/40 bg-weld/5 p-3">
          <p className="text-sm text-ink">
            The change was applied in Coastal CRM, but its Xero sync is{" "}
            {request.external_sync_status === "failed" ? "failed" : "still pending"}.
            {request.external_sync_error ? ` ${request.external_sync_error}` : ""}
          </p>
          {canDecide && (
            <button
              type="button"
              disabled={syncing}
              onClick={async () => {
                setSyncing(true);
                const result = await retryExternalSyncAction(request.id);
                setSyncState(result);
                setSyncing(false);
              }}
              className="btn-secondary mt-2 px-3 py-1.5 text-sm disabled:opacity-60"
            >
              {syncing ? "Retrying…" : "Retry sync"}
            </button>
          )}
          {syncState && (
            <p
              className={`mt-2 text-sm ${syncState.status === "error" ? "text-weld" : "text-graph"}`}
              aria-live="polite"
            >
              {syncState.message}
            </p>
          )}
        </div>
      )}

      {canDecide && request.status === "approved" && (
        <div className="mt-4 border-t border-rule pt-4">
          <button
            type="button"
            disabled={syncing}
            onClick={async () => {
              setSyncing(true);
              const result = await executeApprovedRequestAction(request.id);
              setSyncState(result);
              setSyncing(false);
            }}
            className="btn-primary px-4 py-2 text-sm disabled:opacity-60"
          >
            {syncing ? "Applying…" : "Apply approved change"}
          </button>
          {syncState && (
            <p
              className={`mt-2 text-sm ${syncState.status === "error" ? "text-weld" : "text-graph"}`}
              aria-live="polite"
            >
              {syncState.message}
            </p>
          )}
        </div>
      )}

      {canDecide && decidable && (
        <div className="mt-4 border-t border-rule pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <form action={approveAction}>
              <button
                type="submit"
                disabled={pending}
                className="btn-primary px-4 py-2 text-sm disabled:opacity-60"
              >
                {approvePending ? "Applying…" : "Approve"}
              </button>
            </form>
            <button
              type="button"
              disabled={pending}
              onClick={() => setShowReason((value) => !value)}
              className="btn-secondary px-4 py-2 text-sm disabled:opacity-60"
            >
              Reject
            </button>
          </div>

          {showReason && (
            <form action={rejectAction} className="mt-3 flex flex-wrap gap-2">
              <input
                name="reason"
                maxLength={500}
                placeholder="Reason (optional) — e.g. keep the old number"
                disabled={pending}
                className="min-w-0 flex-1 rounded border border-rule bg-paper px-3 py-2 text-sm text-ink focus:border-weld focus:outline-none disabled:opacity-50"
                aria-label="Rejection reason"
              />
              <button
                type="submit"
                disabled={pending}
                className="btn-secondary px-4 py-2 text-sm disabled:opacity-60"
              >
                {rejectPending ? "Rejecting…" : "Confirm reject"}
              </button>
            </form>
          )}
        </div>
      )}

      {!canDecide && decidable && (
        <p className="mt-4 border-t border-rule pt-4 text-sm text-graph">
          Waiting for an owner or project manager to decide.
        </p>
      )}

      {feedback && (
        <p
          className={`mt-3 text-sm ${feedback.status === "error" ? "text-weld" : "text-graph"}`}
          aria-live="polite"
        >
          {feedback.message}
        </p>
      )}
    </article>
  );
}
