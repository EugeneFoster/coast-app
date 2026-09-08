import Link from "next/link";
import { Grid2X2, ImageIcon, List, PackageOpen, Plus, Search } from "lucide-react";
import { requireInventoryViewer } from "@/lib/auth";
import { canManageInventory, canViewPurchasing } from "@/lib/employee-roles";
import { formatQuantity, inventoryCategoryLabel } from "@/lib/inventory";
import { formatCad } from "@/lib/sales";
import { createClient } from "@/lib/supabase/server";
import type { InventoryItem } from "@/lib/types";

type InventoryRow = InventoryItem & {
  suppliers: { name: string } | null;
};

type InboundLine = {
  inventory_item_id: string;
  quantity: number;
  quantity_received: number;
  purchase_orders: {
    id: string;
    status: string;
    shipping_status: string;
    expected_date: string | null;
  } | null;
};

type CategoryCount = {
  category: InventoryItem["category"];
  item_count: number;
};

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; page?: string }>;
}) {
  const { profile } = await requireInventoryViewer();
  const canManage = canManageInventory(profile.role);
  const showCost = canViewPurchasing(profile.role);
  const { q = "", category = "all", page = "1" } = await searchParams;
  const supabase = await createClient();
  const pageSize = 100;
  const requestedPage = Math.max(1, Number.parseInt(page, 10) || 1);
  const firstVisibleIndex = (requestedPage - 1) * pageSize;
  const searchTerm = q.trim().slice(0, 100).replace(/[,%()]/g, " ");
  let inventoryQuery = supabase
    .from("inventory_items")
    .select(
      "id, sku, name, category, unit, quantity_on_hand, average_cost, selling_price, reorder_point, image_url, active, suppliers(name)",
      { count: "exact" },
    )
    .eq("active", true);
  if (searchTerm) {
    inventoryQuery = inventoryQuery.or(`name.ilike.%${searchTerm}%,sku.ilike.%${searchTerm}%`);
  }
  if (category !== "all") inventoryQuery = inventoryQuery.eq("category", category);

  const [{ data: itemData, error: inventoryError, count }, { data: categoryData, error: categoryError }] = await Promise.all([
    inventoryQuery
      .order("quantity_on_hand", { ascending: false })
      .order("name")
      .range(firstVisibleIndex, firstVisibleIndex + pageSize - 1),
    supabase.rpc("inventory_category_counts"),
  ]);
  if (inventoryError) throw new Error(`Could not load inventory: ${inventoryError.message}`);
  if (categoryError) throw new Error(`Could not load inventory categories: ${categoryError.message}`);

  const visibleItems = (itemData ?? []) as unknown as InventoryRow[];
  const matchingCount = count ?? 0;
  const categoryCounts = ((categoryData ?? []) as CategoryCount[]).map(({ category: value, item_count }) => ({
    value,
    count: Number(item_count),
  }));
  const activeCount = categoryCounts.reduce((sum, entry) => sum + entry.count, 0);
  const pageCount = Math.max(1, Math.ceil(matchingCount / pageSize));
  const currentPage = Math.min(requestedPage, pageCount);

  const { data: inboundData } = visibleItems.length
    ? await supabase
        .from("purchase_order_items")
        .select("inventory_item_id, quantity, quantity_received, purchase_orders(id, status, shipping_status, expected_date)")
        .in("inventory_item_id", visibleItems.map((item) => item.id))
    : { data: [] };
  const inboundLines = (inboundData ?? []) as unknown as InboundLine[];
  const inboundByItem = new Map<string, { quantity: number; statuses: string[]; expected: string | null }>();
  for (const line of inboundLines) {
    const order = line.purchase_orders;
    if (!order || !["ordered", "partially_received"].includes(order.status)) continue;
    const remaining = Math.max(0, Number(line.quantity) - Number(line.quantity_received));
    if (!remaining) continue;
    const current = inboundByItem.get(line.inventory_item_id) ?? { quantity: 0, statuses: [], expected: null };
    current.quantity += remaining;
    current.statuses.push(order.shipping_status);
    if (order.expected_date && (!current.expected || order.expected_date < current.expected)) current.expected = order.expected_date;
    inboundByItem.set(line.inventory_item_id, current);
  }
  const categories = categoryCounts.map(({ value }) => value);

  function filterHref(next: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const values = { q, category, page: undefined, ...next };
    for (const [key, value] of Object.entries(values)) {
      if (value && value !== "all") params.set(key, value);
    }
    const queryString = params.toString();
    return queryString ? `/inventory?${queryString}` : "/inventory";
  }

  return (
    <main className="mt-4 md:mt-5">
      <div className="flex items-center justify-end gap-2">
        <p className="mr-auto hidden text-sm text-graph md:block">
          {matchingCount === activeCount ? `${activeCount} active SKUs` : `${matchingCount} of ${activeCount} active SKUs`}
        </p>
        {canManage && (
          <Link href="/inventory/items/new" className="btn-primary flex h-10 items-center gap-2 px-4 text-sm">
            <Plus size={17} strokeWidth={1.5} aria-hidden />
            New item
          </Link>
        )}
      </div>

      {categoryCounts.length > 0 && (
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          <Link href={filterHref({ category: "all" })} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${category === "all" ? "border-ink bg-ink text-bone" : "border-rule bg-paper text-graph"}`}>All {activeCount}</Link>
          {categoryCounts.map(({ value, count }) => (
            <Link key={value} href={filterHref({ category: value })} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${category === value ? "border-ink bg-ink text-bone" : "border-rule bg-paper text-graph"}`}>
              {inventoryCategoryLabel(value)} {count}
            </Link>
          ))}
        </div>
      )}

      <form action="/inventory" className="mt-4 grid gap-2 md:mt-5 md:grid-cols-[minmax(260px,1fr)_auto_auto_auto]">
        <label className="flex h-11 items-center gap-2 rounded-[4px] border border-rule bg-paper px-3 text-graph md:h-10">
          <Search size={17} strokeWidth={1.5} aria-hidden />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search SKU, item, supplier…"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-graph"
          />
        </label>
        <select name="category" defaultValue={category} aria-label="Category" className="hidden h-10 rounded-[4px] border border-rule bg-paper px-3 text-[13px] text-ink md:block">
          <option value="all">Category: All</option>
          {categories.map((value) => (
            <option key={value} value={value}>{inventoryCategoryLabel(value)}</option>
          ))}
        </select>
        <button type="submit" className="btn-secondary hidden h-10 px-3 text-[13px] md:block">Apply</button>
        <div className="hidden overflow-hidden rounded-[4px] border border-rule md:flex">
          <span className="flex h-10 w-10 items-center justify-center bg-ink text-bone"><List size={17} strokeWidth={1.5} aria-hidden /></span>
          <span className="flex h-10 w-10 items-center justify-center bg-paper text-graph"><Grid2X2 size={16} strokeWidth={1.5} aria-hidden /></span>
        </div>
      </form>

      <div className="mt-2 flex items-center gap-2 md:hidden">
        {(q || category !== "all") && (
          <Link href="/inventory" className="text-[13px] text-graph">Clear filters</Link>
        )}
      </div>

      <div className="mt-4 space-y-2.5 md:hidden">
        {visibleItems.map((item) => {
          const isLow = item.active && Number(item.quantity_on_hand) <= Number(item.reorder_point);
          const inbound = inboundByItem.get(item.id);
          return (
            <Link
              key={item.id}
              href={`/inventory/items/${item.id}`}
              className={`block rounded-[4px] border bg-paper p-3 ${isLow ? "border-weld" : "border-rule"} ${item.active ? "" : "opacity-55"}`}
            >
              <span className="flex items-start justify-between gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[3px] border border-rule bg-bone">
                  {item.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.image_url} alt="" className="h-full w-full object-contain" />
                  ) : <ImageIcon size={17} className="text-graph" aria-hidden />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-medium leading-tight text-ink">{item.name}</span>
                  <span className="mt-1 block font-mono text-[11px] text-graph">{item.sku}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-mono text-xl text-ink">{Number(item.quantity_on_hand)}</span>
                  <span className="block font-mono text-[11px] text-graph">{item.unit}</span>
                </span>
              </span>
              {inbound && (
                <span className="mt-2 flex items-center gap-1.5 text-xs text-blue-700">
                  <PackageOpen size={14} aria-hidden /> Incoming {formatQuantity(inbound.quantity, item.unit)} · {inbound.statuses.includes("shipped") ? "Shipped" : inbound.statuses.includes("backordered") ? "Backordered" : "Ordered"}
                </span>
              )}
              <span className="mt-2.5 flex items-center justify-between gap-2 border-t border-rule pt-2.5">
                <span className={`inline-flex items-center gap-1.5 rounded-[3px] border px-2 py-1 font-mono text-[11px] ${isLow ? "border-weld text-weld-text" : "border-rule text-graph"}`}>
                  <span className="h-1.5 w-1.5 bg-current" aria-hidden />
                  {isLow ? "Low stock" : inventoryCategoryLabel(item.category)}
                </span>
                <span className="text-[13px] text-ink">Open item</span>
              </span>
            </Link>
          );
        })}
      </div>

      <div className="mt-4 hidden overflow-x-auto rounded-[4px] border border-rule bg-paper md:block">
        <table className="w-full min-w-[50rem] border-collapse text-left text-sm">
          <thead className="border-b border-rule bg-ink/[0.03] font-mono text-[10px] uppercase tracking-[0.14em] text-graph">
            <tr>
              <th className="px-4 py-2.5 font-normal">SKU / item</th>
              <th className="px-4 py-2.5 font-normal">Category</th>
              <th className="px-4 py-2.5 text-right font-normal">On hand</th>
              <th className="px-4 py-2.5 font-normal">Incoming</th>
              <th className="px-4 py-2.5 text-right font-normal">Reorder</th>
              {showCost && <th className="px-4 py-2.5 text-right font-normal">Avg. cost</th>}
              <th className="px-4 py-2.5 text-right font-normal">Sell</th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((item) => {
              const isLow = item.active && Number(item.quantity_on_hand) <= Number(item.reorder_point);
              const inbound = inboundByItem.get(item.id);
              return (
                <tr key={item.id} className={`border-b border-rule last:border-0 hover:bg-ink/[0.025] ${item.active ? "" : "opacity-55"}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-start gap-2.5">
                      {isLow && <span className="mt-1 h-2 w-2 shrink-0 bg-weld" aria-label="Low stock" />}
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[3px] border border-rule bg-bone">
                        {item.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.image_url} alt="" className="h-full w-full object-contain" />
                        ) : <ImageIcon size={16} className="text-graph" aria-hidden />}
                      </span>
                      <div>
                        <Link href={`/inventory/items/${item.id}`} className="font-medium text-ink hover:text-weld-text">{item.name}</Link>
                        <p className="mt-0.5 font-mono text-[11px] text-graph">{item.sku}{item.suppliers?.name ? ` · ${item.suppliers.name}` : ""}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-graph">{inventoryCategoryLabel(item.category)}</td>
                  <td className={`px-4 py-3 text-right font-mono ${isLow ? "font-medium text-weld-text" : "text-ink"}`}>{formatQuantity(item.quantity_on_hand, item.unit)}</td>
                  <td className="px-4 py-3">
                    {inbound ? (
                      <Link href="/inventory/purchase-orders" className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:underline">
                        <PackageOpen size={14} aria-hidden />
                        {formatQuantity(inbound.quantity, item.unit)} · {inbound.statuses.includes("shipped") ? "Shipped" : inbound.statuses.includes("backordered") ? "Backorder" : "Ordered"}
                      </Link>
                    ) : <span className="text-graph">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-graph">{formatQuantity(item.reorder_point, item.unit)}</td>
                  {showCost && <td className="px-4 py-3 text-right font-mono text-ink">{formatCad(item.average_cost)}</td>}
                  <td className="px-4 py-3 text-right font-mono text-ink">{item.selling_price === null ? "—" : formatCad(item.selling_price)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {matchingCount > pageSize && (
        <nav className="mt-4 flex items-center justify-between gap-3" aria-label="Inventory pages">
          <Link
            href={filterHref({ page: String(Math.max(1, currentPage - 1)) })}
            aria-disabled={currentPage === 1}
            className={`btn-secondary flex h-9 items-center px-3 text-xs ${currentPage === 1 ? "pointer-events-none opacity-40" : ""}`}
          >
            Previous
          </Link>
          <p className="text-xs text-graph">
            Page {currentPage} of {pageCount} · items {firstVisibleIndex + 1}–{Math.min(firstVisibleIndex + pageSize, matchingCount)} of {matchingCount}
          </p>
          <Link
            href={filterHref({ page: String(Math.min(pageCount, currentPage + 1)) })}
            aria-disabled={currentPage === pageCount}
            className={`btn-secondary flex h-9 items-center px-3 text-xs ${currentPage === pageCount ? "pointer-events-none opacity-40" : ""}`}
          >
            Next
          </Link>
        </nav>
      )}

      {matchingCount === 0 && (
        <div className="mt-4 rounded-[4px] border border-dashed border-rule bg-paper px-4 py-12 text-center">
          <p className="text-sm text-graph">No inventory items match these filters.</p>
          <Link href="/inventory" className="mt-3 inline-flex text-sm font-medium text-weld-text">Clear filters</Link>
        </div>
      )}
    </main>
  );
}
