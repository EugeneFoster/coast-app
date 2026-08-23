"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSalesManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  isClientType,
  isEstimateItemType,
  isEstimateStatus,
  isLeadSource,
  isOpportunityStatus,
  isServiceCategory,
  type SalesActionState,
} from "@/lib/sales";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function validUuid(value: string) {
  return UUID_RE.test(value);
}

function clientContactPayload(formData: FormData, notesField = "notes") {
  return {
    contact_name: nullable(formData, "contact_name"),
    email: nullable(formData, "email"),
    phone: nullable(formData, "phone"),
    billing_address: nullable(formData, "billing_address"),
    service_address: nullable(formData, "service_address"),
    notes: nullable(formData, notesField),
  };
}

async function isAssignableSalesperson(profileId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", profileId)
    .eq("status", "active")
    .in("role", ["owner", "project_manager", "sales", "draftsperson"])
    .maybeSingle();
  return !!data;
}

async function resolveClient(
  formData: FormData,
  userId: string,
): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const clientId = clean(formData, "client_id");

  if (clientId) {
    if (!validUuid(clientId)) return { error: "Select a valid customer." };
    const { data } = await supabase
      .from("clients")
      .select("id")
      .eq("id", clientId)
      .maybeSingle();
    return data ? { id: data.id } : { error: "Customer was not found." };
  }

  const name = clean(formData, "client_name");
  const typeValue = clean(formData, "client_type") || "individual";
  if (!name) return { error: "Customer or business name is required." };
  if (!isClientType(typeValue)) return { error: "Select a valid customer type." };

  const { data, error } = await supabase
    .from("clients")
    .insert({
      name,
      type: typeValue,
      created_by: userId,
    })
    .select("id")
    .single();

  if (error || !data) return { error: error?.message ?? "Could not create customer." };
  const { error: contactError } = await supabase.from("client_contacts").insert({
    client_id: data.id,
    ...clientContactPayload(formData, "client_notes"),
  });
  if (contactError) {
    await supabase.from("clients").delete().eq("id", data.id);
    return { error: contactError.message };
  }
  return { id: data.id };
}

