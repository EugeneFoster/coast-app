import { connectToSupabaseDatabase } from "./lib/supabase-db.mjs";

const expectedTables = [
  "clients",
  "drawing_markups",
  "drawing_pages",
  "drawings",
  "gallery_items",
  "markup_comments",
  "markup_photos",
  "profiles",
  "project_members",
  "projects",
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

  const { rows: profileColumnRows } = await client.query(`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
  `);
  const profileColumns = profileColumnRows.map(({ column_name }) => column_name);

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

  const { rows: mismatchRows } = await client.query(`
    select count(*)::integer as count
    from public.projects p
    where p.drawing_count is distinct from (
      select count(*)::integer
      from public.drawings d
      where d.project_id = p.id
    )
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
  const drawingCountMismatches = mismatchRows[0]?.count ?? 0;
  const ok =
    missingTables.length === 0 &&
    missingBuckets.length === 0 &&
    missingProfileColumns.length === 0 &&
    missingRoles.length === 0 &&
    profileSecurityTrigger &&
    employeeAccessFunctions &&
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
    policies: { count: policyRows.length },
    drawingCountMismatches,
    migrations: migrationRows.map(({ version }) => version),
  }, null, 2));

  if (!ok) process.exitCode = 1;
} finally {
  await client.end();
}
