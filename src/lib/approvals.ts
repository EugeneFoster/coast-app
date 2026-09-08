import type {
  ChangeApprovalActionType,
  ChangeApprovalRequest,
  ChangeApprovalStatus,
  ExternalSyncStatus,
  XeroImpact,
} from "@/lib/types";

export type ApprovalActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const INITIAL_APPROVAL_ACTION_STATE: ApprovalActionState = {
  status: "idle",
  message: "",
};

export const APPROVAL_ACTION_LABELS: Record<ChangeApprovalActionType, string> = {
  add_work_order_material: "Add part to work order",
  update_work_order_material_cost: "Update part cost",
  replace_superseded_part: "Apply superseded part number",
  remove_work_order_material: "Remove part from work order",
  update_inventory_item_cost: "Update inventory item cost",
};

export const APPROVAL_STATUS_LABELS: Record<ChangeApprovalStatus, string> = {
  pending_approval: "Awaiting approval",
  approved: "Approved",
  rejected: "Rejected",
  expired: "Expired",
  executing: "Applying",
  executed: "Applied",
  failed: "Failed",
  stale_requires_reapproval: "Re-approval required",
};

export const XERO_IMPACT_LABELS: Record<XeroImpact, string> = {
  none: "This change does not affect Xero.",
  not_configured: "Xero is not connected, so nothing will be sent to it.",
  item_create: "A new Item will be created in Xero after approval.",
  item_update: "An existing Item will be updated in Xero after approval.",
  invoice_line_update: "An invoice line price will change in Xero after approval.",
  unknown: "The effect on Xero could not be determined.",
};

export const EXTERNAL_SYNC_LABELS: Record<ExternalSyncStatus, string> = {
  not_required: "No accounting sync needed",
  pending: "Accounting sync pending",
  synced: "Synced to Xero",
  failed: "Xero sync failed",
};

/** Statuses a user can still act on. */
export const DECIDABLE_STATUSES: ChangeApprovalStatus[] = [
  "pending_approval",
  "stale_requires_reapproval",
];

export function isDecidable(request: Pick<ChangeApprovalRequest, "status">) {
  return DECIDABLE_STATUSES.includes(request.status);
}

export type ApprovalFilter = "pending" | "approved" | "rejected" | "failed" | "all";

export const APPROVAL_FILTERS: Array<{ value: ApprovalFilter; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "failed", label: "Failed" },
  { value: "all", label: "All" },
];

const FILTER_STATUSES: Record<ApprovalFilter, ChangeApprovalStatus[] | null> = {
  pending: ["pending_approval", "stale_requires_reapproval"],
  approved: ["approved", "executing", "executed"],
  rejected: ["rejected", "expired"],
  failed: ["failed"],
  all: null,
};

export function statusesForFilter(filter: ApprovalFilter) {
  return FILTER_STATUSES[filter];
}

export function isApprovalFilter(value: string): value is ApprovalFilter {
  return APPROVAL_FILTERS.some(({ value: candidate }) => candidate === value);
}

/**
 * Fields that carry a real business meaning in a proposal, in the order they
 * should be shown. Anything outside this list is ignored by the diff so an
 * adapter cannot smuggle an unexpected key into the approval card.
 */
const DIFF_FIELDS: Array<{ key: string; label: string; kind: "money" | "text" | "number" }> = [
  { key: "part_number", label: "Part number", kind: "text" },
  { key: "description", label: "Description", kind: "text" },
  { key: "quantity", label: "Quantity", kind: "number" },
  { key: "unit", label: "Unit", kind: "text" },
  { key: "unit_cost", label: "Unit cost", kind: "money" },
  { key: "average_cost", label: "Average cost", kind: "money" },
  { key: "selling_price", label: "Selling price", kind: "money" },
];

export interface ApprovalDiffRow {
  key: string;
  label: string;
  before: string | null;
  after: string | null;
  /** Positive when the proposal increases a cost, negative when it lowers it. */
  delta: number | null;
}

function formatValue(value: unknown, kind: "money" | "text" | "number"): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (kind === "money") {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
    }).format(numeric);
  }
  if (kind === "number") {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return String(value);
    return new Intl.NumberFormat("en-CA", { maximumFractionDigits: 3 }).format(numeric);
  }
  return String(value);
}

/**
 * Build the before/after rows shown on the approval card. Only fields the
 * proposal actually mentions appear, and a row is dropped when nothing changes.
 */
