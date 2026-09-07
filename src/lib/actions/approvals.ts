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

function numberFrom(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function textFrom(value: unknown, maxLength = 500): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

/**
 * Apply an approved change to the CRM.
 *
 * Runs with the approver's own Supabase client, so row level security still
 * applies — approval does not become a way to bypass the permissions the user
 * would otherwise have. Returns the id of the row that was created or changed.
 */
async function applyChange(
  supabase: SupabaseServerClient,
  request: ChangeApprovalRequest,
  actorId: string,
): Promise<string> {
  const proposed = request.proposed_changes;

  switch (request.action_type) {
    case "add_work_order_material": {
      const workOrderId = request.parent_entity_id;
      if (!workOrderId) throw new Error("The proposal has no work order.");

      const description = textFrom(proposed.description);
      const quantity = numberFrom(proposed.quantity);
      const unitCost = numberFrom(proposed.unit_cost) ?? 0;
      if (!description) throw new Error("The proposal has no part description.");
      if (quantity === null || quantity <= 0) {
        throw new Error("The proposal has an invalid quantity.");
      }
      if (unitCost < 0) throw new Error("The proposal has a negative cost.");

      const { data, error } = await supabase
        .from("material_entries")
        .insert({
          work_order_id: workOrderId,
          description,
          part_number: textFrom(proposed.part_number, 100),
          quantity,
          unit: textFrom(proposed.unit, 20) ?? "ea",
          unit_cost: unitCost,
          entered_by: actorId,
        })
        .select("id")
        .single();
      if (error || !data) throw new Error(error?.message ?? "Could not add the part.");
      return data.id;
    }

    case "update_work_order_material_cost":
    case "replace_superseded_part": {
      const entryId = request.entity_id;
      if (!entryId) throw new Error("The proposal has no material line.");

      const { data: existing, error: readError } = await supabase
        .from("material_entries")
        .select("id, inventory_movement_id")
        .eq("id", entryId)
        .maybeSingle();
      if (readError) throw new Error(readError.message);
      if (!existing) throw new Error("The material line no longer exists.");
      if (existing.inventory_movement_id) {
        // Warehouse-issued lines carry stock movements; editing them here would
        // desynchronise inventory costing.
        throw new Error("This line came from a warehouse issue and must be changed through inventory.");
      }

      const patch: Record<string, string | number> = {};
      const unitCost = numberFrom(proposed.unit_cost);
      if (unitCost !== null) {
        if (unitCost < 0) throw new Error("The proposal has a negative cost.");
        patch.unit_cost = unitCost;
      }
      const partNumber = textFrom(proposed.part_number, 100);
      if (partNumber) patch.part_number = partNumber;
      const description = textFrom(proposed.description);
      if (description) patch.description = description;

      if (Object.keys(patch).length === 0) {
        throw new Error("The proposal contains no applicable changes.");
      }

      const { data, error } = await supabase
        .from("material_entries")
        .update(patch)
        .eq("id", entryId)
        .select("id")
        .maybeSingle();
      if (error || !data) throw new Error(error?.message ?? "Could not update the part.");
      return data.id;
    }

    case "remove_work_order_material": {
      const entryId = request.entity_id;
      if (!entryId) throw new Error("The proposal has no material line.");

      const { data: existing, error: readError } = await supabase
        .from("material_entries")
        .select("id, inventory_movement_id")
        .eq("id", entryId)
        .maybeSingle();
      if (readError) throw new Error(readError.message);
      if (!existing) throw new Error("The material line no longer exists.");
      if (existing.inventory_movement_id) {
        throw new Error("Warehouse issues must be reversed through inventory.");
      }

      const { error } = await supabase.from("material_entries").delete().eq("id", entryId);
      if (error) throw new Error(error.message);
      return entryId;
    }

    case "update_inventory_item_cost": {
      const itemId = request.entity_id;
      if (!itemId) throw new Error("The proposal has no inventory item.");

      const patch: Record<string, number> = {};
      const averageCost = numberFrom(proposed.average_cost);
      if (averageCost !== null) {
        if (averageCost < 0) throw new Error("The proposal has a negative cost.");
        patch.average_cost = averageCost;
      }
      const sellingPrice = numberFrom(proposed.selling_price);
      if (sellingPrice !== null) {
        if (sellingPrice < 0) throw new Error("The proposal has a negative price.");
        patch.selling_price = sellingPrice;
      }
      if (Object.keys(patch).length === 0) {
        throw new Error("The proposal contains no applicable changes.");
      }

      const { data, error } = await supabase
        .from("inventory_items")
        .update(patch)
        .eq("id", itemId)
        .select("id")
        .maybeSingle();
      if (error || !data) throw new Error(error?.message ?? "Could not update the item.");
      return data.id;
    }

    default: {
      const exhaustive: never = request.action_type;
      throw new Error(`Unsupported action ${String(exhaustive)}.`);
    }
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

  const lookupNumber = request.proposed_part_number ?? request.source_part_number;
  if (!lookupNumber) return null;

  const markStale = async (summary: string, currentValues: Record<string, unknown>, detail: Record<string, unknown>) => {
    await supabase.rpc("mark_change_approval_stale", {
      p_request_id: request.id,
      p_summary: summary.slice(0, 300),
      p_current_values: currentValues,
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
    await markStale(
      `Supplier data could not be re-checked before applying this change. ${message}`,
      request.current_values,
      { reason: "revalidation_failed" },
    );
    return "The supplier data could not be re-checked, so this change needs approving again.";
  }

  if (!fresh) {
    await markStale(
      "The supplier no longer lists this part, so the approved change was not applied.",
      request.current_values,
      { reason: "part_no_longer_listed" },
    );
    return "The supplier no longer lists this part. The change needs approving again.";
  }

  const drift = detectSupplierDrift(request, {
    partNumber: fresh.partNumber,
    dealerCost: fresh.dealerCost,
    currency: fresh.currency,
    supersededBy: fresh.supersededBy,
    stockStatus: fresh.stockStatus,
  });

  if (drift.length > 0) {
    await markStale(
      `Supplier data changed since approval: ${describeDrift(drift)}.`,
      {
        ...request.current_values,
        dealerCost: fresh.dealerCost,
        currency: fresh.currency,
        supersededBy: fresh.supersededBy,
        stockStatus: fresh.stockStatus,
      },
      { reason: "supplier_data_changed", drift },
    );
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

  // The single claim that makes execution happen at most once.
  const { data: claimData, error: claimError } = await supabase.rpc(
    "begin_change_approval_execution",
    { p_request_id: requestId },
  );
  if (claimError) {
    return { status: "error", message: claimError.message };
  }
  const claim = claimData as RpcResult;
  if (!claim?.ok) {
    if (claim?.code === "not_executable") {
      return {
        status: "error",
        message: "This request has already been applied or is no longer approved.",
      };
    }
    return { status: "error", message: "This request could not be applied." };
  }

  try {
    const resultId = await applyChange(supabase, request, actorId);

    // The CRM change has landed. Only now do we tell the accounting system, and
    // we record exactly what it answered rather than assuming success.
    const sync = await getXeroSyncAdapter().sync({
      approvalRequestId: request.id,
      actionType: request.action_type,
      entityId: resultId,
      idempotencyKey: request.idempotency_key,
    });

    await supabase.rpc("complete_change_approval_execution", {
      p_request_id: requestId,
      p_result_entity_id: resultId,
      p_sync_status: sync.status,
      p_sync_error: sync.error,
    });

    logApproval({
      approvalRequestId: requestId,
      action: request.action_type,
      status: "executed",
      actorId,
      entityType: request.entity_type,
      entityId: resultId,
    });
    refreshApprovalViews(request);

    if (sync.status === "failed") {
      return {
        status: "error",
        message:
          "The change was applied in Coastal CRM, but the accounting sync failed. See the request for details.",
      };
    }
    return { status: "success", message: "Approved and applied." };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "The change could not be applied.";
    await supabase.rpc("fail_change_approval_execution", {
      p_request_id: requestId,
      p_error: message,
    });
    logApproval({
      approvalRequestId: requestId,
      action: request.action_type,
      status: "execution_failed",
      actorId,
      detail: message,
    });
    refreshApprovalViews(request);
    return { status: "error", message };
  }
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
  const { user } = await requireUser();
  if (!UUID_RE.test(requestId)) {
    return { status: "error", message: "Invalid request reference." };
  }

  const request = await getApprovalRequest(requestId);
  if (!request) return { status: "error", message: "This request no longer exists." };
  if (request.status !== "executed" || request.external_sync_status !== "failed") {
    return { status: "error", message: "There is no failed sync to retry." };
  }

  const supabase = await createClient();
  const sync = await getXeroSyncAdapter().sync({
    approvalRequestId: request.id,
    actionType: request.action_type,
    entityId: request.result_entity_id,
    idempotencyKey: request.idempotency_key,
  });

  const { error } = await supabase.rpc("record_external_sync_result", {
    p_request_id: requestId,
    p_status: sync.status,
    p_error: sync.error,
  });
  if (error) return { status: "error", message: error.message };

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
