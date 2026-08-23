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
  "material_entries",
  "markup_comments",
  "markup_photos",
  "profiles",
  "project_members",
  "projects",
  "opportunities",
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
  const ok =
    missingTables.length === 0 &&
    missingBuckets.length === 0 &&
    missingProfileColumns.length === 0 &&
    missingClientColumns.length === 0 &&
    exposedClientContactColumns.length === 0 &&
    missingClientContactColumns.length === 0 &&
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
    policies: { count: policyRows.length },
    drawingCountMismatches,
    migrations: migrationRows.map(({ version }) => version),
  }, null, 2));

  if (!ok) process.exitCode = 1;
} finally {
  await client.end();
}
