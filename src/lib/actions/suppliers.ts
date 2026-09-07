"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { APPROVAL_ACTION_LABELS, formatCad, type ApprovalActionState } from "@/lib/approvals";
import { requireUser } from "@/lib/auth";
import { canProposeSupplierChange } from "@/lib/employee-roles";
import { normalizePartNumber, partNumbersMatch } from "@/lib/suppliers/normalize";
import { searchSuppliers } from "@/lib/suppliers/search";
import { isSupplierId, type SupplierId, type SupplierPartResult } from "@/lib/suppliers/types";
import { createClient } from "@/lib/supabase/server";
import type { ChangeApprovalActionType } from "@/lib/types";
import { describeXeroImpact } from "@/lib/xero/sync";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Actions a supplier search result may raise. */
const PROPOSABLE_ACTIONS = new Set<ChangeApprovalActionType>([
  "add_work_order_material",
  "update_work_order_material_cost",
  "replace_superseded_part",
]);

export interface ProposeSupplierChangeInput {
  actionType: ChangeApprovalActionType;
  supplier: string;
  /** The number the user acted on, as shown in the result card. */
  partNumber: string;
  workOrderId?: string;
  materialEntryId?: string;
  quantity?: number;
}

/**
 * Look the part up again server-side rather than trusting the browser.
 *
 * The cache means this normally answers from the very data the user was
 * looking at, without another portal round-trip — but the price that ends up in
 * the approval request always comes from the supplier layer, never from the
 * request body. A tampered form cannot propose an invented cost.
 */
async function resolveSupplierResult(
  supplier: SupplierId,
  partNumber: string,
): Promise<{ result: SupplierPartResult | null; message: string | null }> {
  const response = await searchSuppliers({ query: partNumber, suppliers: [supplier] });
  const outcome = response.outcomes[0];
  if (!outcome) return { result: null, message: "This supplier is unavailable." };

  if (outcome.results.length === 0) {
    return {
      result: null,
      message: outcome.message ?? "The supplier no longer lists this part.",
    };
  }

  const normalized = normalizePartNumber(partNumber);
  const match =
    outcome.results.find((entry) => partNumbersMatch(entry.partNumber, normalized)) ??
    outcome.results.find((entry) => entry.supersededBy) ??
    outcome.results[0];

  return { result: match, message: null };
}

function buildIdempotencyKey(parts: unknown[]) {
  return createHash("sha256").update(parts.map((part) => String(part ?? "")).join("|")).digest("hex").slice(0, 40);
}

/**
 * Turn a supplier search result into a pending approval request.
 *
 * This is the only bridge from "read-only lookup" to "something might change",
 * and it never changes anything itself: it records a proposal and notifies the
 * approvers.
 */