export async function createClientAction(
  _previous: SalesActionState,
  formData: FormData,
): Promise<SalesActionState> {
  const { user } = await requireSalesManager();
  const name = clean(formData, "name");
  const typeValue = clean(formData, "type") || "individual";
  if (!name) return { status: "error", message: "Customer name is required." };
  if (!isClientType(typeValue)) {
    return { status: "error", message: "Select a valid customer type." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .insert({
      name,
      type: typeValue,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { status: "error", message: error?.message ?? "Could not create customer." };
  }

  const { error: contactError } = await supabase.from("client_contacts").insert({
    client_id: data.id,
    ...clientContactPayload(formData),
  });
  if (contactError) {
    await supabase.from("clients").delete().eq("id", data.id);
    return { status: "error", message: contactError.message };
  }

  revalidatePath("/sales/clients");
  redirect(`/sales/clients/${data.id}`);
}

export async function updateClientAction(
  clientId: string,
  _previous: SalesActionState,
  formData: FormData,
): Promise<SalesActionState> {
  await requireSalesManager();
  if (!validUuid(clientId)) return { status: "error", message: "Invalid customer." };

  const name = clean(formData, "name");
  const typeValue = clean(formData, "type");
  if (!name) return { status: "error", message: "Customer name is required." };
  if (!isClientType(typeValue)) {
    return { status: "error", message: "Select a valid customer type." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("clients")
    .update({
      name,
      type: typeValue,
    })
    .eq("id", clientId);

  if (error) return { status: "error", message: error.message };
  const { error: contactError } = await supabase.from("client_contacts").upsert({
    client_id: clientId,
    ...clientContactPayload(formData),
  });
  if (contactError) return { status: "error", message: contactError.message };
  revalidatePath("/sales");
  revalidatePath("/sales/clients");
  revalidatePath(`/sales/clients/${clientId}`);
  return { status: "success", message: "Customer updated." };
}

export async function createOpportunityAction(
  _previous: SalesActionState,
  formData: FormData,
): Promise<SalesActionState> {
  const { user } = await requireSalesManager();
  const title = clean(formData, "title");
  const sourceValue = clean(formData, "source") || "other";
  const assignedTo = clean(formData, "assigned_to");
  const vesselLength = optionalNumber(formData, "vessel_length_ft");
  const estimatedValue = optionalNumber(formData, "estimated_value");
  const categories = formData
    .getAll("service_categories")
    .map(String)
    .filter(isServiceCategory);

  if (!title) return { status: "error", message: "Opportunity title is required." };
  if (!isLeadSource(sourceValue)) {
    return { status: "error", message: "Select a valid lead source." };
  }
  if (assignedTo && !validUuid(assignedTo)) {
    return { status: "error", message: "Select a valid salesperson." };
  }
  if (assignedTo && !(await isAssignableSalesperson(assignedTo))) {
    return { status: "error", message: "The selected salesperson is not active." };
  }
  if (Number.isNaN(vesselLength) || (vesselLength !== null && vesselLength <= 0)) {
    return { status: "error", message: "Vessel length must be greater than zero." };
  }
  if (Number.isNaN(estimatedValue) || (estimatedValue !== null && estimatedValue < 0)) {
    return { status: "error", message: "Estimated value cannot be negative." };
  }

  const client = await resolveClient(formData, user.id);
  if (!client.id) return { status: "error", message: client.error ?? "Customer is required." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunities")
    .insert({
      client_id: client.id,
      title,
      source: sourceValue,
      description: nullable(formData, "description"),
      service_categories: categories,
      vessel_name: nullable(formData, "vessel_name"),
      vessel_make_model: nullable(formData, "vessel_make_model"),
      vessel_length_ft: vesselLength,
      estimated_value: estimatedValue,
      target_date: nullable(formData, "target_date"),
      assigned_to: assignedTo || user.id,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { status: "error", message: error?.message ?? "Could not create opportunity." };
  }

  revalidatePath("/sales");
  redirect(`/sales/${data.id}`);
}

export async function updateOpportunityAction(
  opportunityId: string,
  _previous: SalesActionState,
  formData: FormData,
): Promise<SalesActionState> {
  await requireSalesManager();
  if (!validUuid(opportunityId)) {
    return { status: "error", message: "Invalid opportunity." };
  }

  const title = clean(formData, "title");
  const statusValue = clean(formData, "status");
  const sourceValue = clean(formData, "source");
  const assignedTo = clean(formData, "assigned_to");
  const vesselLength = optionalNumber(formData, "vessel_length_ft");
  const estimatedValue = optionalNumber(formData, "estimated_value");
  const categories = formData
    .getAll("service_categories")
    .map(String)
    .filter(isServiceCategory);

  if (!title) return { status: "error", message: "Opportunity title is required." };
  if (!isOpportunityStatus(statusValue) || !isLeadSource(sourceValue)) {
    return { status: "error", message: "Invalid sales status or source." };
  }
  if (assignedTo && !validUuid(assignedTo)) {
    return { status: "error", message: "Select a valid salesperson." };
  }
  if (assignedTo && !(await isAssignableSalesperson(assignedTo))) {
    return { status: "error", message: "The selected salesperson is not active." };
  }
  if (Number.isNaN(vesselLength) || (vesselLength !== null && vesselLength <= 0)) {
    return { status: "error", message: "Vessel length must be greater than zero." };
  }
  if (Number.isNaN(estimatedValue) || (estimatedValue !== null && estimatedValue < 0)) {
    return { status: "error", message: "Estimated value cannot be negative." };
  }

  const lostReason = nullable(formData, "lost_reason");
  if (statusValue === "lost" && !lostReason) {
    return { status: "error", message: "Add a reason when an opportunity is lost." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("opportunities")
    .update({
      title,
      status: statusValue,
      source: sourceValue,
      description: nullable(formData, "description"),
      service_categories: categories,
      vessel_name: nullable(formData, "vessel_name"),
      vessel_make_model: nullable(formData, "vessel_make_model"),
      vessel_length_ft: vesselLength,
      estimated_value: estimatedValue,
      target_date: nullable(formData, "target_date"),
      assigned_to: assignedTo || null,
      lost_reason: statusValue === "lost" ? lostReason : null,
    })
    .eq("id", opportunityId);

  if (error) return { status: "error", message: error.message };
  revalidatePath("/sales");
  revalidatePath(`/sales/${opportunityId}`);
  return { status: "success", message: "Opportunity updated." };
}

export async function createEstimateAction(opportunityId: string) {
  const { user } = await requireSalesManager();
  if (!validUuid(opportunityId)) throw new Error("Invalid opportunity.");

  const supabase = await createClient();
  const { data: opportunity } = await supabase
    .from("opportunities")
    .select("id, client_id, title, description, assigned_to, status, project_id")
    .eq("id", opportunityId)
    .single();
  if (!opportunity) throw new Error("Opportunity not found.");
  if (opportunity.project_id) {
    throw new Error("This opportunity has already been converted to a project.");
  }
  if (opportunity.status === "won" || opportunity.status === "lost") {
    throw new Error("Reopen the opportunity before creating another estimate.");
  }

  const { data: estimate, error } = await supabase
    .from("estimates")
    .insert({
      opportunity_id: opportunity.id,
      client_id: opportunity.client_id,
      title: opportunity.title,
      scope: opportunity.description,
      assigned_to: opportunity.assigned_to ?? user.id,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !estimate) throw new Error(error?.message ?? "Could not create estimate.");

  if (opportunity.status === "new" || opportunity.status === "qualified") {
    await supabase
      .from("opportunities")
      .update({ status: "estimating" })
      .eq("id", opportunityId);
  }

  revalidatePath("/sales");
  revalidatePath(`/sales/${opportunityId}`);
  redirect(`/sales/${opportunityId}/estimates/${estimate.id}`);
}

export async function updateEstimateAction(
  opportunityId: string,
  estimateId: string,
  _previous: SalesActionState,
  formData: FormData,
): Promise<SalesActionState> {
  await requireSalesManager();
  if (!validUuid(opportunityId) || !validUuid(estimateId)) {
    return { status: "error", message: "Invalid estimate." };
  }

  const title = clean(formData, "title");
  const taxRate = optionalNumber(formData, "tax_rate_percent");
  const discount = optionalNumber(formData, "discount_amount") ?? 0;
  if (!title) return { status: "error", message: "Estimate title is required." };
  if (taxRate === null || Number.isNaN(taxRate) || taxRate < 0 || taxRate > 100) {
    return { status: "error", message: "Tax rate must be between 0 and 100." };
  }
  if (Number.isNaN(discount) || discount < 0) {
    return { status: "error", message: "Discount cannot be negative." };
  }

  const supabase = await createClient();
  const { data: existingEstimate } = await supabase
    .from("estimates")
    .select("status")
    .eq("id", estimateId)
    .eq("opportunity_id", opportunityId)
    .maybeSingle();
  if (!existingEstimate || existingEstimate.status !== "draft") {
    return {
      status: "error",
      message: "Return the estimate to Draft before editing it.",
    };
  }

  const { error } = await supabase
    .from("estimates")
    .update({
      title,
      scope: nullable(formData, "scope"),
      valid_until: nullable(formData, "valid_until"),
      tax_rate_percent: taxRate,
      discount_amount: discount,
      notes: nullable(formData, "notes"),
      terms: nullable(formData, "terms"),
    })
    .eq("id", estimateId)
    .eq("opportunity_id", opportunityId);

  if (error) return { status: "error", message: error.message };
  revalidatePath(`/sales/${opportunityId}`);
  revalidatePath(`/sales/${opportunityId}/estimates/${estimateId}`);
  return { status: "success", message: "Estimate updated." };
}

export async function addEstimateItemAction(
  opportunityId: string,
  estimateId: string,
  _previous: SalesActionState,
  formData: FormData,
): Promise<SalesActionState> {
  await requireSalesManager();
  if (!validUuid(opportunityId) || !validUuid(estimateId)) {
    return { status: "error", message: "Invalid estimate." };
  }

  const description = clean(formData, "description");
  const itemType = clean(formData, "item_type");
  const quantity = optionalNumber(formData, "quantity");
  const unitPrice = optionalNumber(formData, "unit_price");
  if (!description) return { status: "error", message: "Item description is required." };
  if (!isEstimateItemType(itemType)) {
    return { status: "error", message: "Select a valid item type." };
  }
  if (quantity === null || Number.isNaN(quantity) || quantity <= 0) {
    return { status: "error", message: "Quantity must be greater than zero." };
  }
  if (unitPrice === null || Number.isNaN(unitPrice) || unitPrice < 0) {
    return { status: "error", message: "Unit price cannot be negative." };
  }

  const supabase = await createClient();
  const { data: estimate } = await supabase
    .from("estimates")
    .select("status")
    .eq("id", estimateId)
    .eq("opportunity_id", opportunityId)
    .maybeSingle();
  if (!estimate || estimate.status !== "draft") {
    return { status: "error", message: "Line items can only change while the estimate is a draft." };
  }

  const { data: lastItem } = await supabase
    .from("estimate_items")
    .select("sort_order")
    .eq("estimate_id", estimateId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("estimate_items").insert({
    estimate_id: estimateId,
    item_type: itemType,
    description,
    quantity,
    unit: clean(formData, "unit") || "ea",
    unit_price: unitPrice,
    sort_order: (lastItem?.sort_order ?? -1) + 1,
  });
  if (error) return { status: "error", message: error.message };

  revalidatePath(`/sales/${opportunityId}`);
  revalidatePath(`/sales/${opportunityId}/estimates/${estimateId}`);
  return { status: "success", message: "Line item added." };
}

export async function deleteEstimateItemAction(
  opportunityId: string,
  estimateId: string,
  itemId: string,
) {
  await requireSalesManager();
  if (![opportunityId, estimateId, itemId].every(validUuid)) {
    throw new Error("Invalid estimate item.");
  }
  const supabase = await createClient();
  const { data: estimate } = await supabase
    .from("estimates")
    .select("status")
    .eq("id", estimateId)
    .eq("opportunity_id", opportunityId)
    .maybeSingle();
  if (!estimate || estimate.status !== "draft") {
    throw new Error("Line items can only change while the estimate is a draft.");
  }
  const { error } = await supabase
    .from("estimate_items")
    .delete()
    .eq("id", itemId)
    .eq("estimate_id", estimateId);
  if (error) throw new Error(error.message);
  revalidatePath(`/sales/${opportunityId}`);
  revalidatePath(`/sales/${opportunityId}/estimates/${estimateId}`);
}

export async function updateEstimateStatusAction(
  opportunityId: string,
  estimateId: string,
  nextStatus: string,
) {
  await requireSalesManager();
  if (!validUuid(opportunityId) || !validUuid(estimateId) || !isEstimateStatus(nextStatus)) {
    throw new Error("Invalid estimate status.");
  }

  const supabase = await createClient();
  const { data: estimate } = await supabase
    .from("estimates")
    .select("status")
    .eq("id", estimateId)
    .eq("opportunity_id", opportunityId)
    .maybeSingle();
  if (!estimate) throw new Error("Estimate not found.");

  const allowedTransitions: Record<string, string[]> = {
    draft: ["sent"],
    sent: ["draft", "accepted", "declined", "expired"],
    accepted: [],
    declined: ["draft"],
    expired: ["draft"],
  };
  if (!allowedTransitions[estimate.status]?.includes(nextStatus)) {
    throw new Error(`Estimate cannot move from ${estimate.status} to ${nextStatus}.`);
  }

  const { error } = await supabase
    .from("estimates")
    .update({
      status: nextStatus,
      accepted_at: nextStatus === "accepted" ? new Date().toISOString() : null,
    })
    .eq("id", estimateId)
    .eq("opportunity_id", opportunityId);
  if (error) throw new Error(error.message);

  if (nextStatus === "sent" || nextStatus === "accepted") {
    await supabase
      .from("opportunities")
      .update({ status: "quoted" })
      .eq("id", opportunityId)
      .neq("status", "won");
  }

  revalidatePath("/sales");
  revalidatePath(`/sales/${opportunityId}`);
  revalidatePath(`/sales/${opportunityId}/estimates/${estimateId}`);
}

export async function convertEstimateToProjectAction(
  opportunityId: string,
  estimateId: string,
) {
  await requireSalesManager();
  if (!validUuid(opportunityId) || !validUuid(estimateId)) {
    throw new Error("Invalid estimate.");
  }

  const supabase = await createClient();
  const { data: estimate } = await supabase
    .from("estimates")
    .select("id")
    .eq("id", estimateId)
    .eq("opportunity_id", opportunityId)
    .maybeSingle();
  if (!estimate) throw new Error("Estimate not found.");

  const { data, error } = await supabase.rpc("convert_opportunity_to_project", {
    p_estimate_id: estimateId,
  });
  if (error || !data) throw new Error(error?.message ?? "Could not create project.");

  revalidatePath("/sales");
  revalidatePath(`/sales/${opportunityId}`);
  revalidatePath("/projects");
  redirect(`/projects/${data}`);
}
