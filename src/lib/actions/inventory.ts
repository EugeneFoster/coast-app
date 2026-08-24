"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireInventoryManager } from "@/lib/auth";
import {
  isInventoryCategory,
  type InventoryActionState,
} from "@/lib/inventory";
import { createClient } from "@/lib/supabase/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function clean(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function nullable(formData: FormData, name: string) {
  return clean(formData, name) || null;
}

function optionalNumber(formData: FormData, name: string) {
  const raw = clean(formData, name);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : Number.NaN;
}

function requiredNumber(formData: FormData, name: string) {
  const raw = clean(formData, name);
  if (!raw) return Number.NaN;
  const value = Number(raw);
  return Number.isFinite(value) ? value : Number.NaN;
}

function validUuid(value: string) {
  return UUID_RE.test(value);
}

function validDate(value: string | null) {
  if (!value) return true;
  if (!DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function revalidateInventory(itemId?: string) {
  revalidatePath("/inventory");
  if (itemId) revalidatePath(`/inventory/items/${itemId}`);
}

function revalidatePurchasing(purchaseOrderId?: string) {
  revalidatePath("/inventory/purchase-orders");
  if (purchaseOrderId) {
    revalidatePath(`/inventory/purchase-orders/${purchaseOrderId}`);
  }
}

function supplierPayload(formData: FormData) {
  return {
    name: clean(formData, "name"),
    account_number: nullable(formData, "account_number"),
    contact_name: nullable(formData, "contact_name"),
    email: nullable(formData, "email"),
    phone: nullable(formData, "phone"),
    website: nullable(formData, "website"),
    address: nullable(formData, "address"),
    notes: nullable(formData, "notes"),
    active: formData.get("active") === "on",
  };
}

function inventoryItemPayload(formData: FormData) {
  return {
    sku: clean(formData, "sku").toUpperCase(),
    name: clean(formData, "name"),
    description: nullable(formData, "description"),
    category: clean(formData, "category"),
    unit: clean(formData, "unit"),
    sellingPrice: optionalNumber(formData, "selling_price"),
    reorderPoint: requiredNumber(formData, "reorder_point"),
    location: nullable(formData, "location"),
    preferredSupplierId: nullable(formData, "preferred_supplier_id"),
    active: formData.get("active") === "on",
  };
}

function validateInventoryItemPayload(
  payload: ReturnType<typeof inventoryItemPayload>,
) {
  if (!payload.sku || !payload.name) return "SKU and item name are required.";
  if (!isInventoryCategory(payload.category)) return "Select a valid category.";
  if (!payload.unit) return "Unit is required.";
  if (
    Number.isNaN(payload.sellingPrice) ||
    (payload.sellingPrice !== null && payload.sellingPrice < 0)
  ) {
    return "Selling price cannot be negative.";
  }
  if (Number.isNaN(payload.reorderPoint) || payload.reorderPoint < 0) {
    return "Reorder point cannot be negative.";
  }
  if (payload.preferredSupplierId && !validUuid(payload.preferredSupplierId)) {
    return "Select a valid supplier.";
  }
  return null;
}

export async function createSupplierAction(
  _previous: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const { user } = await requireInventoryManager();
  const payload = supplierPayload(formData);
  if (!payload.name) return { status: "error", message: "Supplier name is required." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .insert({ ...payload, created_by: user.id })
    .select("id")
    .single();
  if (error || !data) {
    return { status: "error", message: error?.message ?? "Could not create supplier." };
  }
  revalidatePath("/inventory/suppliers");
  redirect(`/inventory/suppliers/${data.id}`);
}

export async function updateSupplierAction(
  supplierId: string,
  _previous: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  await requireInventoryManager();
  if (!validUuid(supplierId)) return { status: "error", message: "Invalid supplier." };
  const payload = supplierPayload(formData);
  if (!payload.name) return { status: "error", message: "Supplier name is required." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .update(payload)
    .eq("id", supplierId)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    return { status: "error", message: error?.message ?? "Supplier not found." };
  }
  revalidatePath("/inventory/suppliers");
  revalidatePath(`/inventory/suppliers/${supplierId}`);
  return { status: "success", message: "Supplier updated." };
}

export async function createInventoryItemAction(
  _previous: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const { user } = await requireInventoryManager();
  const payload = inventoryItemPayload(formData);
  const validationError = validateInventoryItemPayload(payload);
  if (validationError) return { status: "error", message: validationError };

  const supabase = await createClient();
  if (payload.preferredSupplierId) {
    const { data: supplier } = await supabase
      .from("suppliers")
      .select("id")
      .eq("id", payload.preferredSupplierId)
      .eq("active", true)
      .maybeSingle();
    if (!supplier) return { status: "error", message: "Supplier is not active." };
  }
  const { data, error } = await supabase
    .from("inventory_items")
    .insert({
      sku: payload.sku,
      name: payload.name,
      description: payload.description,
      category: payload.category,
      unit: payload.unit,
      selling_price: payload.sellingPrice,
      reorder_point: payload.reorderPoint,
      location: payload.location,
      preferred_supplier_id: payload.preferredSupplierId,
      active: payload.active,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { status: "error", message: error?.message ?? "Could not create item." };
  }
  revalidateInventory(data.id);
  redirect(`/inventory/items/${data.id}`);
}

export async function updateInventoryItemAction(
  itemId: string,
  _previous: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  await requireInventoryManager();
  if (!validUuid(itemId)) return { status: "error", message: "Invalid item." };
  const payload = inventoryItemPayload(formData);
  const validationError = validateInventoryItemPayload(payload);
  if (validationError) return { status: "error", message: validationError };

  const supabase = await createClient();
  if (payload.preferredSupplierId) {
    const { data: supplier } = await supabase
      .from("suppliers")
      .select("id")
      .eq("id", payload.preferredSupplierId)
      .maybeSingle();
    if (!supplier) return { status: "error", message: "Supplier not found." };
  }
  const { data, error } = await supabase
    .from("inventory_items")
    .update({
      sku: payload.sku,
      name: payload.name,
      description: payload.description,
      category: payload.category,
      unit: payload.unit,
      selling_price: payload.sellingPrice,
      reorder_point: payload.reorderPoint,
      location: payload.location,
      preferred_supplier_id: payload.preferredSupplierId,
      active: payload.active,
    })
    .eq("id", itemId)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    return { status: "error", message: error?.message ?? "Item not found." };
  }
  revalidateInventory(itemId);
  return { status: "success", message: "Inventory item updated." };
}

export async function adjustInventoryAction(
  itemId: string,
  _previous: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  await requireInventoryManager();
  if (!validUuid(itemId)) return { status: "error", message: "Invalid item." };
  const direction = clean(formData, "direction");
  const quantity = requiredNumber(formData, "quantity");
  const unitCost = optionalNumber(formData, "unit_cost");
  const note = clean(formData, "note");
  if (direction !== "in" && direction !== "out") {
    return { status: "error", message: "Select an adjustment direction." };
  }
  if (Number.isNaN(quantity) || quantity <= 0) {
    return { status: "error", message: "Quantity must be greater than zero." };
  }
  if (Number.isNaN(unitCost) || (unitCost !== null && unitCost < 0)) {
    return { status: "error", message: "Unit cost cannot be negative." };
  }
  if (!note) return { status: "error", message: "Adjustment reason is required." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("adjust_inventory", {
    p_inventory_item_id: itemId,
    p_direction: direction,
    p_quantity: quantity,
    p_unit_cost: unitCost,
    p_note: note,
  });
  if (error) return { status: "error", message: error.message };
  revalidateInventory(itemId);
  return { status: "success", message: "Stock adjustment recorded." };
}

export async function createPurchaseOrderAction(
  _previous: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const { user } = await requireInventoryManager();
  const supplierId = clean(formData, "supplier_id");
  const orderDate = clean(formData, "order_date");
  const expectedDate = nullable(formData, "expected_date");
  if (!validUuid(supplierId)) return { status: "error", message: "Select a supplier." };
  if (!orderDate || !validDate(orderDate) || !validDate(expectedDate)) {
    return { status: "error", message: "Enter valid order dates." };
  }
  if (expectedDate && expectedDate < orderDate) {
    return { status: "error", message: "Expected date cannot precede order date." };
  }

  const supabase = await createClient();
  const { data: supplier } = await supabase
    .from("suppliers")
    .select("id")
    .eq("id", supplierId)
    .eq("active", true)
    .maybeSingle();
  if (!supplier) return { status: "error", message: "Supplier is not active." };
  const { data, error } = await supabase
    .from("purchase_orders")
    .insert({
      supplier_id: supplierId,
      order_date: orderDate,
      expected_date: expectedDate,
      notes: nullable(formData, "notes"),
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { status: "error", message: error?.message ?? "Could not create purchase order." };
  }
  revalidatePurchasing(data.id);
  redirect(`/inventory/purchase-orders/${data.id}`);
}

export async function addPurchaseOrderItemAction(
  purchaseOrderId: string,
  _previous: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  await requireInventoryManager();
  if (!validUuid(purchaseOrderId)) {
    return { status: "error", message: "Invalid purchase order." };
  }
  const inventoryItemId = clean(formData, "inventory_item_id");
  const quantity = requiredNumber(formData, "quantity");
  const unitCost = requiredNumber(formData, "unit_cost");
  if (!validUuid(inventoryItemId)) return { status: "error", message: "Select an item." };
  if (Number.isNaN(quantity) || quantity <= 0) {
    return { status: "error", message: "Quantity must be greater than zero." };
  }
  if (Number.isNaN(unitCost) || unitCost < 0) {
    return { status: "error", message: "Unit cost cannot be negative." };
  }

  const supabase = await createClient();
  const [{ data: purchaseOrder }, { data: item }] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select("id, status")
      .eq("id", purchaseOrderId)
      .eq("status", "draft")
      .maybeSingle(),
    supabase
      .from("inventory_items")
      .select("id, name, unit")
      .eq("id", inventoryItemId)
      .eq("active", true)
      .maybeSingle(),
  ]);
  if (!purchaseOrder) return { status: "error", message: "Purchase order is not editable." };
  if (!item) return { status: "error", message: "Inventory item is not active." };

  const { error } = await supabase.from("purchase_order_items").insert({
    purchase_order_id: purchaseOrderId,
    inventory_item_id: item.id,
    supplier_sku: nullable(formData, "supplier_sku"),
    description: item.name,
    quantity,
    unit: item.unit,
    unit_cost: unitCost,
  });
  if (error) return { status: "error", message: error.message };
  revalidatePurchasing(purchaseOrderId);
  return { status: "success", message: "Purchase order line added." };
}

export async function deletePurchaseOrderItemAction(
  purchaseOrderId: string,
  lineId: string,
  _formData: FormData,
) {
  void _formData;
  await requireInventoryManager();
  if (!validUuid(purchaseOrderId) || !validUuid(lineId)) return;
  const supabase = await createClient();
  const { error } = await supabase
    .from("purchase_order_items")
    .delete()
    .eq("id", lineId)
    .eq("purchase_order_id", purchaseOrderId);
  if (error) throw new Error(error.message);
  revalidatePurchasing(purchaseOrderId);
}

export async function updatePurchaseOrderStatusAction(
  purchaseOrderId: string,
  nextStatus: "ordered" | "cancelled" | "draft",
  _formData: FormData,
) {
  void _formData;
  await requireInventoryManager();
  if (!validUuid(purchaseOrderId)) return;
  const supabase = await createClient();
  const { error } = await supabase
    .from("purchase_orders")
    .update({ status: nextStatus })
    .eq("id", purchaseOrderId);
  if (error) throw new Error(error.message);
  revalidatePurchasing(purchaseOrderId);
}

export async function receivePurchaseOrderItemAction(
  purchaseOrderId: string,
  lineId: string,
  _previous: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  await requireInventoryManager();
  if (!validUuid(purchaseOrderId) || !validUuid(lineId)) {
    return { status: "error", message: "Invalid purchase order line." };
  }
  const quantity = requiredNumber(formData, "quantity");
  if (Number.isNaN(quantity) || quantity <= 0) {
    return { status: "error", message: "Received quantity must be greater than zero." };
  }

  const supabase = await createClient();
  const { data: line } = await supabase
    .from("purchase_order_items")
    .select("id")
    .eq("id", lineId)
    .eq("purchase_order_id", purchaseOrderId)
    .maybeSingle();
  if (!line) return { status: "error", message: "Purchase order line not found." };
  const { error } = await supabase.rpc("receive_purchase_order_item", {
    p_purchase_order_item_id: lineId,
    p_quantity: quantity,
    p_note: nullable(formData, "note"),
  });
  if (error) return { status: "error", message: error.message };
  revalidateInventory();
  revalidatePurchasing(purchaseOrderId);
  return { status: "success", message: "Inventory receipt recorded." };
}

export async function issueInventoryAction(
  projectId: string,
  workOrderId: string,
  _previous: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  await requireInventoryManager();
  if (!validUuid(projectId) || !validUuid(workOrderId)) {
    return { status: "error", message: "Invalid work order." };
  }
  const inventoryItemId = clean(formData, "inventory_item_id");
  const quantity = requiredNumber(formData, "quantity");
  if (!validUuid(inventoryItemId)) return { status: "error", message: "Select an item." };
  if (Number.isNaN(quantity) || quantity <= 0) {
    return { status: "error", message: "Issue quantity must be greater than zero." };
  }

  const supabase = await createClient();
  const { data: workOrder } = await supabase
    .from("work_orders")
    .select("id")
    .eq("id", workOrderId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!workOrder) return { status: "error", message: "Work order not found." };
  const { error } = await supabase.rpc("issue_inventory_to_work_order", {
    p_inventory_item_id: inventoryItemId,
    p_work_order_id: workOrderId,
    p_quantity: quantity,
    p_note: nullable(formData, "note"),
  });
  if (error) return { status: "error", message: error.message };
  revalidateInventory(inventoryItemId);
  revalidatePath(`/projects/${projectId}/work-orders/${workOrderId}`);
  return { status: "success", message: "Inventory issued to work order." };
}

export async function reverseInventoryIssueAction(
  projectId: string,
  workOrderId: string,
  materialEntryId: string,
  _formData: FormData,
) {
  void _formData;
  await requireInventoryManager();
  if (
    !validUuid(projectId) ||
    !validUuid(workOrderId) ||
    !validUuid(materialEntryId)
  ) return;

  const supabase = await createClient();
  const { data: material } = await supabase
    .from("material_entries")
    .select("id, work_order_id, inventory_item_id")
    .eq("id", materialEntryId)
    .eq("work_order_id", workOrderId)
    .maybeSingle();
  const { data: workOrder } = await supabase
    .from("work_orders")
    .select("id")
    .eq("id", workOrderId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!material || !workOrder || !material.inventory_item_id) return;

  const { error } = await supabase.rpc("reverse_inventory_issue", {
    p_material_entry_id: materialEntryId,
    p_note: "Reversed from work order",
  });
  if (error) throw new Error(error.message);
  revalidateInventory(material.inventory_item_id);
  revalidatePath(`/projects/${projectId}/work-orders/${workOrderId}`);
}