export async function proposeSupplierChangeAction(
  input: ProposeSupplierChangeInput,
): Promise<ApprovalActionState> {
  const { user, profile } = await requireUser();

  if (!canProposeSupplierChange(profile.role)) {
    return { status: "error", message: "Your role cannot propose supplier changes." };
  }
  if (!PROPOSABLE_ACTIONS.has(input.actionType)) {
    return { status: "error", message: "Unsupported action." };
  }
  if (!isSupplierId(input.supplier)) {
    return { status: "error", message: "Unknown supplier." };
  }

  const partNumber = normalizePartNumber(String(input.partNumber ?? ""));
  if (partNumber.length < 2 || partNumber.length > 64) {
    return { status: "error", message: "Enter a valid part number." };
  }

  const supabase = await createClient();

  // --- resolve the target -------------------------------------------------
  let workOrderId: string | null = null;
  let materialEntryId: string | null = null;
  let currentValues: Record<string, unknown> = {};

  if (input.actionType === "add_work_order_material") {
    workOrderId = input.workOrderId ?? null;
    if (!workOrderId || !UUID_RE.test(workOrderId)) {
      return { status: "error", message: "Invalid work order reference." };
    }
    const { data: workOrder } = await supabase
      .from("work_orders")
      .select("id")
      .eq("id", workOrderId)
      .maybeSingle();
    if (!workOrder) {
      return { status: "error", message: "Work order not found or access denied." };
    }
  } else {
    materialEntryId = input.materialEntryId ?? null;
    if (!materialEntryId || !UUID_RE.test(materialEntryId)) {
      return { status: "error", message: "Invalid material line reference." };
    }
    const { data: entry } = await supabase
      .from("material_entries")
      .select("id, work_order_id, description, part_number, quantity, unit, unit_cost, inventory_movement_id")
      .eq("id", materialEntryId)
      .maybeSingle();
    if (!entry) {
      return { status: "error", message: "Material line not found or access denied." };
    }
    if (entry.inventory_movement_id) {
      return {
        status: "error",
        message: "This line came from a warehouse issue and must be changed through inventory.",
      };
    }
    workOrderId = entry.work_order_id;
    currentValues = {
      description: entry.description,
      part_number: entry.part_number,
      quantity: Number(entry.quantity),
      unit: entry.unit,
      unit_cost: Number(entry.unit_cost),
    };
  }

  // --- server-side supplier lookup ----------------------------------------
  const { result, message } = await resolveSupplierResult(input.supplier, partNumber);
  if (!result) {
    return { status: "error", message: message ?? "The supplier data could not be read." };
  }
  if (result.dealerCost === null && input.actionType !== "replace_superseded_part") {
    return {
      status: "error",
      message: "This supplier did not publish a cost for that part, so it cannot be proposed.",
    };
  }

  // --- build the proposal --------------------------------------------------
  const quantity =
    Number.isFinite(input.quantity) && (input.quantity ?? 0) > 0 ? Number(input.quantity) : 1;

  const proposedChanges: Record<string, unknown> = {};
  let summary: string;

  if (input.actionType === "add_work_order_material") {
    proposedChanges.description = result.description ?? `Part ${result.partNumber}`;
    proposedChanges.part_number = result.partNumber;
    proposedChanges.quantity = quantity;
    proposedChanges.unit = "ea";
    proposedChanges.unit_cost = result.dealerCost ?? 0;
    summary = `Add ${result.partNumber} (${result.supplierName}) to the work order at ${formatCad(result.dealerCost ?? 0)}`;
  } else if (input.actionType === "update_work_order_material_cost") {
    if (result.dealerCost === null) {
      return { status: "error", message: "The supplier did not publish a cost." };
    }
    proposedChanges.unit_cost = result.dealerCost;
    summary = `Update ${currentValues.part_number ?? result.partNumber} cost ${formatCad(
      Number(currentValues.unit_cost ?? 0),
    )} → ${formatCad(result.dealerCost)} (${result.supplierName})`;
  } else {
    if (!result.supersededBy) {
      return { status: "error", message: "The supplier does not report a replacement number." };
    }
    proposedChanges.part_number = result.supersededBy;
    if (result.description) proposedChanges.description = result.description;
    if (result.dealerCost !== null) proposedChanges.unit_cost = result.dealerCost;
    summary = `Replace ${result.searchedPartNumber} with ${result.supersededBy} (${result.supplierName})`;
  }

  currentValues = {
    ...currentValues,
    supplierName: result.supplierName,
    dealerCost: result.dealerCost,
    listPrice: result.listPrice,
    currency: result.currency,
    stockStatus: result.stockStatus,
    supersededBy: result.supersededBy,
    productUrl: result.productUrl,
  };

  const impact = describeXeroImpact({
    actionType: input.actionType,
    hasInventoryItem: false,
  });

  // --- do not stack duplicate proposals -----------------------------------
  const targetId = materialEntryId ?? workOrderId;
  const { data: existing } = await supabase
    .from("change_approval_requests")
    .select("id")
    .eq("action_type", input.actionType)
    .eq("supplier", input.supplier)
    .eq("proposed_part_number", String(proposedChanges.part_number ?? result.partNumber))
    .in("status", ["pending_approval", "stale_requires_reapproval", "approved", "executing"])
    .or(
      materialEntryId
        ? `entity_id.eq.${materialEntryId}`
        : `parent_entity_id.eq.${workOrderId}`,
    )
    .limit(1)
    .maybeSingle();

  if (existing) {
    return {
      status: "success",
      message: "This change is already waiting for approval.",
    };
  }

  const idempotencyKey = buildIdempotencyKey([
    input.actionType,
    targetId,
    input.supplier,
    proposedChanges.part_number ?? result.partNumber,
    proposedChanges.unit_cost,
    // Coarse bucket so a double submit collapses, while a deliberate later
    // proposal is treated as new.
    Math.floor(Date.now() / 120_000),
  ]);

  const { error } = await supabase.rpc("create_change_approval_request", {
    p_action_type: input.actionType,
    p_entity_type: "material_entry",
    p_entity_id: materialEntryId,
    p_parent_entity_id: workOrderId,
    p_supplier: input.supplier,
    p_source_part_number: result.searchedPartNumber,
    p_proposed_part_number: String(proposedChanges.part_number ?? result.partNumber),
    p_summary: summary.slice(0, 300),
    p_proposed_changes: proposedChanges,
    p_current_values: currentValues,
    p_xero_impact: impact.impact,
    p_xero_impact_detail: impact.detail,
    p_supplier_checked_at: result.checkedAt,
    p_idempotency_key: idempotencyKey,
  });

  if (error) {
    return { status: "error", message: error.message };
  }

  revalidatePath("/approvals");
  if (workOrderId) revalidatePath("/projects", "layout");

  void user;
  return {
    status: "success",
    message: `${APPROVAL_ACTION_LABELS[input.actionType]} sent for approval. Nothing has changed yet.`,
  };
}
