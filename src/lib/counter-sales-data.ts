import "server-only";

import {
  requireCounterSalesManager,
  requireCounterSalesViewer,
  requireProfitabilityViewer,
} from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  CounterSale,
  CounterSaleItem,
  CounterSaleItemCost,
} from "@/lib/types";

export type CounterSaleInventoryOption = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  quantity_on_hand: number;
  selling_price: number | null;
};

export type CounterSaleCustomerOption = {
  id: string;
  name: string;
};

function numericCounterSale(row: CounterSale): CounterSale {
  return {
    ...row,
    subtotal: Number(row.subtotal),
    tax_rate_percent: Number(row.tax_rate_percent),
    tax_amount: Number(row.tax_amount),
    total: Number(row.total),
  };
}

function numericCounterSaleItem(row: CounterSaleItem): CounterSaleItem {
  return {
    ...row,
    quantity: Number(row.quantity),
    unit_price: Number(row.unit_price),
    line_total: Number(row.line_total),
  };
}

export async function getCounterSales(): Promise<CounterSale[]> {
  await requireCounterSalesViewer();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("counter_sales")
    .select("*")
    .order("completed_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Could not load counter sales: ${error.message}`);
  return ((data ?? []) as CounterSale[]).map(numericCounterSale);
}

export async function getCounterSaleDirectories() {
  await requireCounterSalesManager();
  const supabase = await createClient();
  const [inventoryResult, customersResult] = await Promise.all([
    supabase
      .from("inventory_items")
      .select("id, sku, name, unit, quantity_on_hand, selling_price")
      .eq("active", true)
      .order("sku"),
    supabase.rpc("counter_sale_customer_directory"),
  ]);
  const error = inventoryResult.error ?? customersResult.error;
  if (error) throw new Error(`Could not load counter sale directory: ${error.message}`);

  return {
    inventoryItems: (inventoryResult.data ?? []).map((item) => ({
      id: item.id,
      sku: item.sku,
      name: item.name,
      unit: item.unit,
      quantity_on_hand: Number(item.quantity_on_hand),
      selling_price: item.selling_price === null ? null : Number(item.selling_price),
    })) as CounterSaleInventoryOption[],
    customers: (customersResult.data ?? []) as CounterSaleCustomerOption[],
  };
}

export async function getCounterSaleDetail(counterSaleId: string): Promise<{
  sale: CounterSale;
  items: CounterSaleItem[];
} | null> {
  await requireCounterSalesViewer();
  const supabase = await createClient();
  const { data: saleData, error: saleError } = await supabase
    .from("counter_sales")
    .select("*")
    .eq("id", counterSaleId)
    .maybeSingle();
  if (saleError) throw new Error(`Could not load counter sale: ${saleError.message}`);
  if (!saleData) return null;

  const { data: itemData, error: itemError } = await supabase
    .from("counter_sale_items")
    .select("*")
    .eq("counter_sale_id", counterSaleId)
    .order("sort_order")
    .order("created_at");
  if (itemError) throw new Error(`Could not load counter sale items: ${itemError.message}`);

  return {
    sale: numericCounterSale(saleData as CounterSale),
    items: ((itemData ?? []) as CounterSaleItem[]).map(numericCounterSaleItem),
  };
}

export async function getCounterSaleCosts(
  counterSaleId: string,
): Promise<CounterSaleItemCost[]> {
  await requireProfitabilityViewer();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("counter_sale_item_costs")
    .select("*")
    .eq("counter_sale_id", counterSaleId)
    .order("created_at");
  if (error) throw new Error(`Could not load counter sale COGS: ${error.message}`);
  return ((data ?? []) as CounterSaleItemCost[]).map((row) => ({
    ...row,
    quantity: Number(row.quantity),
    unit_cost: Number(row.unit_cost),
    total_cost: Number(row.total_cost),
  }));
}