export function buildApprovalDiff(
  request: Pick<ChangeApprovalRequest, "proposed_changes" | "current_values">,
): ApprovalDiffRow[] {
  const rows: ApprovalDiffRow[] = [];

  for (const field of DIFF_FIELDS) {
    if (!(field.key in request.proposed_changes)) continue;

    const rawBefore = request.current_values[field.key];
    const rawAfter = request.proposed_changes[field.key];
    const before = formatValue(rawBefore, field.kind);
    const after = formatValue(rawAfter, field.kind);
    if (before === after) continue;

    let delta: number | null = null;
    if (field.kind === "money") {
      const beforeNumber = Number(rawBefore);
      const afterNumber = Number(rawAfter);
      if (Number.isFinite(beforeNumber) && Number.isFinite(afterNumber)) {
        delta = afterNumber - beforeNumber;
      }
    }

    rows.push({ key: field.key, label: field.label, before, after, delta });
  }

  return rows;
}

export function formatCad(value: number) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(value);
}

/** "2 minutes ago" style freshness label for supplier data. */
export function formatCheckedAt(iso: string | null): string {
  if (!iso) return "Supplier data age unknown";
  const checked = new Date(iso);
  if (Number.isNaN(checked.valueOf())) return "Supplier data age unknown";

  const seconds = Math.max(0, Math.round((Date.now() - checked.valueOf()) / 1000));
  if (seconds < 60) return `Checked ${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `Checked ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Checked ${hours} h ago`;
  return `Checked ${checked.toLocaleDateString("en-CA")}`;
}

/**
 * How old supplier data may be before an approved change must be re-verified
 * against the portal. Approving a five-minute-old price and applying a
 * different one is the failure this guards against.
 */
export const SUPPLIER_DATA_MAX_AGE_MS = 5 * 60 * 1000;

export function isSupplierDataStale(checkedAt: string | null, now = Date.now()): boolean {
  if (!checkedAt) return true;
  const checked = Date.parse(checkedAt);
  if (Number.isNaN(checked)) return true;
  return now - checked > SUPPLIER_DATA_MAX_AGE_MS;
}

/** Fields whose drift invalidates a decision the approver already made. */
export interface SupplierDrift {
  field: string;
  label: string;
  before: string | null;
  after: string | null;
}

/** Money is equal when it rounds to the same cent. */
function moneyChanged(before: unknown, after: unknown): boolean {
  const a = Number(before);
  const b = Number(after);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return before !== after;
  return Math.abs(a - b) > 0.005;
}

/**
 * Compare what the approver agreed to against what the supplier says now.
 *
 * Only materially significant fields count — price, currency, the part number
 * itself, a new supersession, and whether the part is still obtainable. A
 * changed description or a shifted warehouse does not invalidate a decision.
 */
export function detectSupplierDrift(
  request: Pick<
    ChangeApprovalRequest,
    "proposed_changes" | "proposed_part_number" | "current_values"
  >,
  fresh: {
    partNumber: string;
    dealerCost: number | null;
    currency: string | null;
    supersededBy: string | null;
    stockStatus: string;
  },
): SupplierDrift[] {
  const drift: SupplierDrift[] = [];

  const agreedCost = request.proposed_changes.unit_cost ?? request.proposed_changes.average_cost;
  if (agreedCost !== undefined && agreedCost !== null && fresh.dealerCost !== null) {
    if (moneyChanged(agreedCost, fresh.dealerCost)) {
      drift.push({
        field: "unit_cost",
        label: "Cost",
        before: formatCad(Number(agreedCost)),
        after: formatCad(fresh.dealerCost),
      });
    }
  }

  if (request.proposed_part_number && request.proposed_part_number !== fresh.partNumber) {
    drift.push({
      field: "part_number",
      label: "Part number",
      before: request.proposed_part_number,
      after: fresh.partNumber,
    });
  }

  const agreedSupersession = request.current_values.supersededBy;
  if (
    fresh.supersededBy &&
    fresh.supersededBy !== request.proposed_part_number &&
    fresh.supersededBy !== agreedSupersession
  ) {
    drift.push({
      field: "superseded_by",
      label: "Superseded by",
      before: typeof agreedSupersession === "string" ? agreedSupersession : null,
      after: fresh.supersededBy,
    });
  }

  const agreedCurrency = request.current_values.currency;
  if (
    typeof agreedCurrency === "string" &&
    fresh.currency &&
    agreedCurrency !== fresh.currency
  ) {
    drift.push({
      field: "currency",
      label: "Currency",
      before: agreedCurrency,
      after: fresh.currency,
    });
  }

  // Availability only counts as drift when the part became unobtainable.
  if (fresh.stockStatus === "out_of_stock" || fresh.stockStatus === "discontinued") {
    const agreedStock = request.current_values.stockStatus;
    if (agreedStock !== fresh.stockStatus) {
      drift.push({
        field: "stock_status",
        label: "Availability",
        before: typeof agreedStock === "string" ? agreedStock : null,
        after: fresh.stockStatus,
      });
    }
  }

  return drift;
}

export function describeDrift(drift: SupplierDrift[]): string {
  return drift
    .map((entry) => `${entry.label} ${entry.before ?? "—"} → ${entry.after ?? "—"}`)
    .join("; ");
}
