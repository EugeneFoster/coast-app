import { connectToSupabaseDatabase } from "./lib/supabase-db.mjs";

const { client } = await connectToSupabaseDatabase();
try {
  await client.query("begin read only");
  if (process.argv.includes("--brands")) {
    console.log(JSON.stringify((await client.query(`select manufacturer,count(*)::int as items from inventory_items where active and quantity_on_hand>0 group by manufacturer order by items desc`)).rows));
    await client.query("rollback");
    process.exitCode = 0;
  } else {
  for (const [label, sql] of [
    ["suppliers", `select s.id,s.name,s.website,count(i.id)::int as preferred_items from suppliers s left join inventory_items i on i.preferred_supplier_id=s.id group by s.id order by s.name`],
    ["categories", `select category,count(*)::int as items from inventory_items where active and quantity_on_hand>0 group by category order by category`],
    ["preferred", `select i.sku,i.name,s.name as preferred_supplier from inventory_items i join suppliers s on s.id=i.preferred_supplier_id`],
    ["brand_metadata", `select column_name,data_type from information_schema.columns where table_name='inventory_items'`],
    ["routing_examples", `select sku,name,left(description,180) as description,category from inventory_items where active and quantity_on_hand>0 and (name ~* '(JNN|EMP|Honda|alum|metal|steel|paint)' or description ~* '(Mercury|Suzuki|Volvo|Sierra)') order by sku limit 75`],
    ["watches", `select i.sku,i.name,w.supplier_code,w.active,w.created_by is not null as manual,count(a.id)::int as open_alerts from supplier_price_watches w join inventory_items i on i.id=w.inventory_item_id left join supplier_price_alerts a on a.watch_id=w.id and a.status='open' group by i.sku,i.name,w.id order by i.sku`],
    ["received_suppliers", `select s.name,count(distinct pi.inventory_item_id)::int as items from purchase_order_items pi join purchase_orders p on p.id=pi.purchase_order_id join suppliers s on s.id=p.supplier_id where pi.quantity_received>0 group by s.name`],
  ]) console.log(label, JSON.stringify((await client.query(sql)).rows));
  await client.query("rollback");
  }
} finally { await client.end(); }
