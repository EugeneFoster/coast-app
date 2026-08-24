"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  isInvoicePaymentMethod,
  isInvoicePaymentType,
  isInvoiceStatus,
  type BillingActionState,
} from "@/lib/billing";
import {
  requireBillingManager,
  requireProfitabilityViewer,
} from "@/lib/auth";
import { canManageProjectFinancials } from "@/lib/employee-roles";
import { isEstimateItemType } from "@/lib/sales";
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

function requiredNumber(formData: FormData, name: string) {
  const raw = clean(formData, name);
  if (!raw) return Number.NaN;
  const value = Number(raw);
  return Number.isFinite(value) ? value : Number.NaN;
}

function validUuid(value: string | null) {
  return Boolean(value && UUID_RE.test(value));
}

function validDate(value: string | null) {
  if (!value) return true;
  if (!DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function invoicePayload(formData: FormData) {
  return {
    title: clean(formData, "title"),
    issueDate: clean(formData, "issue_date"),
    dueDate: nullable(formData, "due_date"),
    notes: nullable(formData, "notes"),
    terms: nullable(formData, "terms"),
    taxRate: requiredNumber(formData, "tax_rate_percent"),
    discount: requiredNumber(formData, "discount_amount"),
  };
}

function validateInvoicePayload(payload: ReturnType<typeof invoicePayload>) {
  if (!payload.title) return "Invoice title is required.";
  if (!validDate(payload.issueDate) || !payload.issueDate) {
    return "Select a valid issue date.";
  }
  if (!validDate(payload.dueDate)) return "Select a valid due date.";
  if (payload.dueDate && payload.dueDate < payload.issueDate) {
    return "Due date cannot be before the issue date.";
  }
  if (Number.isNaN(payload.taxRate) || payload.taxRate < 0 || payload.taxRate > 100) {
    return "Tax rate must be between 0 and 100%.";
  }
  if (Number.isNaN(payload.discount) || payload.discount < 0) {
    return "Discount cannot be negative.";
  }
  return null;
}

function revalidateBilling(invoiceId?: string, projectId?: string | null) {
  revalidatePath("/billing");
  if (invoiceId) revalidatePath(`/billing/${invoiceId}`);
  if (projectId) revalidatePath(`/billing/projects/${projectId}`);
}

export async function createInvoiceAction(
  _previous: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const { user } = await requireBillingManager();
  const clientId = clean(formData, "client_id");
  const projectId = nullable(formData, "project_id");
  const payload = invoicePayload(formData);
  const validationError = validateInvoicePayload(payload);
  if (validationError) return { status: "error", message: validationError };
  if (!validUuid(clientId)) return { status: "error", message: "Select a customer." };
  if (projectId && !validUuid(projectId)) {
    return { status: "error", message: "Select a valid project." };
  }

  const supabase = await createClient();
  const { data: customer } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .maybeSingle();
  if (!customer) return { status: "error", message: "Customer not found." };

  if (projectId) {
    const { data: project } = await supabase
      .from("projects")
      .select("id, client_id")
      .eq("id", projectId)
      .maybeSingle();
    if (!project || project.client_id !== clientId) {
      return {
        status: "error",
        message: "Selected project does not belong to this customer.",
      };
    }
  }

  const { data, error } = await supabase
    .from("invoices")
    .insert({
      client_id: clientId,
      project_id: projectId,
      title: payload.title,
      issue_date: payload.issueDate,
      due_date: payload.dueDate,
      notes: payload.notes,
      terms: payload.terms,
      tax_rate_percent: payload.taxRate,
      discount_amount: 0,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { status: "error", message: error?.message ?? "Could not create invoice." };
  }
  revalidateBilling(data.id, projectId);
  redirect(`/billing/${data.id}`);
}

export async function createInvoiceFromEstimateAction(
  _previous: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  await requireBillingManager();
  const estimateId = clean(formData, "estimate_id");
  const issueDate = clean(formData, "issue_date");
  const dueDate = nullable(formData, "due_date");
  if (!validUuid(estimateId)) {
    return { status: "error", message: "Select an accepted estimate." };
  }
  if (!validDate(issueDate) || !issueDate || !validDate(dueDate)) {
    return { status: "error", message: "Select valid invoice dates." };
  }
  if (dueDate && dueDate < issueDate) {
    return { status: "error", message: "Due date cannot be before the issue date." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_invoice_from_estimate", {
    p_estimate_id: estimateId,
    p_issue_date: issueDate,
    p_due_date: dueDate,
  });
  if (error || !data) {
    return {
      status: "error",
      message: error?.message ?? "Could not create invoice from estimate.",
    };
  }
  revalidateBilling(data);
  redirect(`/billing/${data}`);
}

export async function updateInvoiceAction(
  invoiceId: string,
  _previous: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  await requireBillingManager();
  if (!validUuid(invoiceId)) return { status: "error", message: "Invalid invoice." };
  const payload = invoicePayload(formData);
  const validationError = validateInvoicePayload(payload);
  if (validationError) return { status: "error", message: validationError };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices")
    .update({
      title: payload.title,
      issue_date: payload.issueDate,
      due_date: payload.dueDate,
      notes: payload.notes,
      terms: payload.terms,
      tax_rate_percent: payload.taxRate,
      discount_amount: payload.discount,
    })
    .eq("id", invoiceId)
    .eq("status", "draft")
    .select("id, project_id")
    .maybeSingle();
  if (error || !data) {
    return {
      status: "error",
      message: error?.message ?? "Draft invoice not found.",
    };
  }
  revalidateBilling(invoiceId, data.project_id);
  return { status: "success", message: "Invoice details saved." };
}

export async function addInvoiceItemAction(
  invoiceId: string,
  _previous: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  await requireBillingManager();
  if (!validUuid(invoiceId)) return { status: "error", message: "Invalid invoice." };
  const itemType = clean(formData, "item_type");
  const description = clean(formData, "description");
  const quantity = requiredNumber(formData, "quantity");
  const unit = clean(formData, "unit");
  const unitPrice = requiredNumber(formData, "unit_price");
  if (!isEstimateItemType(itemType)) {
    return { status: "error", message: "Select a valid line type." };
  }
  if (!description || !unit) {
    return { status: "error", message: "Description and unit are required." };
  }
  if (Number.isNaN(quantity) || quantity <= 0) {
    return { status: "error", message: "Quantity must be greater than zero." };
  }
  if (Number.isNaN(unitPrice) || unitPrice < 0) {
    return { status: "error", message: "Unit price cannot be negative." };
  }

  const supabase = await createClient();
  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, status, project_id")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!invoice || invoice.status !== "draft") {
    return { status: "error", message: "Invoice lines can only change in Draft." };
  }
  const { data: lastLine } = await supabase
    .from("invoice_items")
    .select("sort_order")
    .eq("invoice_id", invoiceId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase.from("invoice_items").insert({
    invoice_id: invoiceId,
    item_type: itemType,
    description,
    quantity,
    unit,
    unit_price: unitPrice,
    sort_order: Number(lastLine?.sort_order ?? -1) + 1,
  });
  if (error) return { status: "error", message: error.message };
  revalidateBilling(invoiceId, invoice.project_id);
  return { status: "success", message: "Invoice line added." };
}

export async function deleteInvoiceItemAction(invoiceId: string, itemId: string) {
  await requireBillingManager();
  if (!validUuid(invoiceId) || !validUuid(itemId)) throw new Error("Invalid invoice line.");
  const supabase = await createClient();
  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, status, project_id")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!invoice || invoice.status !== "draft") {
    throw new Error("Invoice lines can only change in Draft.");
  }
  const { error } = await supabase
    .from("invoice_items")
    .delete()
    .eq("id", itemId)
    .eq("invoice_id", invoiceId);
  if (error) throw new Error(error.message);
  revalidateBilling(invoiceId, invoice.project_id);
}

export async function updateInvoiceStatusAction(
  invoiceId: string,
  nextStatus: string,
) {
  await requireBillingManager();
  if (!validUuid(invoiceId) || !isInvoiceStatus(nextStatus)) {
    throw new Error("Invalid invoice status.");
  }
  const supabase = await createClient();
  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, status, project_id")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!invoice) throw new Error("Invoice not found.");
  const allowed: Record<string, string[]> = {
    draft: ["sent", "void"],
    sent: ["void"],
    partially_paid: [],
    paid: [],
    void: ["draft"],
  };
  if (!allowed[invoice.status]?.includes(nextStatus)) {
    throw new Error(`Invoice cannot move from ${invoice.status} to ${nextStatus}.`);
  }
  const { error } = await supabase
    .from("invoices")
    .update({ status: nextStatus })
    .eq("id", invoiceId);
  if (error) throw new Error(error.message);
  revalidateBilling(invoiceId, invoice.project_id);
}

export async function recordInvoicePaymentAction(
  invoiceId: string,
  _previous: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  await requireBillingManager();
  if (!validUuid(invoiceId)) return { status: "error", message: "Invalid invoice." };
  const paymentType = clean(formData, "payment_type");
  const paymentDate = clean(formData, "payment_date");
  const amount = requiredNumber(formData, "amount");
  const method = clean(formData, "method");
  const reference = nullable(formData, "reference");
  const note = nullable(formData, "note");
  if (!isInvoicePaymentType(paymentType)) {
    return { status: "error", message: "Select Deposit or Payment." };
  }
  if (!validDate(paymentDate) || !paymentDate) {
    return { status: "error", message: "Select a valid payment date." };
  }
  if (Number.isNaN(amount) || amount <= 0) {
    return { status: "error", message: "Payment amount must be greater than zero." };
  }
  if (!isInvoicePaymentMethod(method)) {
    return { status: "error", message: "Select a valid payment method." };
  }

  const supabase = await createClient();
  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, project_id")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!invoice) return { status: "error", message: "Invoice not found." };
  const { error } = await supabase.rpc("record_invoice_payment", {
    p_invoice_id: invoiceId,
    p_payment_type: paymentType,
    p_payment_date: paymentDate,
    p_amount: amount,
    p_method: method,
    p_reference: reference,
    p_note: note,
  });
  if (error) return { status: "error", message: error.message };
  revalidateBilling(invoiceId, invoice.project_id);
  return { status: "success", message: "Payment recorded." };
}

export async function reverseInvoicePaymentAction(
  invoiceId: string,
  paymentId: string,
  _previous: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  await requireBillingManager();
  if (!validUuid(invoiceId) || !validUuid(paymentId)) {
    return { status: "error", message: "Invalid payment." };
  }
  const reason = clean(formData, "reason");
  if (!reason) return { status: "error", message: "Reversal reason is required." };
  const supabase = await createClient();
  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, project_id")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!invoice) return { status: "error", message: "Invoice not found." };
  const { data: payment } = await supabase
    .from("invoice_payments")
    .select("id")
    .eq("id", paymentId)
    .eq("invoice_id", invoiceId)
    .is("reversed_at", null)
    .maybeSingle();
  if (!payment) {
    return { status: "error", message: "Active payment not found on this invoice." };
  }
  const { error } = await supabase.rpc("reverse_invoice_payment", {
    p_payment_id: paymentId,
    p_reason: reason,
  });
  if (error) return { status: "error", message: error.message };
  revalidateBilling(invoiceId, invoice.project_id);
  return { status: "success", message: "Payment reversed." };
}

export async function updateProjectFinancialSettingsAction(
  projectId: string,
  _previous: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const { user, profile } = await requireProfitabilityViewer();
  if (!canManageProjectFinancials(profile.role)) {
    return { status: "error", message: "Owner or Accounting permission required." };
  }
  if (!validUuid(projectId)) return { status: "error", message: "Invalid project." };
  const laborRate = requiredNumber(formData, "labor_cost_rate");
  const overhead = requiredNumber(formData, "overhead_cost");
  if (Number.isNaN(laborRate) || laborRate < 0) {
    return { status: "error", message: "Internal labor rate cannot be negative." };
  }
  if (Number.isNaN(overhead) || overhead < 0) {
    return { status: "error", message: "Overhead cost cannot be negative." };
  }

  const supabase = await createClient();
  const { data: project } = await supabase
    .rpc("billing_project_directory")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return { status: "error", message: "Project not found." };
  const { error } = await supabase.from("project_financial_settings").upsert({
    project_id: projectId,
    labor_cost_rate: laborRate,
    overhead_cost: overhead,
    updated_by: user.id,
  });
  if (error) return { status: "error", message: error.message };
  revalidateBilling(undefined, projectId);
  return { status: "success", message: "Project financial settings saved." };
}
