import { connectToSupabaseDatabase } from "./lib/supabase-db.mjs";

const expectedTables = [
  "clients",
  "client_contacts",
  "drawing_markups",
  "drawing_pages",
  "drawings",
  "estimate_items",
  "estimates",
  "gallery_items",
  "invoice_items",
  "invoice_payments",
  "invoices",
  "inventory_items",
  "inventory_movements",
  "material_entries",
  "markup_comments",
  "markup_photos",
  "profiles",
  "project_members",
  "project_financial_settings",
  "projects",
  "opportunities",
  "purchase_order_items",
  "purchase_orders",
  "suppliers",
  "time_entries",
  "work_order_assignments",
  "work_orders",
];

const expectedBuckets = [
  "avatars",
  "drawing-tiles",
  "markup-photos",
  "project-covers",
  "project-drawings",
  "project-gallery",
  "project-models",
];

const expectedProfileColumns = ["phone", "job_title", "specialties"];
const expectedClientColumns = [
  "type",
  "created_by",
  "updated_at",
];
const sensitiveClientColumns = [
  "contact_name",
  "email",
  "phone",
  "billing_address",
  "service_address",
  "notes",
];
const expectedClientContactColumns = [
  "client_id",
  ...sensitiveClientColumns,
  "created_at",
  "updated_at",
];
const expectedMaterialEntryColumns = [
  "inventory_item_id",
  "inventory_movement_id",
  "reversed_at",
  "reversed_by",
];
const expectedRoles = [
  "owner",
  "project_manager",
  "sales",
  "draftsperson",
  "welder",
  "painter",
  "mechanic",
  "installer",
  "parts",
  "accounting",
];

const { client, projectRef } = await connectToSupabaseDatabase();

