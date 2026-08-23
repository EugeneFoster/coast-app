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
  const drawingCountMismatches = mismatchRows[0]?.count ?? 0;
  const ok =
    missingTables.length === 0 &&
    missingBuckets.length === 0 &&
    drawingCountMismatches === 0;

  console.log(JSON.stringify({
    projectRef,
    ok,
    tables: { count: tables.length, missing: missingTables },
    buckets: { count: buckets.length, missing: missingBuckets },
    policies: { count: policyRows.length },
    drawingCountMismatches,
    migrations: migrationRows.map(({ version }) => version),
  }, null, 2));

  if (!ok) process.exitCode = 1;
} finally {
  await client.end();
}
