import { readFile } from "node:fs/promises";
import { connectToSupabaseDatabase } from "./lib/supabase-db.mjs";

const sql = await readFile(
  "supabase/migrations/20260908000001_inventory_xero_supplier_sync.sql",
  "utf8",
);
const { client } = await connectToSupabaseDatabase();

async function ownerRole() {
  await client.query("reset role");
  await client.query("select set_config('request.jwt.claims', '{}', true)");
  await client.query("select set_config('request.jwt.claim.sub', '', true)");
}

async function authenticated(profileId) {
  const claims = JSON.stringify({ sub: profileId, role: "authenticated" });
  await client.query("set local role authenticated");
  await client.query("select set_config('request.jwt.claims', $1, true)", [claims]);
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [profileId]);
  await client.query("select set_config('request.jwt.claim.role', 'authenticated', true)");
}

async function expectFailure(callback) {
  await client.query("savepoint expected_failure");
  try {
    await callback();
  } catch {
    await client.query("rollback to savepoint expected_failure");
    return;
  }
  await client.query("rollback to savepoint expected_failure");
  throw new Error("Expected operation was not blocked.");
}

try {
  await client.query("begin");
  await client.query(sql);
  const { rows: profiles } = await client.query(
    "select id, role::text as role from public.profiles where status = 'active' order by created_at limit 1",
  );
  const profile = profiles[0];
  if (!profile) throw new Error("An active employee is required.");
  await client.query("update public.profiles set role = 'owner' where id = $1", [profile.id]);
  const suffix = crypto.randomUUID();
  const { rows: suppliers } = await client.query(
    "insert into public.suppliers (name, created_by) values ($1, $2) returning id",
    [`Xero migration check ${suffix}`, profile.id],
  );
  const { rows: items } = await client.query(
    `insert into public.inventory_items
       (sku, name, category, unit, xero_item_id, xero_is_tracked, created_by)
     values ($1, 'Chartplotter check', 'electronics', 'ea', $2, true, $3)
     returning id`,
    [`XERO-${suffix}`, crypto.randomUUID(), profile.id],
  );

  await authenticated(profile.id);
  await client.query(
    "select public.reconcile_inventory_from_xero($1, 5, 12.34, now())",
    [items[0].id],
  );
  const { rows: reconciled } = await client.query(
    `select quantity_on_hand, average_cost, xero_sync_status,
       (select count(*) from public.inventory_movements where inventory_item_id = i.id) as movements
     from public.inventory_items i where id = $1`,
    [items[0].id],
  );
  const item = reconciled[0];
  if (
    Number(item?.quantity_on_hand) !== 5 ||
    Number(item?.average_cost) !== 12.34 ||
    item?.xero_sync_status !== "synced" ||
    Number(item?.movements) !== 1
  ) {
    throw new Error(`Xero reconciliation is incorrect: ${JSON.stringify(item)}`);
  }

  await expectFailure(() => client.query("select * from public.xero_connections"));

  await ownerRole();
  const { rows: orders } = await client.query(
    `insert into public.purchase_orders
       (supplier_id, status, external_source, external_order_id, shipping_status, created_by)
     values ($1, 'draft', 'marinepartssupply', $2, 'shipped', $3)
     returning id`,
    [suppliers[0].id, `external-${suffix}`, profile.id],
  );
  const { rows: lines } = await client.query(
    `insert into public.purchase_order_items
       (purchase_order_id, inventory_item_id, external_line_id, description, quantity, unit, unit_cost)
     values ($1, $2, '1', 'Chartplotter check', 2, 'ea', 12.34)
     returning id`,
    [orders[0].id, items[0].id],
  );
  await authenticated(profile.id);
  await client.query("update public.purchase_orders set status = 'ordered' where id = $1", [orders[0].id]);
  const before = await client.query("select quantity_on_hand from public.inventory_items where id = $1", [items[0].id]);
  if (Number(before.rows[0]?.quantity_on_hand) !== 5) throw new Error("Ordered goods changed on-hand stock.");
  await client.query("select public.receive_purchase_order_item($1, 2, 'Confirmed delivery')", [lines[0].id]);
  const after = await client.query("select quantity_on_hand from public.inventory_items where id = $1", [items[0].id]);
  if (Number(after.rows[0]?.quantity_on_hand) !== 7) throw new Error("Confirmed receipt did not change stock.");

  await client.query("rollback");
  console.log("Inventory/Xero migration checks passed.");
} catch (error) {
  try { await client.query("rollback"); } catch {}
  throw error;
} finally {
  await client.end();
}

