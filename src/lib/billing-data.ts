import "server-only";

import {
  requireBillingManager,
  requireBillingViewer,
  requireProfitabilityViewer,
} from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { BillingInventoryOption } from "@/lib/billing";
import type {
  ClientContact,
  Invoice,
  InvoiceItem,
  InvoiceItemCost,
  InvoicePayment,
  ProjectFinancialSettings,
  ProjectProfitability,
} from "@/lib/types";

export type BillingInvoiceListRow = Pick<
  Invoice,
  | "id"
  | "invoice_number"
  | "title"
  | "status"
  | "issue_date"
  | "due_date"
  | "subtotal"
  | "discount_amount"
  | "total"
  | "amount_paid"
  | "balance_due"
  | "project_id"
> & {
  customer_name: string;
  project_name: string | null;
};

export type BillingCustomerOption = {
  id: string;
  name: string;
};

export type BillingProjectOption = {
  id: string;
  name: string;
  client_id: string | null;
  client_name: string | null;
};

export type BillingEstimateOption = {
  estimate_id: string;
  estimate_number: string;
  title: string;
  client_id: string;
  client_name: string;
  project_id: string;
  project_name: string;
  total: number;
};

export type BillingInvoiceDetail = {
  invoice: Invoice;
  customer: BillingCustomerOption | null;
  contact: ClientContact | null;
  project: { id: string; name: string } | null;
  sourceEstimate: { id: string; estimate_number: string } | null;
  items: BillingInvoiceItem[];
  payments: InvoicePayment[];
};

export type BillingInvoiceItem = InvoiceItem & {
  inventory_item: {
    id: string;
    sku: string;
    name: string;
    quantity_on_hand: number;
    unit: string;
  } | null;
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function getBillingDashboard(): Promise<BillingInvoiceListRow[]> {
  await requireBillingViewer();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices")
    .select(
      "id, invoice_number, title, status, issue_date, due_date, subtotal, discount_amount, total, amount_paid, balance_due, project_id, clients(name), projects(name)",
    )
    .order("issue_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Could not load invoices: ${error.message}`);

  return (data ?? []).map((row) => {
    const customer = firstRelation(row.clients as { name: string } | { name: string }[] | null);
    const project = firstRelation(row.projects as { name: string } | { name: string }[] | null);
    return {
      id: row.id,
      invoice_number: row.invoice_number,
      title: row.title,
      status: row.status,
      issue_date: row.issue_date,
      due_date: row.due_date,
      subtotal: Number(row.subtotal),
      discount_amount: Number(row.discount_amount),
      total: Number(row.total),
      amount_paid: Number(row.amount_paid),
      balance_due: Number(row.balance_due),
      project_id: row.project_id,
      customer_name: customer?.name ?? "Unknown customer",
      project_name: project?.name ?? null,
    } as BillingInvoiceListRow;
  });
}

export async function getBillingDirectories() {
  await requireBillingManager();
  const supabase = await createClient();
  const [customersResult, projectsResult, estimatesResult] = await Promise.all([
    supabase.from("clients").select("id, name").order("name"),
    supabase.rpc("billing_project_directory"),
    supabase.rpc("billing_estimate_directory"),
  ]);

  if (customersResult.error) {
    throw new Error(`Could not load customers: ${customersResult.error.message}`);
  }
  if (projectsResult.error) {
    throw new Error(`Could not load projects: ${projectsResult.error.message}`);
  }
  if (estimatesResult.error) {
    throw new Error(`Could not load accepted estimates: ${estimatesResult.error.message}`);
  }

  const customers = (customersResult.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
  })) as BillingCustomerOption[];
  const projects = ((projectsResult.data ?? []) as BillingProjectOption[])
    .filter(
      (row): row is BillingProjectOption & { client_id: string; client_name: string } =>
        Boolean(row.client_id && row.client_name),
    )
    .map((row) => ({
      id: row.id,
      name: row.name,
      client_id: row.client_id,
      client_name: row.client_name,
    })) as BillingProjectOption[];
  const estimates = ((estimatesResult.data ?? []) as Array<
    Omit<BillingEstimateOption, "total"> & { total: number | string }
  >).map((row) => ({
    estimate_id: row.estimate_id,
    estimate_number: row.estimate_number,
    title: row.title,
    client_id: row.client_id,
    client_name: row.client_name,
    project_id: row.project_id,
    project_name: row.project_name,
    total: Number(row.total),
  })) as BillingEstimateOption[];

  return { customers, projects, estimates };
}

export async function getBillingProjects(): Promise<BillingProjectOption[]> {
  await requireBillingViewer();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("billing_project_directory");
  if (error) throw new Error(`Could not load billing projects: ${error.message}`);
  return ((data ?? []) as BillingProjectOption[]).map((row) => ({
    id: row.id,
    name: row.name,
    client_id: row.client_id,
    client_name: row.client_name,
  })) as BillingProjectOption[];
}

