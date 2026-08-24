import { readFile } from "node:fs/promises";
import { connectToSupabaseDatabase } from "./lib/supabase-db.mjs";

const migrationPaths = [
  "supabase/migrations/20260823000008_inventory_purchasing.sql",
  "supabase/migrations/20260823000009_inventory_integrity_hardening.sql",
];
const migrationSql = (
  await Promise.all(migrationPaths.map((path) => readFile(path, "utf8")))
).join("\n");
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
    return true;
  }
  await client.query(`rollback to savepoint ${savepoint}`);
  throw new Error(`${label} was not blocked.`);
}

try {
  await client.query("begin");
  await client.query(migrationSql);

  const { rows: profileRows } = await client.query(`
    select id, role::text as role
    from public.profiles
    where status = 'active'
    order by created_at
    limit 1
  `);
  const { rows: projectRows } = await client.query(`
    select id from public.projects order by created_at limit 1
  `);
  const profile = profileRows[0];
  const projectId = projectRows[0]?.id;
  if (!profile || !projectId) {
    throw new Error("An active employee and project are required.");
  }

  await client.query("update public.profiles set role = 'owner' where id = $1", [
    profile.id,
  ]);

  const testId = crypto.randomUUID();
  const { rows: supplierRows } = await client.query(
    `insert into public.suppliers (name, created_by)
     values ($1, $2) returning id`,
    [`P4 supplier ${testId}`, profile.id],
  );
  const supplierId = supplierRows[0].id;
  const { rows: itemRows } = await client.query(
    `insert into public.inventory_items (
       sku, name, category, unit, reorder_point, preferred_supplier_id, created_by
     ) values ($1, 'P4 test part', 'part', 'ea', 3, $2, $3)
     returning id`,
    [`TEST-${testId}`, supplierId, profile.id],
  );
  const inventoryItemId = itemRows[0].id;

  await assumeAuthenticatedUser(profile.id);
  const { rows: managerAccessRows } = await client.query(`
    select
      public.can_manage_inventory() as manage,
      public.can_view_inventory() as inventory,
      public.can_view_purchasing() as purchasing
  `);
  if (
    !managerAccessRows[0]?.manage ||
    !managerAccessRows[0]?.inventory ||
    !managerAccessRows[0]?.purchasing
  ) {
    throw new Error("Inventory manager permissions were not recognized.");
  }

  const poNumber = `TEST-PO-${testId}`;
  const { rows: purchaseOrderRows } = await client.query(
    `insert into public.purchase_orders (
       po_number, supplier_id, order_date, expected_date, created_by
     ) values ($1, $2, current_date, current_date + 7, $3)
     returning id`,
    [poNumber, supplierId, profile.id],
  );
  const purchaseOrderId = purchaseOrderRows[0].id;
  const { rows: lineRows } = await client.query(
    `insert into public.purchase_order_items (
       purchase_order_id, inventory_item_id, description,
       quantity, unit, unit_cost
     ) values ($1, $2, 'P4 test part', 10, 'ea', 20)
     returning id`,
    [purchaseOrderId, inventoryItemId],
  );
  const purchaseOrderItemId = lineRows[0].id;

  await expectFailure("direct_subtotal_update", () =>
    client.query(
      "update public.purchase_orders set subtotal = 999 where id = $1",
      [purchaseOrderId],
    ),
  );

  await expectFailure("direct_balance_update", () =>
    client.query(
      "update public.inventory_items set quantity_on_hand = 99 where id = $1",
      [inventoryItemId],
    ),
  );

  await client.query(
    "update public.purchase_orders set status = 'ordered' where id = $1",
    [purchaseOrderId],
  );
  await client.query(
    "select public.receive_purchase_order_item($1, 4, 'First delivery')",
    [purchaseOrderItemId],
  );
  const { rows: partialRows } = await client.query(
    `select status::text, subtotal
     from public.purchase_orders where id = $1`,
    [purchaseOrderId],
  );
  if (
    partialRows[0]?.status !== "partially_received" ||
    Number(partialRows[0]?.subtotal) !== 200
  ) {
    throw new Error("Partial receiving or purchase order totals are incorrect.");
  }
  await client.query(
    "select public.receive_purchase_order_item($1, 6, 'Final delivery')",
    [purchaseOrderItemId],
  );

  await client.query(
    "select public.adjust_inventory($1, 'out', 1, null, 'Cycle count correction')",
    [inventoryItemId],
  );

  const workOrderNumber = `TEST-WO-${testId}`;
  const { rows: workOrderRows } = await client.query(
    `insert into public.work_orders (
       work_order_number, project_id, title, service_category, status, created_by
     ) values ($1, $2, 'P4 stock issue check', 'parts', 'ready', $3)
     returning id`,
    [workOrderNumber, projectId, profile.id],
  );
  const workOrderId = workOrderRows[0].id;
  const { rows: issueRows } = await client.query(
    "select * from public.issue_inventory_to_work_order($1, $2, 2, 'Issued to test job')",
    [inventoryItemId, workOrderId],
  );
  const materialEntryId = issueRows[0]?.material_entry_id;
  const issueMovementId = issueRows[0]?.movement_id;
  if (!materialEntryId || !issueMovementId) {
    throw new Error("Stock issue did not create a material entry.");
  }
  await expectFailure("forged_warehouse_material_link", () =>
    client.query(
      `insert into public.material_entries (
         work_order_id, description, quantity, unit, unit_cost, entered_by,
         inventory_item_id, inventory_movement_id
       ) values ($1, 'Forged warehouse link', 1, 'ea', 20, $2, $3, $4)`,
      [workOrderId, profile.id, inventoryItemId, issueMovementId],
    ),
  );

  await expectFailure("warehouse_material_delete", () =>
    client.query("delete from public.material_entries where id = $1", [
      materialEntryId,
    ]),
  );
  await client.query(
    "select public.reverse_inventory_issue($1, 'P4 reversal check')",
    [materialEntryId],
  );
  await expectFailure("duplicate_issue_reversal", () =>
    client.query("select public.reverse_inventory_issue($1, 'Duplicate')", [
      materialEntryId,
    ]),
  );
  await expectFailure("negative_stock", () =>
    client.query(
      "select public.adjust_inventory($1, 'out', 100, null, 'Invalid negative stock')",
      [inventoryItemId],
    ),
  );

  const { rows: ledgerRows } = await client.query(
    `select
       i.quantity_on_hand,
       i.average_cost,
       po.status::text as purchase_order_status,
       poi.quantity_received,
       m.reversed_at is not null as material_reversed,
       (select count(*)::integer from public.inventory_movements im
        where im.inventory_item_id = i.id) as movement_count
     from public.inventory_items i
     cross join public.purchase_orders po
     join public.purchase_order_items poi on poi.purchase_order_id = po.id
     join public.material_entries m on m.id = $4
     where i.id = $1 and po.id = $2 and poi.id = $3`,
    [inventoryItemId, purchaseOrderId, purchaseOrderItemId, materialEntryId],
  );
  const ledger = ledgerRows[0];
  if (
    Number(ledger?.quantity_on_hand) !== 9 ||
    Number(ledger?.average_cost) !== 20 ||
    ledger?.purchase_order_status !== "received" ||
    Number(ledger?.quantity_received) !== 10 ||
    !ledger?.material_reversed ||
    Number(ledger?.movement_count) !== 5
  ) {
    throw new Error(`Inventory ledger totals are incorrect: ${JSON.stringify(ledger)}`);
  }

  await assumeDatabaseOwner();
  await client.query("update public.profiles set role = 'accounting' where id = $1", [
    profile.id,
  ]);
  await assumeAuthenticatedUser(profile.id);
  const { rows: accountingAccessRows } = await client.query(`
    select
      public.can_manage_inventory() as manage,
      public.can_view_inventory() as inventory,
      public.can_view_purchasing() as purchasing
  `);
  if (
    accountingAccessRows[0]?.manage ||
    !accountingAccessRows[0]?.inventory ||
    !accountingAccessRows[0]?.purchasing
  ) {
    throw new Error("Accounting inventory permissions are incorrect.");
  }
  const { rows: accountingVisibleRows } = await client.query(
    "select id from public.purchase_orders where id = $1",
    [purchaseOrderId],
  );
  if (accountingVisibleRows.length !== 1) {
    throw new Error("Accounting cannot read purchase orders.");
  }
  await expectFailure("accounting_adjustment", () =>
    client.query(
      "select public.adjust_inventory($1, 'in', 1, 20, 'Unauthorized')",
      [inventoryItemId],
    ),
  );

  await assumeDatabaseOwner();
  await client.query("update public.profiles set role = 'sales' where id = $1", [
    profile.id,
  ]);
  await assumeAuthenticatedUser(profile.id);
  const { rows: salesAccessRows } = await client.query(`
    select
      public.can_manage_inventory() as manage,
      public.can_view_inventory() as inventory,
      public.can_view_purchasing() as purchasing
  `);
  if (
    salesAccessRows[0]?.manage ||
    !salesAccessRows[0]?.inventory ||
    salesAccessRows[0]?.purchasing
  ) {
    throw new Error("Sales inventory permissions are incorrect.");
  }
  const { rows: salesItemRows } = await client.query(
    "select id from public.inventory_items where id = $1",
    [inventoryItemId],
  );
  const { rows: salesSupplierRows } = await client.query(
    "select id from public.suppliers where id = $1",
    [supplierId],
  );
  if (salesItemRows.length !== 1 || salesSupplierRows.length !== 0) {
    throw new Error("Sales catalog access exposed purchasing data.");
  }

  await assumeDatabaseOwner();
  await client.query("update public.profiles set role = 'parts' where id = $1", [
    profile.id,
  ]);
  await assumeAuthenticatedUser(profile.id);
  const { rows: partsAccessRows } = await client.query(
    "select public.can_manage_inventory() as manage",
  );
  if (!partsAccessRows[0]?.manage) {
    throw new Error("Parts staff cannot manage inventory.");
  }

  await client.query("rollback");
  console.log(
    JSON.stringify(
      {
        projectRef,
        ok: true,
        purchaseOrderNumber: poNumber,
        managerAccess: true,
        immutableLedger: true,
        partialReceiving: true,
        projectIssueAndReversal: true,
        accountingReadOnly: true,
        salesCatalogOnly: true,
        partsManagement: true,
        totals: {
          purchaseOrder: 200,
          quantityOnHand: 9,
          averageCost: 20,
          movements: 5,
        },
        rolledBack: true,
      },
      null,
      2,
    ),
  );
} catch (error) {
  try {
    await client.query("rollback");
  } catch {}
  throw error;
} finally {
  await client.end();
}
