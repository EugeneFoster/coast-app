import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { connectToSupabaseDatabase } from "./lib/supabase-db.mjs";

const { client } = await connectToSupabaseDatabase();
const apply = process.argv.includes("--apply");
try {
  await client.query("begin");
  const before = (await client.query("select md5(string_agg(concat_ws('|',id,quantity_on_hand,average_cost,selling_price),',' order by id)) as checksum from inventory_items")).rows[0].checksum;
  await client.query(readFileSync("supabase/migrations/20260916000002_supplier_routing.sql", "utf8"));
  const cases = [
    ["Mercury filter", "part", null, "marinepartssupply"],
    ["Volvo water pump", "plumbing", null, "marinepartssupply"],
    ["Suzuki impeller", "plumbing", null, "marinepartssupply"],
    ["JNN gasket", "part", null, "marinepartssupply"],
    ["EMP Yamaha impeller", "part", null, "westernmarine"],
    ["Sierra gasket", "engine", null, "westernmarine"],
    ["Sierra gasket", "engine", "marinepartssupply", "marinepartssupply"],
    ["Yamaha gasket", "engine", "marinepartssupply", null],
    ["Yamaha gasket", "engine", null, null],
    ["Honda filter", "engine", null, null],
    ["Honda filter", "engine", "marinepartssupply", "marinepartssupply"],
    ["Mercury paint", "paint", null, "westernmarine"],
    ["Alum square tube 6061", "part", "marinepartssupply", null],
    ["Aluminum sheet", "aluminum", "westernmarine", null],
    ["Steel HSS", "steel", null, null],
    ["Stainless steel vent", "steel", null, "westernmarine"],
    ["Alum weld on cleat", "deck", null, "westernmarine"],
    ["Hull zinc with aluminum strap", "aluminum", null, "westernmarine"],
    ["Polysteel rope", "part", null, "westernmarine"],
    ["Helm chair", "part", null, "westernmarine"],
    ["Water pump", "plumbing", null, "westernmarine"],
    ["Fuel pump", "part", null, null],
    ["Water temp sender", "part", null, null],
    ["Mercury filter", "engine", "other", null],
    ["Volvo pump", "engine", "westernmarine", "westernmarine"],
    ["Generic gasket", "part", null, null],
  ];
  for (const [name, category, assigned, expected] of cases) {
    const { rows } = await client.query("select * from choose_price_supplier($1,$2,$3,$4,$5,$6)", ["TEST-123",name,null,null,category,assigned]);
    assert.equal(rows[0].supplier_code, expected, name);
  }
  assert.equal((await client.query("select supplier_code from choose_price_supplier('18-0826','Yamaha gasket',null,null,'part',null)")).rows[0].supplier_code, "westernmarine");
  await client.query("savepoint fixtures");
  const itemId = randomUUID();
  await client.query("insert into inventory_items(id,sku,name,category) values($1,$2,'Sierra test gasket','part')", [itemId,`ROUTING-${randomUUID()}`]);
  const route = async (manual = null) => (await client.query("select * from supplier_price_route($1,$2)", [itemId, manual])).rows[0];
  assert.equal((await route()).supplier_code, "westernmarine");
  assert.equal((await route("marinepartssupply")).supplier_code, "marinepartssupply");
  const supplierId = randomUUID();
  await client.query("insert into suppliers(id,name) values($1,$2)", [supplierId,`Other supplier ${randomUUID()}`]);
  await client.query("update inventory_items set preferred_supplier_id=$1 where id=$2", [supplierId,itemId]);
  assert.equal((await route("marinepartssupply")).supplier_code, null, "Do not override an assigned unrelated supplier");
  await client.query("update suppliers set name='Western Marine Company' where id=$1", [supplierId]);
  assert.equal((await route("marinepartssupply")).supplier_code, "westernmarine", "Preferred supplier wins");
  await client.query("update suppliers set active=false where id=$1", [supplierId]);
  assert.equal((await route()).supplier_code, null, "Inactive supplier is excluded");
  await client.query("rollback to savepoint fixtures");
  const candidates = (await client.query("select * from routed_supplier_price_candidates(20)")).rows;
  assert.equal(new Set(candidates.map(x => x.item_id)).size, candidates.length, "Only one supplier per item");
  for (const c of candidates) assert.equal((await client.query("select supplier_code from supplier_price_route($1)", [c.item_id])).rows[0].supplier_code,c.supplier_code);
  const bad = (await client.query(`select count(*)::int as n from supplier_price_watches w cross join lateral supplier_price_route(w.inventory_item_id) r where w.active and w.supplier_code is distinct from r.supplier_code`)).rows[0].n;
  assert.equal(bad,0,"No active misrouted watches");
  const after = (await client.query("select md5(string_agg(concat_ws('|',id,quantity_on_hand,average_cost,selling_price),',' order by id)) as checksum from inventory_items")).rows[0].checksum;
  assert.equal(after,before,"Inventory quantities and all prices unchanged");
  console.log("Routing policy and DB integration tests passed.");
  console.log("routes",(await client.query(`select r.supplier_code,r.reason,count(*)::int from inventory_items i cross join lateral supplier_price_route(i.id) r where i.active and i.quantity_on_hand>0 group by r.supplier_code,r.reason order by r.supplier_code,r.reason`)).rows);
  console.log("watches",(await client.query("select supplier_code,active,count(*)::int from supplier_price_watches group by supplier_code,active")).rows);
  console.log("candidates",candidates.map(({sku,supplier_code,query_part_number})=>({sku,supplier_code,query_part_number})));
  await client.query(apply ? "commit" : "rollback");
  console.log(apply ? "Supplier routing applied." : "Dry run rolled back; no changes saved.");
} catch(error) { await client.query("rollback"); throw error; }
finally { await client.end(); }
