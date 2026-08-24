"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCounterSalesManager } from "@/lib/auth";
import {
  isCounterSalePaymentMethod,
  type CounterSaleActionState,
} from "@/lib/counter-sales";
import { createClient } from "@/lib/supabase/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SaleItemPayload = {
  inventory_item_id: string;
  quantity: number;
  unit_price: number;
};

function clean(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function parseItems(value: string): SaleItemPayload[] | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 100) return null;
    const items = parsed.map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const item = entry as Record<string, unknown>;
      if (
        typeof item.inventory_item_id !== "string" ||
        !UUID_RE.test(item.inventory_item_id) ||
        typeof item.quantity !== "number" ||
        !Number.isFinite(item.quantity) ||
        item.quantity <= 0 ||
        Math.abs(Math.round(item.quantity * 1000) - item.quantity * 1000) > 1e-9 ||
        typeof item.unit_price !== "number" ||
        !Number.isFinite(item.unit_price) ||
        item.unit_price < 0 ||
        Math.abs(Math.round(item.unit_price * 100) - item.unit_price * 100) > 1e-9
      ) return null;
      return {
        inventory_item_id: item.inventory_item_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
      };
    });
    if (items.some((item) => item === null)) return null;
    const validItems = items as SaleItemPayload[];
    if (new Set(validItems.map((item) => item.inventory_item_id)).size !== validItems.length) {
      return null;
    }
    return validItems;
  } catch {
    return null;
  }
}

export async function completeCounterSaleAction(
  _previous: CounterSaleActionState,
  formData: FormData,
): Promise<CounterSaleActionState> {
  await requireCounterSalesManager();
  const clientId = clean(formData, "client_id") || null;
  const customerName = clean(formData, "customer_name");
  const paymentMethod = clean(formData, "payment_method");
  const paymentReference = clean(formData, "payment_reference") || null;
  const taxRate = Number(clean(formData, "tax_rate_percent"));
  const items = parseItems(clean(formData, "items_json"));

  if (clientId && !UUID_RE.test(clientId)) {
    return { status: "error", message: "Select a valid customer." };
  }
  if (!clientId && customerName.length > 200) {
    return { status: "error", message: "Customer name is too long." };
  }
  if (!isCounterSalePaymentMethod(paymentMethod)) {
    return { status: "error", message: "Select a valid payment method." };
  }
  if (paymentReference && paymentReference.length > 120) {
    return { status: "error", message: "Payment reference is too long." };
  }
  if (
    !Number.isFinite(taxRate) ||
    taxRate < 0 ||
    taxRate > 100 ||
    Math.abs(Math.round(taxRate * 1000) - taxRate * 1000) > 1e-9
  ) {
    return { status: "error", message: "Tax rate must be between 0 and 100%." };
  }
  if (!items) {
    return { status: "error", message: "Add at least one valid stock item." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("complete_counter_sale", {
    p_client_id: clientId,
    p_customer_name: customerName || null,
    p_payment_method: paymentMethod,
    p_payment_reference: paymentReference,
    p_tax_rate: taxRate,
    p_items: items,
  });
  if (error || !data) {
    return {
      status: "error",
      message: error?.message ?? "Could not complete the counter sale.",
    };
  }

  revalidatePath("/counter-sales");
  revalidatePath("/inventory");
  redirect(`/counter-sales/${data}`);
}

export async function voidCounterSaleAction(
  counterSaleId: string,
  _previous: CounterSaleActionState,
  formData: FormData,
): Promise<CounterSaleActionState> {
  await requireCounterSalesManager();
  if (!UUID_RE.test(counterSaleId)) {
    return { status: "error", message: "Counter sale not found." };
  }
  const reason = clean(formData, "reason");
  if (reason.length < 5 || reason.length > 500) {
    return { status: "error", message: "Enter a reason from 5 to 500 characters." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("void_counter_sale", {
    p_counter_sale_id: counterSaleId,
    p_reason: reason,
  });
  if (error) return { status: "error", message: error.message };

  revalidatePath("/counter-sales");
  revalidatePath(`/counter-sales/${counterSaleId}`);
  revalidatePath("/inventory");
  redirect(`/counter-sales/${counterSaleId}`);
}
