import { readFile } from "node:fs/promises";
import { connectToSupabaseDatabase } from "./lib/supabase-db.mjs";

const migrationSql = await readFile(
  "supabase/migrations/20260824000005_counter_sales.sql",
  "utf8",
);
const { client, projectRef } = await connectToSupabaseDatabase();

async function assumeAuthenticatedUser(profileId) {
  const claims = JSON.stringify({ sub: profileId, role: "authenticated" });
  await client.query("set local role authenticated");
  await client.query("select set_config('request.jwt.claims', $1, true)", [claims]);
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [profileId]);
  await client.query("select set_config('request.jwt.claim.role', 'authenticated', true)");
}

async function assumeDatabaseOwner() {
  await client.query("reset role");
  await client.query("select set_config('request.jwt.claims', '{}', true)");
  await client.query("select set_config('request.jwt.claim.sub', '', true)");
}

async function setRole(profileId, role) {
  await assumeDatabaseOwner();
  await client.query("update public.profiles set role = $2 where id = $1", [profileId, role]);
  await assumeAuthenticatedUser(profileId);
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

function expectNumber(actual, expected, label) {
  if (Number(actual) !== expected) {
    throw new Error(`${label} expected ${expected}, received ${actual}.`);
  }
}

try {
  await client.query("begin");
  await client.query(migrationSql);

  const { rows: profileRows } = await client.query(`
    select id from public.profiles
    where status = 'active'
    order by created_at
    limit 1
  `);
  const profile = profileRows[0];
  if (!profile) throw new Error("An active employee is required.");
  await setRole(profile.id, "owner");

  const testId = crypto.randomUUID();
  const { rows: customerRows } = await client.query(
    `insert into public.clients (name, type, created_by)
     values ($1, 'business', $2) returning id`,
    [`P7 counter customer ${testId}`, profile.id],
  );
  const customerId = customerRows[0].id;
  const { rows: stockRows } = await client.query(
    `insert into public.inventory_items (
       sku, name, category, unit, selling_price, reorder_point, created_by
     ) values ($1, 'P7 test propeller', 'part', 'ea', 100, 1, $2)
     returning id`,
    [`P7-SKU-${testId}`, profile.id],
  );
  const inventoryItemId = stockRows[0].id;
  await client.query(
    "select public.adjust_inventory($1, 'in', 5, 40, 'P7 opening stock')",
    [inventoryItemId],
  );

  await expectFailure("direct_sale_insert", () => client.query(
    `insert into public.counter_sales (
       sale_number, customer_name, payment_method, subtotal,
       tax_rate_percent, tax_amount, total, created_by
     ) values ($1, 'Forged sale', 'cash', 1, 0, 0, 1, $2)`,
    [`FORGED-${testId}`, profile.id],
  ));

  const saleItems = JSON.stringify([{
    inventory_item_id: inventoryItemId,
    quantity: 2,
    unit_price: 100,
  }]);
  const { rows: saleRows } = await client.query(
    `select public.complete_counter_sale(
       $1::uuid, $2::text, $3::public.invoice_payment_method,
       $4::text, $5::numeric, $6::jsonb
     ) as sale_id`,
    [customerId, null, "card", "TERM-P7", 12, saleItems],
  );
  const saleId = saleRows[0]?.sale_id;
  if (!saleId) throw new Error("Counter sale was not created.");

  const { rows: completedRows } = await client.query(
    `select
       cs.sale_number,
       cs.customer_name,
       cs.status::text,
       cs.subtotal,
       cs.tax_amount,
       cs.total,
       csi.quantity,
       csi.unit_price,
       csi.line_total,
       inv.quantity_on_hand,
       csic.unit_cost,
       csic.total_cost,
       im.counter_sale_id as movement_sale_id,
       im.movement_type::text as movement_type
     from public.counter_sales cs
     join public.counter_sale_items csi on csi.counter_sale_id = cs.id
     join public.counter_sale_item_costs csic on csic.counter_sale_item_id = csi.id
     join public.inventory_movements im on im.id = csic.issue_movement_id
     join public.inventory_items inv on inv.id = csi.inventory_item_id
     where cs.id = $1`,
    [saleId],
  );
  const completed = completedRows[0];
  if (!completed || !completed.sale_number.startsWith("CS-")) {
    throw new Error("Counter sale receipt number or linked records are missing.");
  }
  if (
    completed.customer_name !== `P7 counter customer ${testId}` ||
    completed.status !== "completed" ||
    completed.movement_sale_id !== saleId ||
    completed.movement_type !== "issue"
  ) throw new Error("Counter sale snapshots or stock reference are incorrect.");
  expectNumber(completed.subtotal, 200, "Sale subtotal");
  expectNumber(completed.tax_amount, 24, "Sale tax");
  expectNumber(completed.total, 224, "Sale total");
  expectNumber(completed.quantity, 2, "Sale quantity");
  expectNumber(completed.unit_price, 100, "Sale unit price");
  expectNumber(completed.line_total, 200, "Sale line total");
  expectNumber(completed.quantity_on_hand, 3, "Stock after counter sale");
  expectNumber(completed.unit_cost, 40, "Counter sale COGS unit cost");
  expectNumber(completed.total_cost, 80, "Counter sale COGS total");

  await expectFailure("direct_counter_sale_movement", () => client.query(
    `insert into public.inventory_movements (
       inventory_item_id, movement_type, quantity, unit_cost,
       counter_sale_id, created_by
     ) values ($1, 'issue', 1, 40, $2, $3)`,
    [inventoryItemId, saleId, profile.id],
  ));

  const { rows: insufficientBeforeRows } = await client.query(
    "select count(*)::integer as sales from public.counter_sales",
  );
  const insufficientItems = JSON.stringify([{
    inventory_item_id: inventoryItemId,
    quantity: 4,
    unit_price: 100,
  }]);
  await expectFailure("insufficient_atomic_sale", () => client.query(
    `select public.complete_counter_sale(
       null::uuid, 'Blocked sale'::text, 'cash'::public.invoice_payment_method,
       null::text, 12::numeric, $1::jsonb
     )`,
    [insufficientItems],
  ));
  const { rows: insufficientAfterRows } = await client.query(
    `select
       (select count(*)::integer from public.counter_sales) as sales,
       quantity_on_hand
     from public.inventory_items where id = $1`,
    [inventoryItemId],
  );
  expectNumber(
    insufficientAfterRows[0]?.sales,
    insufficientBeforeRows[0]?.sales,
    "Sale count after blocked sale",
  );
  expectNumber(insufficientAfterRows[0]?.quantity_on_hand, 3, "Stock after blocked sale");

  await setRole(profile.id, "parts");
  const { rows: partsPermissionRows } = await client.query(
    `select
       public.can_manage_counter_sales() as can_manage,
       (select count(*)::integer from public.counter_sales where id = $1) as sale_rows,
       (select count(*)::integer from public.counter_sale_item_costs where counter_sale_id = $1) as cost_rows,
       (select count(*)::integer from public.counter_sale_customer_directory() where id = $2) as customer_rows`,
    [saleId, customerId],
  );
  if (partsPermissionRows[0]?.can_manage !== true) {
    throw new Error("Parts role cannot manage counter sales.");
  }
  expectNumber(partsPermissionRows[0]?.sale_rows, 1, "Parts receipt visibility");
  expectNumber(partsPermissionRows[0]?.cost_rows, 0, "Parts COGS visibility");
  expectNumber(partsPermissionRows[0]?.customer_rows, 1, "Parts customer directory");

  await setRole(profile.id, "sales");
  const { rows: salesVisibilityRows } = await client.query(
    `select
       (select count(*)::integer from public.counter_sales where id = $1) as sale_rows,
       (select count(*)::integer from public.counter_sale_items where counter_sale_id = $1) as item_rows,
       (select count(*)::integer from public.counter_sale_item_costs where counter_sale_id = $1) as cost_rows,
       (select count(*)::integer from public.counter_sale_customer_directory() where id = $2) as customer_rows`,
    [saleId, customerId],
  );
  expectNumber(salesVisibilityRows[0]?.sale_rows, 1, "Sales receipt visibility");
  expectNumber(salesVisibilityRows[0]?.item_rows, 1, "Sales line visibility");
  expectNumber(salesVisibilityRows[0]?.cost_rows, 0, "Sales COGS visibility");
  expectNumber(salesVisibilityRows[0]?.customer_rows, 1, "Sales customer directory");

  await client.query("select public.void_counter_sale($1, $2)", [
    saleId,
    "Customer returned the part",
  ]);
  await setRole(profile.id, "owner");
  const { rows: voidRows } = await client.query(
    `select
       cs.status::text,
       cs.void_reason,
       inv.quantity_on_hand,
       csic.return_movement_id,
       reversal.reverses_movement_id,
       reversal.counter_sale_id
     from public.counter_sales cs
     join public.counter_sale_item_costs csic on csic.counter_sale_id = cs.id
     join public.inventory_movements reversal on reversal.id = csic.return_movement_id
     join public.inventory_items inv on inv.id = csic.inventory_item_id
     where cs.id = $1`,
    [saleId],
  );
  const voided = voidRows[0];
  if (
    !voided ||
    voided.status !== "void" ||
    voided.void_reason !== "Customer returned the part" ||
    !voided.return_movement_id ||
    voided.counter_sale_id !== saleId ||
    !voided.reverses_movement_id
  ) throw new Error(`Counter sale void audit is incomplete: ${JSON.stringify(voided)}`);
  expectNumber(voided.quantity_on_hand, 5, "Stock after counter sale void");
  await expectFailure("double_void", () =>
    client.query("select public.void_counter_sale($1, 'Duplicate return')", [saleId]),
  );

  const { rows: invoiceRows } = await client.query(
    `insert into public.invoices (
       invoice_number, client_id, title, created_by
     ) values ($1, $2, 'P7 invoice regression', $3)
     returning id`,
    [`TEST-P7-${testId}`, customerId, profile.id],
  );
  const invoiceId = invoiceRows[0].id;
  await client.query(
    `insert into public.invoice_items (
       invoice_id, inventory_item_id, item_type, description,
       quantity, unit, unit_price
     ) values ($1, $2, 'part', 'P7 invoice regression part', 1, 'ea', 100)`,
    [invoiceId, inventoryItemId],
  );
  await client.query("update public.invoices set status = 'sent' where id = $1", [invoiceId]);
  const { rows: invoiceIssueRows } = await client.query(
    `select
       inv.quantity_on_hand,
       im.invoice_id,
       im.counter_sale_id
     from public.inventory_items inv
     join public.inventory_movements im on im.inventory_item_id = inv.id
     where inv.id = $1 and im.invoice_id = $2 and im.movement_type = 'issue'`,
    [inventoryItemId, invoiceId],
  );
  expectNumber(invoiceIssueRows[0]?.quantity_on_hand, 4, "Stock after invoice regression sale");
  if (
    invoiceIssueRows[0]?.invoice_id !== invoiceId ||
    invoiceIssueRows[0]?.counter_sale_id !== null
  ) throw new Error("Invoice stock reference regressed after counter sales migration.");
  await client.query("update public.invoices set status = 'void' where id = $1", [invoiceId]);
  const { rows: invoiceVoidRows } = await client.query(
    "select quantity_on_hand from public.inventory_items where id = $1",
    [inventoryItemId],
  );
  expectNumber(invoiceVoidRows[0]?.quantity_on_hand, 5, "Stock after invoice regression void");

  await setRole(profile.id, "welder");
  const { rows: unauthorizedRows } = await client.query(
    `select
       (select count(*)::integer from public.counter_sales where id = $1) as sale_rows,
       (select count(*)::integer from public.counter_sale_items where counter_sale_id = $1) as item_rows`,
    [saleId],
  );
  expectNumber(unauthorizedRows[0]?.sale_rows, 0, "Unauthorized receipt visibility");
  expectNumber(unauthorizedRows[0]?.item_rows, 0, "Unauthorized line visibility");
  await expectFailure("unauthorized_sale", () => client.query(
    `select public.complete_counter_sale(
       null::uuid, 'Forged sale'::text, 'cash'::public.invoice_payment_method,
       null::text, 0::numeric, $1::jsonb
     )`,
    [JSON.stringify([{ inventory_item_id: inventoryItemId, quantity: 1, unit_price: 1 }])],
  ));

  await client.query("rollback");
  console.log(JSON.stringify({
    projectRef,
    ok: true,
    atomicPaidReceipt: true,
    receiptSnapshot: true,
    liveStockIssue: true,
    insufficientStockBlocked: true,
    cogsProtectedFromSales: true,
    partsCounterAccessWithoutCogs: true,
    customerDirectoryForCounterRoles: true,
    salesCanVoidWithAudit: true,
    stockReturnLinked: true,
    invoiceStockWorkflowPreserved: true,
    unauthorizedRoleBlocked: true,
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
