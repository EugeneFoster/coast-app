"use server";

import { revalidatePath } from "next/cache";
import {
  describeDrift,
  detectSupplierDrift,
  isSupplierDataStale,
  type ApprovalActionState,
} from "@/lib/approvals";
import { getApprovalRequest } from "@/lib/approvals-data";
import { requireUser } from "@/lib/auth";
import { canApproveSupplierChange } from "@/lib/employee-roles";
import { logApproval } from "@/lib/suppliers/log";
import { isSupplierError } from "@/lib/suppliers/errors";
import { revalidateSupplierResult } from "@/lib/suppliers/search";
import { isSupplierId } from "@/lib/suppliers/types";
import { createClient } from "@/lib/supabase/server";
import type { ChangeApprovalRequest } from "@/lib/types";
import { getXeroSyncAdapter } from "@/lib/xero/sync";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

interface RpcResult {
  ok: boolean;
  code: string;
  status?: string;
  resultEntityId?: string | null;
}

function refreshApprovalViews(request?: ChangeApprovalRequest | null) {
  revalidatePath("/approvals");
  revalidatePath("/work-orders");
  if (request?.parent_entity_id) {
    // Work order pages are nested under their project; refreshing the list and
    // the work order index covers the places a material line is displayed.
    revalidatePath("/projects", "layout");
  }
}

/**
 * Verify that the supplier still says what it said when the proposal was made.
 *
 * Returns null when execution may proceed, or a message when the request has
 * been sent back for re-approval. Only runs for supplier-driven proposals whose
 * data is older than the freshness window — a decision made moments ago is
 * acted on directly.
 */
async function guardAgainstStaleSupplierData(
  supabase: SupabaseServerClient,
  request: ChangeApprovalRequest,
): Promise<string | null> {
  if (!request.supplier || !isSupplierId(request.supplier)) return null;
  if (!isSupplierDataStale(request.supplier_checked_at)) return null;

  // A replacement proposal stores the *new* number as proposed, but the
  // supersession relationship must be revalidated by looking up the old one.
  const lookupNumber =
    request.action_type === "replace_superseded_part"
      ? request.source_part_number
      : request.proposed_part_number ?? request.source_part_number;
  if (!lookupNumber) return null;

  const markStale = async ({
    summary,
    currentValues,
    proposedChanges,
    proposedPartNumber,
    supplierCheckedAt,
    detail,
  }: {
    summary: string;
    currentValues: Record<string, unknown>;
    proposedChanges: Record<string, unknown>;
    proposedPartNumber: string | null;
    supplierCheckedAt: string | null;
    detail: Record<string, unknown>;
  }) => {
    await supabase.rpc("mark_change_approval_stale", {
      p_request_id: request.id,
      p_summary: summary.slice(0, 300),
      p_current_values: currentValues,
      p_proposed_changes: proposedChanges,
      p_proposed_part_number: proposedPartNumber,
      p_supplier_checked_at: supplierCheckedAt,
      p_detail: detail,
    });
    refreshApprovalViews(request);
    logApproval({
      approvalRequestId: request.id,
      action: request.action_type,
      status: "stale_requires_reapproval",
      detail: summary,
    });
  };

  let fresh;
  try {
    fresh = await revalidateSupplierResult(request.supplier, lookupNumber);
  } catch (caught) {
    const message = isSupplierError(caught)
      ? caught.userMessage
      : "The supplier could not be reached.";
    await markStale({
      summary: `Supplier data could not be re-checked before applying this change. ${message}`,
      currentValues: request.current_values,
      proposedChanges: request.proposed_changes,
      proposedPartNumber: request.proposed_part_number,
      supplierCheckedAt: null,
      detail: { reason: "revalidation_failed" },
    });
    return "The supplier data could not be re-checked, so this change needs approving again.";
  }

  if (!fresh) {
    await markStale({
      summary: "The supplier no longer lists this part, so the approved change was not applied.",
      currentValues: request.current_values,
      proposedChanges: request.proposed_changes,
      proposedPartNumber: request.proposed_part_number,
      supplierCheckedAt: null,
      detail: { reason: "part_no_longer_listed" },
    });
    return "The supplier no longer lists this part. The change needs approving again.";
  }

  if (request.action_type === "replace_superseded_part" && !fresh.supersededBy) {
    await markStale({
      summary: "The supplier no longer reports a replacement for this part.",
      currentValues: { ...request.current_values, supersededBy: null },
      proposedChanges: request.proposed_changes,
      proposedPartNumber: request.proposed_part_number,
      // Keep forcing a re-check: the obsolete replacement must never become
      // executable merely because somebody approves this warning again.
      supplierCheckedAt: null,
      detail: { reason: "supersession_no_longer_reported" },
    });
    return "The supplier no longer reports that replacement. The change was not applied.";
  }

  if (
    ("unit_cost" in request.proposed_changes || "average_cost" in request.proposed_changes) &&
    fresh.dealerCost === null
  ) {
    await markStale({
      summary: "The supplier no longer publishes a dealer cost for this part.",
      currentValues: { ...request.current_values, dealerCost: null },
      proposedChanges: request.proposed_changes,
      proposedPartNumber: request.proposed_part_number,
      supplierCheckedAt: null,
      detail: { reason: "dealer_cost_no_longer_published" },
    });
    return "The supplier no longer publishes a dealer cost. The change was not applied.";
  }

  const drift = detectSupplierDrift(request, {
    // For a supersession proposal, the approved part number is the replacement
    // named by the old part's detail record, not the old detail record itself.
    partNumber:
      request.action_type === "replace_superseded_part" && fresh.supersededBy
        ? fresh.supersededBy
        : fresh.partNumber,
    dealerCost: fresh.dealerCost,
    currency: fresh.currency,
    supersededBy: fresh.supersededBy,
    stockStatus: fresh.stockStatus,
  });

  if (drift.length > 0) {
    const proposedChanges = { ...request.proposed_changes };
    if ("unit_cost" in proposedChanges && fresh.dealerCost !== null) {
      proposedChanges.unit_cost = fresh.dealerCost;
    }
    if ("average_cost" in proposedChanges && fresh.dealerCost !== null) {
      proposedChanges.average_cost = fresh.dealerCost;
    }
    if (request.action_type === "replace_superseded_part" && fresh.supersededBy) {
      proposedChanges.part_number = fresh.supersededBy;
    } else if (request.action_type === "add_work_order_material") {
      proposedChanges.part_number = fresh.partNumber;
    }
    const proposedPartNumber =
      typeof proposedChanges.part_number === "string"
        ? proposedChanges.part_number
        : request.proposed_part_number;

    await markStale({
      summary: `Supplier data changed since approval: ${describeDrift(drift)}.`,
      currentValues: {
        ...request.current_values,
        dealerCost: fresh.dealerCost,
        currency: fresh.currency,
        supersededBy: fresh.supersededBy,
        stockStatus: fresh.stockStatus,
      },
      proposedChanges,
      proposedPartNumber,
      supplierCheckedAt: fresh.checkedAt,
      detail: { reason: "supplier_data_changed", drift },
    });
    return `The supplier data changed since approval (${describeDrift(drift)}). Please review and approve again.`;
  }

  return null;
}