try {
  const { rows: tableRows } = await client.query(`
    select tablename
    from pg_catalog.pg_tables
    where schemaname = 'public'
    order by tablename
  `);
  const tables = tableRows.map(({ tablename }) => tablename);

  const { rows: bucketRows } = await client.query(`
    select id
    from storage.buckets
    order by id
  `);
  const buckets = bucketRows.map(({ id }) => id);

  const { rows: policyRows } = await client.query(`
    select schemaname, tablename, policyname
    from pg_catalog.pg_policies
    where schemaname in ('public', 'storage')
    order by schemaname, tablename, policyname
  `);
  const policyKeys = policyRows.map(
    ({ schemaname, tablename, policyname }) =>
      `${schemaname}.${tablename}.${policyname}`,
  );
  const clientContactPolicies = [
    "public.client_contacts.client_contacts_manage",
    "public.client_contacts.client_contacts_accounting_read",
  ].every((policy) => policyKeys.includes(policy));

  const { rows: clientContactSecurityRows } = await client.query(`
    select relrowsecurity
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'client_contacts'
  `);
  const clientContactRls = clientContactSecurityRows[0]?.relrowsecurity === true;
  const operationsPolicyNames = [
    "public.work_orders.work_orders_read",
    "public.work_orders.work_orders_manage",
    "public.work_order_assignments.work_order_assignments_read",
    "public.work_order_assignments.work_order_assignments_manage",
    "public.time_entries.time_entries_read",
    "public.time_entries.time_entries_manage",
    "public.time_entries.time_entries_self_insert",
    "public.time_entries.time_entries_self_update",
    "public.time_entries.time_entries_self_delete",
    "public.material_entries.material_entries_read",
    "public.material_entries.material_entries_manage",
    "public.material_entries.material_entries_self_insert",
    "public.material_entries.material_entries_self_update",
    "public.material_entries.material_entries_self_delete",
  ];
  const operationsPolicies = operationsPolicyNames.every((policy) =>
    policyKeys.includes(policy),
  );
  const inventoryPolicyNames = [
    "public.suppliers.suppliers_view",
    "public.suppliers.suppliers_manage",
    "public.inventory_items.inventory_items_view",
    "public.inventory_items.inventory_items_manage",
    "public.purchase_orders.purchase_orders_view",
    "public.purchase_orders.purchase_orders_manage",
    "public.purchase_order_items.purchase_order_items_view",
    "public.purchase_order_items.purchase_order_items_manage",
    "public.inventory_movements.inventory_movements_view",
  ];
  const inventoryPolicies = inventoryPolicyNames.every((policy) =>
    policyKeys.includes(policy),
  );
  const billingPolicyNames = [
    "public.invoices.invoices_view",
    "public.invoices.invoices_insert",
    "public.invoices.invoices_update",
    "public.invoice_items.invoice_items_view",
    "public.invoice_items.invoice_items_insert",
    "public.invoice_items.invoice_items_update",
    "public.invoice_items.invoice_items_delete",
    "public.invoice_payments.invoice_payments_view",
    "public.project_financial_settings.project_financial_settings_view",
    "public.project_financial_settings.project_financial_settings_manage",
  ];
  const billingPolicies = billingPolicyNames.every((policy) =>
    policyKeys.includes(policy),
  );
  const projectAccountingPolicyAbsent = !policyKeys.includes(
    "public.projects.projects_operations_accounting_read",
  );

  const { rows: operationsSecurityRows } = await client.query(`
    select relname, relrowsecurity
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'work_orders', 'work_order_assignments', 'time_entries', 'material_entries'
      )
  `);
  const operationsRls =
    operationsSecurityRows.length === 4 &&
    operationsSecurityRows.every(({ relrowsecurity }) => relrowsecurity === true);

  const { rows: inventorySecurityRows } = await client.query(`
    select relname, relrowsecurity
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'suppliers', 'inventory_items', 'purchase_orders',
        'purchase_order_items', 'inventory_movements'
      )
  `);
  const inventoryRls =
    inventorySecurityRows.length === 5 &&
    inventorySecurityRows.every(({ relrowsecurity }) => relrowsecurity === true);

  const { rows: billingSecurityRows } = await client.query(`
    select relname, relrowsecurity
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'invoices', 'invoice_items', 'invoice_payments',
        'project_financial_settings'
      )
  `);
  const billingRls =
    billingSecurityRows.length === 4 &&
    billingSecurityRows.every(({ relrowsecurity }) => relrowsecurity === true);

  const { rows: profileColumnRows } = await client.query(`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
  `);
  const profileColumns = profileColumnRows.map(({ column_name }) => column_name);

  const { rows: clientColumnRows } = await client.query(`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'clients'
  `);
  const clientColumns = clientColumnRows.map(({ column_name }) => column_name);

  const { rows: clientContactColumnRows } = await client.query(`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'client_contacts'
  `);
  const clientContactColumns = clientContactColumnRows.map(
    ({ column_name }) => column_name,
  );

  const { rows: materialEntryColumnRows } = await client.query(`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'material_entries'
  `);
  const materialEntryColumns = materialEntryColumnRows.map(
    ({ column_name }) => column_name,
  );

  const { rows: roleRows } = await client.query(`
    select e.enumlabel
    from pg_catalog.pg_type t
    join pg_catalog.pg_enum e on e.enumtypid = t.oid
    join pg_catalog.pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'user_role'
    order by e.enumsortorder
  `);
  const roles = roleRows.map(({ enumlabel }) => enumlabel);

  const { rows: triggerRows } = await client.query(`
    select trigger_name, event_manipulation
    from information_schema.triggers
    where event_object_schema = 'public'
      and event_object_table = 'profiles'
      and trigger_name = 'profiles_protect_security_fields'
  `);

  const { rows: accessFunctionRows } = await client.query(`
    select proname
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('is_active_user', 'is_admin', 'protect_profile_security_fields')
  `);

  const { rows: salesFunctionRows } = await client.query(`
    select proname
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'can_manage_sales',
        'can_view_sales',
        'calculate_estimate_totals',
        'recalculate_estimate_subtotal',
        'convert_opportunity_to_project'
      )
  `);

  const { rows: operationsFunctionRows } = await client.query(`
    select proname
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'can_manage_operations',
        'can_view_work_order',
        'can_log_work_order',
        'operations_employee_directory',
        'operations_project_directory',
        'update_assigned_work_order_status',
        'enforce_work_order_status_transition',
        'validate_time_entry'
      )
  `);

  const { rows: inventoryFunctionRows } = await client.query(`
    select proname
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'can_manage_inventory',
        'can_view_inventory',
        'can_view_purchasing',
        'apply_inventory_movement',
        'enforce_purchase_order_item_edit',
        'enforce_purchase_order_status_transition',
        'receive_purchase_order_item',
        'adjust_inventory',
        'issue_inventory_to_work_order',
        'reverse_inventory_issue',
        'protect_purchase_order_fields',
        'validate_inventory_material_entry'
      )
  `);

  const { rows: billingFunctionRows } = await client.query(`
    select proname
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'can_manage_billing',
        'can_view_billing',
        'can_view_profitability',
        'can_manage_project_financials',
        'calculate_invoice_totals',
        'recalculate_invoice_subtotal',
        'enforce_invoice_status_transition',
        'create_invoice_from_estimate',
        'record_invoice_payment',
        'reverse_invoice_payment',
        'billing_project_directory',
        'billing_estimate_directory',
        'project_profitability'
      )
  `);

  const { rows: mismatchRows } = await client.query(`
    select count(*)::integer as count
    from public.projects p
    where p.drawing_count is distinct from (
      select count(*)::integer
      from public.drawings d
      where d.project_id = p.id
    )
  `);

  const { rows: customerIntegrityRows } = await client.query(`
    select
      (select count(*)::integer from public.clients) as clients,
      (select count(*)::integer from public.client_contacts) as contacts,
      (
        select count(*)::integer
        from public.clients c
        left join public.client_contacts cc on cc.client_id = c.id
        where cc.client_id is null
      ) as missing_contacts
  `);

  const { rows: operationsIntegrityRows } = await client.query(`
    select
      (select count(*)::integer from public.work_orders) as work_orders,
      (select count(*)::integer from public.work_order_assignments) as assignments,
      (select count(*)::integer from public.time_entries) as time_entries,
      (select count(*)::integer from public.material_entries) as material_entries,
      (
        select count(*)::integer
        from public.work_order_assignments a
        join public.work_orders w on w.id = a.work_order_id
        left join public.project_members m
          on m.project_id = w.project_id and m.profile_id = a.profile_id
        where m.profile_id is null
      ) as missing_project_members,
      (
        select count(*)::integer
        from (
          select profile_id, work_date
          from public.time_entries
          group by profile_id, work_date
          having sum(hours) > 24
        ) invalid_days
      ) as invalid_time_days,
      (
        select count(*)::integer
        from public.work_order_assignments a
        join public.profiles p on p.id = a.profile_id
        where p.status::text <> 'active'
          or p.role::text not in (
            'owner', 'project_manager', 'draftsperson', 'welder', 'painter',
            'mechanic', 'installer', 'parts'
          )
      ) as invalid_assignments
  `);

  const { rows: inventoryIntegrityRows } = await client.query(`
    select
      (select count(*)::integer from public.suppliers) as suppliers,
      (select count(*)::integer from public.inventory_items) as inventory_items,
      (select count(*)::integer from public.purchase_orders) as purchase_orders,
      (select count(*)::integer from public.purchase_order_items) as purchase_order_items,
      (select count(*)::integer from public.inventory_movements) as inventory_movements,
      (
        select count(*)::integer
        from public.inventory_items
        where quantity_on_hand < 0 or average_cost < 0
      ) as invalid_stock_balances,
      (
        select count(*)::integer
        from public.purchase_order_items
        where quantity_received < 0 or quantity_received > quantity
      ) as invalid_receipts,
      (
        select count(*)::integer
        from public.purchase_orders po
        where po.subtotal is distinct from coalesce((
          select sum(poi.line_total)
          from public.purchase_order_items poi
          where poi.purchase_order_id = po.id
        ), 0)
      ) as purchase_order_total_mismatches,
      (
        select count(*)::integer
        from public.inventory_movements im
        join public.work_orders w on w.id = im.work_order_id
        where im.project_id is distinct from w.project_id
      ) as movement_project_mismatches,
      (
        select count(*)::integer
        from public.material_entries m
        left join public.inventory_movements im on im.id = m.inventory_movement_id
        where (m.inventory_item_id is null) <> (m.inventory_movement_id is null)
          or (m.inventory_movement_id is not null and (
            im.id is null
            or im.inventory_item_id is distinct from m.inventory_item_id
            or im.work_order_id is distinct from m.work_order_id
          ))
      ) as invalid_material_links,
      (
        select count(*)::integer
        from public.material_entries m
        where m.reversed_at is not null
          and not exists (
            select 1
            from public.inventory_movements reversal
            where reversal.reverses_movement_id = m.inventory_movement_id
              and reversal.movement_type = 'return_from_project'
          )
      ) as invalid_reversals
  `);

  const { rows: billingIntegrityRows } = await client.query(`
    select
      (select count(*)::integer from public.invoices) as invoices,
      (select count(*)::integer from public.invoice_items) as invoice_items,
      (select count(*)::integer from public.invoice_payments) as invoice_payments,
      (select count(*)::integer from public.project_financial_settings)
        as project_financial_settings,
      (
        select count(*)::integer
        from public.invoices i
        where i.subtotal is distinct from coalesce((
          select sum(ii.line_total)
          from public.invoice_items ii
          where ii.invoice_id = i.id
        ), 0)
          or i.tax_amount is distinct from round(
            (i.subtotal - i.discount_amount) * i.tax_rate_percent / 100,
            2
          )
          or i.total is distinct from round(
            i.subtotal - i.discount_amount + i.tax_amount,
            2
          )
          or i.balance_due is distinct from case
            when i.status = 'void' then 0
            else round(i.total - i.amount_paid, 2)
          end
      ) as invoice_total_mismatches,
      (
        select count(*)::integer
        from public.invoices i
        where i.amount_paid is distinct from coalesce((
          select sum(ip.amount)
          from public.invoice_payments ip
          where ip.invoice_id = i.id and ip.reversed_at is null
        ), 0)
      ) as payment_ledger_mismatches,
      (
        select count(*)::integer
        from public.invoices i
        join public.projects p on p.id = i.project_id
        where i.client_id is distinct from p.client_id
      ) as project_customer_mismatches,
      (
        select count(*)::integer
        from public.invoices i
        where (i.status = 'paid' and (i.total <= 0 or i.amount_paid <> i.total))
          or (i.status = 'partially_paid'
              and (i.amount_paid <= 0 or i.amount_paid >= i.total))
          or (i.status in ('draft', 'sent', 'void') and i.amount_paid <> 0)
      ) as invoice_status_mismatches,
      (
        select count(*)::integer
        from public.invoices i
        left join public.estimates e on e.id = i.source_estimate_id
        left join public.opportunities o on o.id = e.opportunity_id
        where i.source_estimate_id is not null
          and (
            e.id is null
            or e.status <> 'accepted'
            or e.client_id is distinct from i.client_id
            or o.project_id is distinct from i.project_id
          )
      ) as source_estimate_mismatches,
      (
        select count(*)::integer
        from public.invoices i
        where (i.status in ('sent', 'partially_paid', 'paid') and i.sent_at is null)
          or (i.status = 'paid' and i.paid_at is null)
          or (i.status <> 'paid' and i.paid_at is not null)
          or (i.status = 'void' and i.voided_at is null)
          or (i.status <> 'void' and i.voided_at is not null)
      ) as status_timestamp_mismatches
  `);

  const { rows: migrationTableRows } = await client.query(`
    select to_regclass('supabase_migrations.schema_migrations') is not null as exists
  `);
  const migrationRows = migrationTableRows[0]?.exists
    ? (await client.query(`
        select version
        from supabase_migrations.schema_migrations
        order by version
      `)).rows
    : [];

  const missingTables = expectedTables.filter((name) => !tables.includes(name));
  const missingBuckets = expectedBuckets.filter((name) => !buckets.includes(name));
  const missingProfileColumns = expectedProfileColumns.filter(
    (name) => !profileColumns.includes(name),
  );
  const missingClientColumns = expectedClientColumns.filter(
    (name) => !clientColumns.includes(name),
  );
  const exposedClientContactColumns = sensitiveClientColumns.filter((name) =>
    clientColumns.includes(name),
  );
  const missingClientContactColumns = expectedClientContactColumns.filter(
    (name) => !clientContactColumns.includes(name),
  );
  const missingMaterialEntryColumns = expectedMaterialEntryColumns.filter(
    (name) => !materialEntryColumns.includes(name),
  );
  const missingRoles = expectedRoles.filter((name) => !roles.includes(name));
  const triggerEvents = triggerRows.map(({ event_manipulation }) => event_manipulation);
  const profileSecurityTrigger = ["INSERT", "UPDATE", "DELETE"].every((event) =>
    triggerEvents.includes(event),
  );
  const accessFunctions = accessFunctionRows.map(({ proname }) => proname);
  const employeeAccessFunctions = [
    "is_active_user",
    "is_admin",
    "protect_profile_security_fields",
  ].every((name) => accessFunctions.includes(name));
  const salesFunctions = salesFunctionRows.map(({ proname }) => proname);
  const salesWorkflowFunctions = [
    "can_manage_sales",
    "can_view_sales",
    "calculate_estimate_totals",
    "recalculate_estimate_subtotal",
    "convert_opportunity_to_project",
  ].every((name) => salesFunctions.includes(name));
  const operationsFunctions = operationsFunctionRows.map(({ proname }) => proname);
  const operationsWorkflowFunctions = [
    "can_manage_operations",
    "can_view_work_order",
    "can_log_work_order",
    "operations_employee_directory",
    "operations_project_directory",
    "update_assigned_work_order_status",
    "enforce_work_order_status_transition",
    "validate_time_entry",
  ].every((name) => operationsFunctions.includes(name));
  const inventoryFunctions = inventoryFunctionRows.map(({ proname }) => proname);
  const inventoryWorkflowFunctions = [
    "can_manage_inventory",
    "can_view_inventory",
    "can_view_purchasing",
    "apply_inventory_movement",
    "enforce_purchase_order_item_edit",
    "enforce_purchase_order_status_transition",
    "receive_purchase_order_item",
    "adjust_inventory",
    "issue_inventory_to_work_order",
    "reverse_inventory_issue",
    "protect_purchase_order_fields",
    "validate_inventory_material_entry",
  ].every((name) => inventoryFunctions.includes(name));
  const billingFunctions = billingFunctionRows.map(({ proname }) => proname);
  const billingWorkflowFunctions = [
    "can_manage_billing",
    "can_view_billing",
    "can_view_profitability",
    "can_manage_project_financials",
    "calculate_invoice_totals",
    "recalculate_invoice_subtotal",
    "enforce_invoice_status_transition",
    "create_invoice_from_estimate",
    "record_invoice_payment",
    "reverse_invoice_payment",
    "billing_project_directory",
    "billing_estimate_directory",
    "project_profitability",
  ].every((name) => billingFunctions.includes(name));
  const drawingCountMismatches = mismatchRows[0]?.count ?? 0;
  const customerIntegrity = customerIntegrityRows[0] ?? {
    clients: 0,
    contacts: 0,
    missing_contacts: 0,
  };
  const operationsIntegrity = operationsIntegrityRows[0] ?? {
    work_orders: 0,
    assignments: 0,
    time_entries: 0,
    material_entries: 0,
    missing_project_members: 0,
    invalid_time_days: 0,
    invalid_assignments: 0,
  };
  const inventoryIntegrity = inventoryIntegrityRows[0] ?? {
    suppliers: 0,
    inventory_items: 0,
    purchase_orders: 0,
    purchase_order_items: 0,
    inventory_movements: 0,
    invalid_stock_balances: 0,
    invalid_receipts: 0,
    purchase_order_total_mismatches: 0,
    movement_project_mismatches: 0,
    invalid_material_links: 0,
    invalid_reversals: 0,
  };
  const billingIntegrity = billingIntegrityRows[0] ?? {
    invoices: 0,
    invoice_items: 0,
    invoice_payments: 0,
    project_financial_settings: 0,
    invoice_total_mismatches: 0,
    payment_ledger_mismatches: 0,
    project_customer_mismatches: 0,
    invoice_status_mismatches: 0,
    source_estimate_mismatches: 0,
    status_timestamp_mismatches: 0,
  };
  const ok =
    missingTables.length === 0 &&
    missingBuckets.length === 0 &&
    missingProfileColumns.length === 0 &&
    missingClientColumns.length === 0 &&
    exposedClientContactColumns.length === 0 &&
    missingClientContactColumns.length === 0 &&
    missingMaterialEntryColumns.length === 0 &&
    clientContactPolicies &&
    clientContactRls &&
    missingRoles.length === 0 &&
    profileSecurityTrigger &&
    employeeAccessFunctions &&
    salesWorkflowFunctions &&
    operationsPolicies &&
    operationsRls &&
    projectAccountingPolicyAbsent &&
    operationsWorkflowFunctions &&
    operationsIntegrity.missing_project_members === 0 &&
    operationsIntegrity.invalid_time_days === 0 &&
    operationsIntegrity.invalid_assignments === 0 &&
    inventoryPolicies &&
    inventoryRls &&
    inventoryWorkflowFunctions &&
    inventoryIntegrity.invalid_stock_balances === 0 &&
    inventoryIntegrity.invalid_receipts === 0 &&
    inventoryIntegrity.purchase_order_total_mismatches === 0 &&
    inventoryIntegrity.movement_project_mismatches === 0 &&
    inventoryIntegrity.invalid_material_links === 0 &&
    inventoryIntegrity.invalid_reversals === 0 &&
    billingPolicies &&
    billingRls &&
    billingWorkflowFunctions &&
    billingIntegrity.invoice_total_mismatches === 0 &&
    billingIntegrity.payment_ledger_mismatches === 0 &&
    billingIntegrity.project_customer_mismatches === 0 &&
    billingIntegrity.invoice_status_mismatches === 0 &&
    billingIntegrity.source_estimate_mismatches === 0 &&
    billingIntegrity.status_timestamp_mismatches === 0 &&
    customerIntegrity.missing_contacts === 0 &&
    drawingCountMismatches === 0;

  console.log(JSON.stringify({
    projectRef,
    ok,
    tables: { count: tables.length, missing: missingTables },
    buckets: { count: buckets.length, missing: missingBuckets },
    employees: {
      missingProfileColumns,
      missingRoles,
      profileSecurityTrigger,
      employeeAccessFunctions,
    },
    sales: {
      missingClientColumns,
      exposedClientContactColumns,
      missingClientContactColumns,
      clientContactPolicies,
      clientContactRls,
      salesWorkflowFunctions,
      customerIntegrity,
    },
    operations: {
      operationsPolicies,
      operationsRls,
      projectAccountingPolicyAbsent,
      operationsWorkflowFunctions,
      operationsIntegrity,
    },
    inventory: {
      missingMaterialEntryColumns,
      inventoryPolicies,
      inventoryRls,
      inventoryWorkflowFunctions,
      inventoryIntegrity,
    },
    billing: {
      billingPolicies,
      billingRls,
      billingWorkflowFunctions,
      billingIntegrity,
    },
    policies: { count: policyRows.length },
    drawingCountMismatches,
    migrations: migrationRows.map(({ version }) => version),
  }, null, 2));

  if (!ok) process.exitCode = 1;
} finally {
  await client.end();
}
