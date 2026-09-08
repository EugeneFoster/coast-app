import type {
  ChangeApprovalActionType,
  ExternalSyncStatus,
  XeroImpact,
} from "@/lib/types";

/**
 * The accounting-sync seam.
 *
 * The approval gate sits in front of this deliberately: an approved CRM change
 * is applied first, and only then is the accounting system told about it. That
 * ordering is what makes "nothing reaches Xero without a human decision" true
 * by construction rather than by convention.
 *
 * State of play: this repository has no Xero client. `XERO_CLIENT_ID`,
 * `XERO_CLIENT_SECRET` and `XERO_REDIRECT_URI` are provisioned on the
 * deployment, but no OAuth flow, token store or API call exists anywhere in the
 * codebase, so there is nothing to call yet. Rather than pretend otherwise, the
 * seam reports `not_configured`, the UI says so on every approval card, and a
 * change is never recorded as "synced" when it was not.
 *
 * Wiring the real integration means implementing `XeroSyncAdapter` and swapping
 * the export at the bottom of this file. No caller changes.
 */

export interface XeroImpactInput {
  actionType: ChangeApprovalActionType;
  /** Whether the affected part is already linked to an inventory item. */
  hasInventoryItem: boolean;
}

export interface XeroImpactDescription {
  impact: XeroImpact;
  detail: string | null;
}

export interface XeroSyncInput {
  approvalRequestId: string;
  actionType: ChangeApprovalActionType;
  entityId: string | null;
  /**
   * Reused verbatim on a retry so a repeated sync cannot create a second Xero
   * object. Any real implementation must honour it.
   */
  idempotencyKey: string;
}

export interface XeroSyncResult {
  status: ExternalSyncStatus;
  error: string | null;
}

export interface XeroSyncAdapter {
  /** True only when a working, authenticated Xero client is available. */
  readonly available: boolean;
  describeImpact(input: XeroImpactInput): XeroImpactDescription;
  sync(input: XeroSyncInput): Promise<XeroSyncResult>;
}

/**
 * Which CRM changes would reach Xero once the integration exists. Kept here so
 * that connecting Xero later does not require re-deriving this mapping.
 */
const IMPACT_WHEN_CONNECTED: Record<ChangeApprovalActionType, XeroImpact> = {
  // Work-order material lines are internal job costing until they are invoiced,
  // so they do not themselves write to Xero.
  add_work_order_material: "none",
  update_work_order_material_cost: "none",
  replace_superseded_part: "none",
  remove_work_order_material: "none",
  // Inventory items map onto Xero Items, so their costs do reach accounting.
  update_inventory_item_cost: "item_update",
};

class UnconfiguredXeroSyncAdapter implements XeroSyncAdapter {
  readonly available = false;

  describeImpact(input: XeroImpactInput): XeroImpactDescription {
    const wouldAffect = IMPACT_WHEN_CONNECTED[input.actionType];
    if (wouldAffect === "none") {
      return {
        impact: "none",
        detail: "Work order costing only — this does not reach the accounting system.",
      };
    }
    return {
      impact: "not_configured",
      detail:
        "Xero is not connected in this deployment. The change will be applied in Coastal CRM only, and nothing will be sent to Xero.",
    };
  }

  async sync(input: XeroSyncInput): Promise<XeroSyncResult> {
    const wouldAffect = IMPACT_WHEN_CONNECTED[input.actionType];
    // Nothing to do, and — importantly — we do not claim a sync happened.
    return {
      status: wouldAffect === "none" ? "not_required" : "not_required",
      error: null,
    };
  }
}

let adapter: XeroSyncAdapter = new UnconfiguredXeroSyncAdapter();

export function getXeroSyncAdapter(): XeroSyncAdapter {
  return adapter;
}

/** Swap the implementation (used when the real Xero client lands, and in checks). */
export function setXeroSyncAdapter(next: XeroSyncAdapter) {
  adapter = next;
}

export function describeXeroImpact(input: XeroImpactInput): XeroImpactDescription {
  return adapter.describeImpact(input);
}
