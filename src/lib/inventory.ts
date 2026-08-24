import type {
  InventoryCategory,
  InventoryMovementType,
  PurchaseOrderStatus,
} from "@/lib/types";

export type InventoryActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const INITIAL_INVENTORY_ACTION_STATE: InventoryActionState = {
  status: "idle",
  message: "",
};

export const INVENTORY_CATEGORIES: Array<{
  value: InventoryCategory;
  label: string;
}> = [
  { value: "aluminum", label: "Aluminum" },
  { value: "steel", label: "Steel" },
  { value: "fastener", label: "Fasteners" },
  { value: "paint", label: "Paint & coatings" },
  { value: "mechanical", label: "Mechanical" },
  { value: "electrical", label: "Electrical" },
  { value: "dock", label: "Dock hardware" },
  { value: "consumable", label: "Consumables" },
  { value: "safety", label: "Safety" },
  { value: "part", label: "Parts" },
  { value: "other", label: "Other" },
];

export const PURCHASE_ORDER_STATUSES: Array<{
  value: PurchaseOrderStatus;
  label: string;
}> = [
  { value: "draft", label: "Draft" },
  { value: "ordered", label: "Ordered" },
  { value: "partially_received", label: "Partially received" },
  { value: "received", label: "Received" },
  { value: "cancelled", label: "Cancelled" },
];

const inventoryCategoryValues = new Set(
  INVENTORY_CATEGORIES.map(({ value }) => value),
);
const purchaseOrderStatusValues = new Set(
  PURCHASE_ORDER_STATUSES.map(({ value }) => value),
);

export function isInventoryCategory(value: string): value is InventoryCategory {
  return inventoryCategoryValues.has(value as InventoryCategory);
}

export function isPurchaseOrderStatus(
  value: string,
): value is PurchaseOrderStatus {
  return purchaseOrderStatusValues.has(value as PurchaseOrderStatus);
}

export function inventoryCategoryLabel(category: InventoryCategory) {
  return INVENTORY_CATEGORIES.find(({ value }) => value === category)?.label ?? category;
}

export function purchaseOrderStatusLabel(status: PurchaseOrderStatus) {
  return PURCHASE_ORDER_STATUSES.find(({ value }) => value === status)?.label ?? status;
}

export function inventoryMovementLabel(type: InventoryMovementType) {
  const labels: Record<InventoryMovementType, string> = {
    receipt: "Received",
    issue: "Issued",
    adjustment_in: "Adjustment in",
    adjustment_out: "Adjustment out",
    return_from_project: "Returned from project",
  };
  return labels[type];
}

export function inventoryMovementSign(type: InventoryMovementType) {
  return type === "issue" || type === "adjustment_out" ? -1 : 1;
}

export function formatQuantity(value: number | string, unit?: string) {
  const amount = new Intl.NumberFormat("en-CA", {
    maximumFractionDigits: 3,
  }).format(Number(value));
  return unit ? `${amount} ${unit}` : amount;
}