/**
 * Claim, apply and record one approved request.
 *
 * Not exported: execution is only ever reached through an approval decision, so
 * there is no endpoint that can be asked to execute an arbitrary request.
 */
async function executeApprovedRequest(
  supabase: SupabaseServerClient,
  requestId: string,
  actorId: string,
): Promise<ApprovalActionState> {
  const request = await getApprovalRequest(requestId);
  if (!request) {
    return { status: "error", message: "This request no longer exists." };
  }

  const staleMessage = await guardAgainstStaleSupplierData(supabase, request);
  if (staleMessage) {
    return { status: "error", message: staleMessage };
  }

  // Claim and apply the CRM mutation inside one database transaction. A crash
  // can no longer leave the business row changed while the request is stuck in
  // `executing` (or vice versa).
  const { data: executionData, error: executionError } = await supabase.rpc(
    "execute_change_approval_crm",
    { p_request_id: requestId },
  );
  if (executionError) {
    await supabase.rpc("fail_change_approval_execution", {
      p_request_id: requestId,
      p_error: executionError.message,
    });
    refreshApprovalViews(request);
    return { status: "error", message: executionError.message };
  }
  const execution = executionData as RpcResult;
  if (!execution?.ok) {
    if (execution?.code === "not_executable") {
      return {
        status: "error",
        message: "This request has already been applied or is no longer approved.",
      };
    }
    return { status: "error", message: "This request could not be applied." };
  }

  try {
    const resultId = execution.resultEntityId ?? null;
    const sync = await getXeroSyncAdapter().sync({
      approvalRequestId: request.id,
      actionType: request.action_type,
      entityId: resultId,
      idempotencyKey: request.idempotency_key,
    });

    const { data: syncRecordData, error: syncRecordError } = await supabase.rpc(
      "record_external_sync_result",
      {
        p_request_id: requestId,
        p_status: sync.status,
        p_error: sync.error,
      },
    );
    const syncRecord = syncRecordData as RpcResult;
    if (syncRecordError || !syncRecord?.ok) {
      refreshApprovalViews(request);
      return {
        status: "error",
        message: "The CRM change was applied, but its accounting status could not be recorded.",
      };
    }

    logApproval({
      approvalRequestId: requestId,
      action: request.action_type,
      status: "executed",
      actorId,
      entityType: request.entity_type,
      entityId: resultId ?? undefined,
    });
    refreshApprovalViews(request);

    if (sync.status === "failed") {
      return {
        status: "error",
        message:
          "The change was applied in Coastal CRM, but the accounting sync failed. See the request for details.",
      };
    }
    if (sync.status === "pending") {
      return {
        status: "success",
        message: "Approved and applied. The accounting sync is still pending.",
      };
    }
    return { status: "success", message: "Approved and applied." };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "The change could not be applied.";
    await supabase.rpc("record_external_sync_result", {
      p_request_id: requestId,
      p_status: "failed",
      p_error: message,
    });
    logApproval({
      approvalRequestId: requestId,
      action: request.action_type,
      status: "external_sync_failed",
      actorId,
      detail: message,
    });
    refreshApprovalViews(request);
    return {
      status: "error",
      message: `The CRM change was applied, but the accounting sync failed. ${message}`,
    };
  }
}

