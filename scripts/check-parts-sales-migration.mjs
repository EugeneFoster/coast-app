import { readFile } from "node:fs/promises";
import { connectToSupabaseDatabase } from "./lib/supabase-db.mjs";

const migrationSql = await readFile(
  "supabase/migrations/20260824000004_parts_sales_inventory.sql",
  "utf8",
);
const { client, projectRef } = await connectToSupabaseDatabase();

async function assumeAuthenticatedUser(profileId) {
  const claims = JSON.stringify({ sub: profileId, role: "authenticated" });
  await client.query("set local role authenticated");
  await client.query("select set_config('request.jwt.claims', $1, true)", [claims]);
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [
    profileId,
  ]);
  await client.query(
    "select set_config('request.jwt.claim.role', 'authenticated', true)",
  );
}

async function assumeDatabaseOwner() {
  await client.query("reset role");
  await client.query("select set_config('request.jwt.claims', '{}', true)");
  await client.query("select set_config('request.jwt.claim.sub', '', true)");
}

async function expectFailure(label, callback) {
  const savepoint = `check_${label.replaceAll(/[^a-z0-9]/gi, "_")}`;
  await client.query(`savepoint ${savepoint}`);
  try {
    await callback();
  } catch {
    await client.query(`rollback to savepoint ${savepoint}`);
    return;
  }
  await client.query(`rollback to savepoint ${savepoint}`);
  throw new Error(`${label} was not blocked.`);
}

async function expectNoRows(label, callback) {
  const result = await callback();
  if (result.rowCount !== 0) {
    throw new Error(`${label} changed ${result.rowCount} row(s).`);
  }
}

function expectNumber(actual, expected, label) {
  if (Number(actual) !== expected) {
    throw new Error(`${label} expected ${expected}, received ${actual}.`);
  }
}

