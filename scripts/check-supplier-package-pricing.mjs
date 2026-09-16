import { connectToSupabaseDatabase } from "./lib/supabase-db.mjs";

const { client } = await connectToSupabaseDatabase();
try {
  const { rows } = await client.query(`
    select i.sku, i.name, i.unit, i.quantity_on_hand,
      a.status, a.reason, a.dealer_cost, a.list_price,
      a.current_selling_price, a.suggested_selling_price,
      w.supplier_code, w.expected_part_number,
      ${process.argv.includes("--after") ? "w.supplier_units_per_pack, a.package_units, a.pack_check_required" : "null::integer as supplier_units_per_pack, null::integer as package_units, false as pack_check_required"}
    from public.supplier_price_alerts a
    join public.inventory_items i on i.id = a.inventory_item_id
    join public.supplier_price_watches w on w.id = a.watch_id
    where a.status = 'open' or i.sku in ('18-24301-9', '18-2341-1-9')
    order by a.status, i.sku
  `);
  console.log(JSON.stringify(rows, null, 2));
} finally {
  await client.end();
}
