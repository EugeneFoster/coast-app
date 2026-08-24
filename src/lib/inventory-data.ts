import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { InventoryCategory } from "@/lib/types";

export type InventoryItemOption = {
  id: string;
  sku: string;
  name: string;
  category: InventoryCategory;
  unit: string;
  quantity_on_hand: number;
  average_cost: number;
  active: boolean;
};

export type SupplierOption = {
  id: string;
  name: string;
  active: boolean;
};

export async function getInventoryItemOptions(): Promise<InventoryItemOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("inventory_items")
    .select("id, sku, name, category, unit, quantity_on_hand, average_cost, active")
    .order("name");
  return (data ?? []) as InventoryItemOption[];
}

export async function getSupplierOptions(): Promise<SupplierOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("suppliers")
    .select("id, name, active")
    .order("name");
  return (data ?? []) as SupplierOption[];
}