try {
  await client.query("begin");
  await client.query(migrationSql);

  const { rows: profileRows } = await client.query(`
    select id
    from public.profiles
    where status = 'active'
    order by created_at
    limit 1
  `);
  const profile = profileRows[0];
  if (!profile) throw new Error("An active employee is required.");

  await client.query("update public.profiles set role = 'owner' where id = $1", [
    profile.id,
  ]);
  await assumeAuthenticatedUser(profile.id);

  const testId = crypto.randomUUID();
  const { rows: customerRows } = await client.query(
    `insert into public.clients (name, type, created_by)
     values ($1, 'business', $2) returning id`,
    [`P6 parts customer ${testId}`, profile.id],
  );
  const customerId = customerRows[0].id;
  const { rows: projectRows } = await client.query(
    `insert into public.projects (name, client_id, status, created_by)
     values ($1, $2, 'in_progress', $3) returning id`,
    [`P6 parts project ${testId}`, customerId, profile.id],
  );
  const projectId = projectRows[0].id;
  const { rows: stockRows } = await client.query(
    `insert into public.inventory_items (
       sku, name, category, unit, selling_price, reorder_point, created_by
     ) values ($1, 'P6 test propeller', 'part', 'ea', 100, 1, $2)
     returning id`,
    [`P6-SKU-${testId}`, profile.id],
  );
  const inventoryItemId = stockRows[0].id;
  await client.query(
    "select public.adjust_inventory($1, 'in', 5, 40, 'P6 opening stock')",
    [inventoryItemId],
  );

  const invoiceNumber = `TEST-P6-${testId}`;
  const { rows: invoiceRows } = await client.query(
    `insert into public.invoices (
       invoice_number, client_id, project_id, title, created_by
     ) values ($1, $2, $3, 'P6 direct parts sale', $4)
     returning id`,
    [invoiceNumber, customerId, projectId, profile.id],
  );
  const invoiceId = invoiceRows[0].id;

  await expectFailure("stock_line_wrong_type", () =>
    client.query(
      `insert into public.invoice_items (
         invoice_id, inventory_item_id, item_type, description,
         quantity, unit, unit_price
       ) values ($1, $2, 'material', 'Forged stock line', 1, 'ea', 100)`,
      [invoiceId, inventoryItemId],
    ),
  );
  await expectFailure("stock_line_wrong_unit", () =>
    client.query(
      `insert into public.invoice_items (
         invoice_id, inventory_item_id, item_type, description,
         quantity, unit, unit_price
       ) values ($1, $2, 'part', 'Forged stock line', 1, 'hr', 100)`,
      [invoiceId, inventoryItemId],
    ),
  );

  const { rows: lineRows } = await client.query(
    `insert into public.invoice_items (
       invoice_id, inventory_item_id, item_type, description,
       quantity, unit, unit_price
     ) values ($1, $2, 'part', 'P6 test propeller', 2, 'ea', 100)
     returning id`,
    [invoiceId, inventoryItemId],
  );
  const invoiceItemId = lineRows[0].id;

  await expectFailure("direct_invoice_stock_movement", () =>
    client.query(
      `insert into public.inventory_movements (
         inventory_item_id, movement_type, quantity, unit_cost,
         invoice_id, created_by
       ) values ($1, 'issue', 1, 40, $2, $3)`,
      [inventoryItemId, invoiceId, profile.id],
    ),
  );
  await expectFailure("direct_invoice_cost", () =>
    client.query(
      `insert into public.invoice_item_costs (
         invoice_item_id, invoice_id, inventory_item_id,
         inventory_movement_id, quantity, unit_cost
       ) values ($1, $2, $3, gen_random_uuid(), 2, 40)`,
      [invoiceItemId, invoiceId, inventoryItemId],
    ),
  );

  await client.query("update public.invoices set status = 'sent' where id = $1", [
    invoiceId,
  ]);
  const { rows: issuedRows } = await client.query(
    `select
       inv.quantity_on_hand,
       iic.quantity as cost_quantity,
       iic.unit_cost,
       iic.total_cost,
       im.id as movement_id,
       im.invoice_id as movement_invoice_id,
       im.quantity as movement_quantity,
       im.unit_cost as movement_unit_cost
     from public.inventory_items inv
     join public.invoice_item_costs iic on iic.inventory_item_id = inv.id
     join public.inventory_movements im on im.id = iic.inventory_movement_id
     where inv.id = $1 and iic.invoice_item_id = $2`,
    [inventoryItemId, invoiceItemId],
  );
  const issued = issuedRows[0];
  if (!issued || issued.movement_invoice_id !== invoiceId) {
    throw new Error("Invoice stock issue or COGS snapshot was not created.");
  }
  expectNumber(issued.quantity_on_hand, 3, "Stock after sale");
  expectNumber(issued.cost_quantity, 2, "COGS quantity");
  expectNumber(issued.unit_cost, 40, "COGS unit cost");
  expectNumber(issued.total_cost, 80, "COGS total");
  expectNumber(issued.movement_quantity, 2, "Sale movement quantity");
  expectNumber(issued.movement_unit_cost, 40, "Sale movement cost");

  await expectNoRows("direct_cost_update", () =>
    client.query(
      "update public.invoice_item_costs set unit_cost = 1 where invoice_item_id = $1 returning invoice_item_id",
      [invoiceItemId],
    ),
  );
  await expectNoRows("immutable_sale_movement", () =>
    client.query(
      "update public.inventory_movements set quantity = 1 where id = $1 returning id",
      [issued.movement_id],
    ),
  );

  const { rows: profitabilityRows } = await client.query(
    "select * from public.project_profitability($1)",
    [projectId],
  );
  expectNumber(profitabilityRows[0]?.invoiced_revenue, 200, "Parts revenue");
  expectNumber(profitabilityRows[0]?.material_cost, 80, "Direct parts COGS");
  expectNumber(profitabilityRows[0]?.gross_profit, 120, "Parts gross profit");
  expectNumber(profitabilityRows[0]?.gross_margin_percent, 60, "Parts margin");

  await assumeDatabaseOwner();
  await client.query("update public.profiles set role = 'sales' where id = $1", [
    profile.id,
  ]);
  await assumeAuthenticatedUser(profile.id);
  const { rows: salesLineRows } = await client.query(
    "select inventory_item_id from public.invoice_items where id = $1",
    [invoiceItemId],
  );
  const { rows: salesCostRows } = await client.query(
    "select total_cost from public.invoice_item_costs where invoice_item_id = $1",
    [invoiceItemId],
  );
  if (salesLineRows.length !== 1 || salesCostRows.length !== 0) {
    throw new Error("Sales SKU visibility or COGS privacy is incorrect.");
  }

  await assumeDatabaseOwner();
  await client.query("update public.profiles set role = 'owner' where id = $1", [
    profile.id,
  ]);
  await assumeAuthenticatedUser(profile.id);
  await client.query("update public.invoices set status = 'void' where id = $1", [
    invoiceId,
  ]);
  const { rows: returnedRows } = await client.query(
    `select
       inv.quantity_on_hand,
       (select count(*)::integer from public.invoice_item_costs iic
        where iic.invoice_id = $2) as active_costs,
       (select count(*)::integer from public.inventory_movements reversal
        where reversal.reverses_movement_id = $3
          and reversal.invoice_id = $2) as returns
     from public.inventory_items inv
     where inv.id = $1`,
    [inventoryItemId, invoiceId, issued.movement_id],
  );
  expectNumber(returnedRows[0]?.quantity_on_hand, 5, "Stock after void");
  expectNumber(returnedRows[0]?.active_costs, 0, "Active COGS after void");
  expectNumber(returnedRows[0]?.returns, 1, "Sale return ledger count");

  await client.query("update public.invoices set status = 'draft' where id = $1", [
    invoiceId,
  ]);
  await client.query("update public.invoice_items set quantity = 6 where id = $1", [
    invoiceItemId,
  ]);
  await expectFailure("insufficient_atomic_sale", () =>
    client.query("update public.invoices set status = 'sent' where id = $1", [
      invoiceId,
    ]),
  );
  const { rows: failedSaleRows } = await client.query(
    `select
       i.status::text,
       inv.quantity_on_hand,
       (select count(*)::integer from public.invoice_item_costs iic
        where iic.invoice_id = i.id) as active_costs
     from public.invoices i
     cross join public.inventory_items inv
     where i.id = $1 and inv.id = $2`,
    [invoiceId, inventoryItemId],
  );
  if (failedSaleRows[0]?.status !== "draft") {
    throw new Error("Insufficient-stock invoice did not remain Draft.");
  }
  expectNumber(failedSaleRows[0]?.quantity_on_hand, 5, "Stock after blocked sale");
  expectNumber(failedSaleRows[0]?.active_costs, 0, "COGS after blocked sale");

  await client.query("update public.invoice_items set quantity = 4 where id = $1", [
    invoiceItemId,
  ]);
  await client.query("update public.invoices set status = 'sent' where id = $1", [
    invoiceId,
  ]);
  const { rows: resentRows } = await client.query(
    `select inv.quantity_on_hand, iic.total_cost
     from public.inventory_items inv
     join public.invoice_item_costs iic on iic.inventory_item_id = inv.id
     where inv.id = $1 and iic.invoice_item_id = $2`,
    [inventoryItemId, invoiceItemId],
  );
  expectNumber(resentRows[0]?.quantity_on_hand, 1, "Stock after resend");
  expectNumber(resentRows[0]?.total_cost, 160, "COGS after resend");

  await client.query("update public.invoices set status = 'void' where id = $1", [
    invoiceId,
  ]);
  const { rows: finalRows } = await client.query(
    `select
       quantity_on_hand,
       (select count(*)::integer from public.inventory_movements im
        where im.invoice_id = $2 and im.movement_type = 'issue') as issues,
       (select count(*)::integer from public.inventory_movements im
        where im.invoice_id = $2 and im.movement_type = 'return_from_project') as returns
     from public.inventory_items where id = $1`,
    [inventoryItemId, invoiceId],
  );
  expectNumber(finalRows[0]?.quantity_on_hand, 5, "Final stock balance");
  expectNumber(finalRows[0]?.issues, 2, "Historical sale issue count");
  expectNumber(finalRows[0]?.returns, 2, "Historical sale return count");

  await client.query("rollback");
  console.log(JSON.stringify({
    projectRef,
    ok: true,
    linkedSkuLines: true,
    atomicStockIssue: true,
    insufficientStockBlocked: true,
    cogsSnapshot: { quantity: 2, unitCost: 40, total: 80 },
    invoiceVoidReturn: true,
    resendAfterVoid: true,
    projectProfitabilityIncludesCogs: true,
    immutableStockLedger: true,
    salesCogsHidden: true,
    rolledBack: true,
  }, null, 2));
} catch (error) {
  try {
    await client.query("rollback");
  } catch {}
  throw error;
} finally {
  await client.end();
}