export async function getBillingInvoiceDetail(
  invoiceId: string,
): Promise<BillingInvoiceDetail | null> {
  await requireBillingViewer();
  const supabase = await createClient();
  const { data: invoiceData, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .maybeSingle();
  if (error) throw new Error(`Could not load invoice: ${error.message}`);
  if (!invoiceData) return null;
  const invoice = invoiceData as Invoice;

  const [customerResult, contactResult, projectResult, itemsResult, paymentsResult] =
    await Promise.all([
      supabase.from("clients").select("id, name").eq("id", invoice.client_id).maybeSingle(),
      supabase
        .from("client_contacts")
        .select("*")
        .eq("client_id", invoice.client_id)
        .maybeSingle(),
      invoice.project_id
        ? supabase
            .from("projects")
            .select("id, name")
            .eq("id", invoice.project_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from("invoice_items")
        .select(
          "*, inventory_item:inventory_items(id, sku, name, quantity_on_hand, unit)",
        )
        .eq("invoice_id", invoice.id)
        .order("sort_order")
        .order("created_at"),
      supabase
        .from("invoice_payments")
        .select("*")
        .eq("invoice_id", invoice.id)
        .order("payment_date", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);

  const relatedError =
    customerResult.error ??
    contactResult.error ??
    projectResult.error ??
    itemsResult.error ??
    paymentsResult.error;
  if (relatedError) throw new Error(`Could not load invoice details: ${relatedError.message}`);

  let sourceEstimate: { id: string; estimate_number: string } | null = null;
  if (invoice.source_estimate_id) {
    const { data: estimateData, error: estimateError } = await supabase
      .from("estimates")
      .select("id, estimate_number")
      .eq("id", invoice.source_estimate_id)
      .maybeSingle();
    if (estimateError) {
      throw new Error(`Could not load source estimate: ${estimateError.message}`);
    }
    sourceEstimate = estimateData;
  }

  return {
    invoice,
    customer: customerResult.data,
    contact: contactResult.data as ClientContact | null,
    project: projectResult.data,
    sourceEstimate,
    items: (itemsResult.data ?? []).map((item) => ({
      ...item,
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      line_total: Number(item.line_total),
      inventory_item: firstRelation(
        item.inventory_item as
          | BillingInvoiceItem["inventory_item"]
          | NonNullable<BillingInvoiceItem["inventory_item"]>[]
          | null,
      ),
    })) as BillingInvoiceItem[],
    payments: (paymentsResult.data ?? []) as InvoicePayment[],
  };
}

export async function getBillingInventoryOptions(): Promise<BillingInventoryOption[]> {
  await requireBillingManager();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_items")
    .select("id, sku, name, unit, quantity_on_hand, selling_price")
    .eq("active", true)
    .order("sku");
  if (error) throw new Error(`Could not load stock items: ${error.message}`);
  return (data ?? []).map((item) => ({
    id: item.id,
    sku: item.sku,
    name: item.name,
    unit: item.unit,
    quantity_on_hand: Number(item.quantity_on_hand),
    selling_price:
      item.selling_price === null ? null : Number(item.selling_price),
  }));
}

export async function getInvoiceItemCosts(
  invoiceId: string,
): Promise<InvoiceItemCost[]> {
  await requireProfitabilityViewer();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoice_item_costs")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("created_at");
  if (error) throw new Error(`Could not load invoice COGS: ${error.message}`);
  return (data ?? []).map((cost) => ({
    ...cost,
    quantity: Number(cost.quantity),
    unit_cost: Number(cost.unit_cost),
    total_cost: Number(cost.total_cost),
  })) as InvoiceItemCost[];
}

export async function getProjectProfitability(projectId: string) {
  await requireProfitabilityViewer();
  const supabase = await createClient();
  const [profitabilityResult, settingsResult, invoicesResult] = await Promise.all([
    supabase.rpc("project_profitability", { p_project_id: projectId }),
    supabase
      .from("project_financial_settings")
      .select("*")
      .eq("project_id", projectId)
      .maybeSingle(),
    supabase
      .from("invoices")
      .select(
        "id, invoice_number, title, status, issue_date, due_date, subtotal, discount_amount, total, amount_paid, balance_due, project_id, clients(name), projects(name)",
      )
      .eq("project_id", projectId)
      .order("issue_date", { ascending: false }),
  ]);
  const error =
    profitabilityResult.error ?? settingsResult.error ?? invoicesResult.error;
  if (error) throw new Error(`Could not load project financials: ${error.message}`);

  const profitability = profitabilityResult.data?.[0]
    ? ({
        ...profitabilityResult.data[0],
        invoiced_revenue: Number(profitabilityResult.data[0].invoiced_revenue),
        payments_received: Number(profitabilityResult.data[0].payments_received),
        outstanding_balance: Number(profitabilityResult.data[0].outstanding_balance),
        labor_hours: Number(profitabilityResult.data[0].labor_hours),
        labor_cost_rate: Number(profitabilityResult.data[0].labor_cost_rate),
        labor_cost: Number(profitabilityResult.data[0].labor_cost),
        material_cost: Number(profitabilityResult.data[0].material_cost),
        overhead_cost: Number(profitabilityResult.data[0].overhead_cost),
        total_cost: Number(profitabilityResult.data[0].total_cost),
        gross_profit: Number(profitabilityResult.data[0].gross_profit),
        gross_margin_percent:
          profitabilityResult.data[0].gross_margin_percent === null
            ? null
            : Number(profitabilityResult.data[0].gross_margin_percent),
      } as ProjectProfitability)
    : null;

  const invoices = (invoicesResult.data ?? []).map((row) => {
    const customer = firstRelation(row.clients as { name: string } | { name: string }[] | null);
    const project = firstRelation(row.projects as { name: string } | { name: string }[] | null);
    return {
      ...row,
      subtotal: Number(row.subtotal),
      discount_amount: Number(row.discount_amount),
      total: Number(row.total),
      amount_paid: Number(row.amount_paid),
      balance_due: Number(row.balance_due),
      customer_name: customer?.name ?? "Unknown customer",
      project_name: project?.name ?? null,
    } as BillingInvoiceListRow;
  });

  return {
    profitability,
    settings: settingsResult.data as ProjectFinancialSettings | null,
    invoices,
  };
}