/** Resume an approval that was decided before the request process was interrupted. */
export async function executeApprovedRequestAction(
  requestId: string,
): Promise<ApprovalActionState> {
  const { user, profile } = await requireUser();
  if (!UUID_RE.test(requestId)) {
    return { status: "error", message: "Invalid request reference." };
  }
  if (!canApproveSupplierChange(profile.role)) {
    return { status: "error", message: "Your role cannot execute supplier changes." };
  }
  return executeApprovedRequest(await createClient(), requestId, user.id);
}

/**
 * Approve or reject a supplier-driven change.
 *
 * Rejection stops here: nothing is written to the CRM and nothing is sent to
 * Xero. Approval continues into execution.
 */
export async function decideApprovalAction(
  requestId: string,
  decision: "approved" | "rejected",
  _previous: ApprovalActionState,
  formData: FormData,
): Promise<ApprovalActionState> {
  const { user } = await requireUser();

  if (!UUID_RE.test(requestId)) {
    return { status: "error", message: "Invalid request reference." };
  }
  if (decision !== "approved" && decision !== "rejected") {
    return { status: "error", message: "Invalid decision." };
  }

  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500) || null;
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("decide_change_approval_request", {
    p_request_id: requestId,
    p_decision: decision,
    p_reason: reason,
  });

  if (error) {
    // Role failures surface as a Postgres error from the SECURITY DEFINER guard.
    return { status: "error", message: error.message };
  }

  const result = data as RpcResult;
  if (!result?.ok) {
    if (result?.code === "already_decided") {
      return { status: "error", message: "This request has already been decided." };
    }
    if (result?.code === "expired") {
      return { status: "error", message: "This request expired before it was decided." };
    }
    if (result?.code === "not_found") {
      return { status: "error", message: "This request no longer exists." };
    }
    return { status: "error", message: "This request could not be decided." };
  }

  logApproval({
    approvalRequestId: requestId,
    action: decision,
    status: "decided",
    actorId: user.id,
  });

  if (decision === "rejected") {
    refreshApprovalViews();
    return { status: "success", message: "Rejected. Nothing was changed." };
  }

  return executeApprovedRequest(supabase, requestId, user.id);
}

/**
 * Retry an accounting sync that failed after the CRM change already landed.
 * Idempotent: the original idempotency key is reused so a retry cannot create a
 * duplicate object in Xero.
 */
export async function retryExternalSyncAction(
  requestId: string,
): Promise<ApprovalActionState> {
  const { user, profile } = await requireUser();
  if (!UUID_RE.test(requestId)) {
    return { status: "error", message: "Invalid request reference." };
  }
  if (!canApproveSupplierChange(profile.role)) {
    return { status: "error", message: "Your role cannot retry accounting syncs." };
  }

  const request = await getApprovalRequest(requestId);
  if (!request) return { status: "error", message: "This request no longer exists." };
  if (
    request.status !== "executed" ||
    !["pending", "failed"].includes(request.external_sync_status)
  ) {
    return { status: "error", message: "There is no pending or failed sync to retry." };
  }

  const supabase = await createClient();
  const sync = await getXeroSyncAdapter().sync({
    approvalRequestId: request.id,
    actionType: request.action_type,
    entityId: request.result_entity_id,
    idempotencyKey: request.idempotency_key,
  });

  const { data, error } = await supabase.rpc("record_external_sync_result", {
    p_request_id: requestId,
    p_status: sync.status,
    p_error: sync.error,
  });
  const recorded = data as RpcResult;
  if (error || !recorded?.ok) {
    return {
      status: "error",
      message: error?.message ?? "The accounting status could not be recorded.",
    };
  }

  logApproval({
    approvalRequestId: requestId,
    action: "retry_sync",
    status: sync.status,
    actorId: user.id,
  });
  refreshApprovalViews(request);

  if (sync.status === "failed") {
    return { status: "error", message: sync.error ?? "The accounting sync failed again." };
  }
  if (sync.status === "not_required") {
    return {
      status: "success",
      message: "Xero is not connected, so this change needs no sync.",
    };
  }
  if (sync.status === "pending") {
    return { status: "success", message: "The accounting sync is still pending." };
  }
  return { status: "success", message: "Synced to Xero." };
}

export async function markNotificationsReadAction(ids?: string[]) {
  await requireUser();
  const supabase = await createClient();
  const safeIds = (ids ?? []).filter((id) => UUID_RE.test(id));
  await supabase.rpc("mark_notifications_read", {
    p_ids: safeIds.length > 0 ? safeIds : null,
  });
  revalidatePath("/approvals", "layout");
}
