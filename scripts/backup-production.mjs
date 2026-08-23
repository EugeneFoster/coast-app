import { mkdir, writeFile, chmod } from "node:fs/promises";
import path from "node:path";
import { connectToSupabaseDatabase } from "./lib/supabase-db.mjs";

const outputDir = process.argv[2];
if (!outputDir) {
  throw new Error("Usage: node scripts/backup-production.mjs <output-directory>");
}

const { client, projectRef } = await connectToSupabaseDatabase();

try {
  const { rows: tableRows } = await client.query(`
    select tablename
    from pg_catalog.pg_tables
    where schemaname = 'public'
    order by tablename
  `);

  const tables = {};
  for (const { tablename } of tableRows) {
    const safeName = tablename.replaceAll('"', '""');
    const { rows } = await client.query(`select * from public."${safeName}"`);
    tables[tablename] = rows;
  }

  const { rows: columns } = await client.query(`
    select table_name, column_name, ordinal_position, data_type, udt_name,
           is_nullable, column_default
    from information_schema.columns
    where table_schema = 'public'
    order by table_name, ordinal_position
  `);
  const { rows: policies } = await client.query(`
    select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    from pg_catalog.pg_policies
    where schemaname = 'public'
    order by tablename, policyname
  `);
  const { rows: indexes } = await client.query(`
    select tablename, indexname, indexdef
    from pg_catalog.pg_indexes
    where schemaname = 'public'
    order by tablename, indexname
  `);

  const generatedAt = new Date().toISOString();
  const dataBackup = { generatedAt, projectRef, tables };
  const schemaSnapshot = { generatedAt, projectRef, columns, policies, indexes };

  await mkdir(outputDir, { recursive: true });
  const dataPath = path.join(outputDir, "public-data.json");
  const schemaPath = path.join(outputDir, "public-schema.json");
  await writeFile(dataPath, `${JSON.stringify(dataBackup, null, 2)}\n`, "utf8");
  await writeFile(schemaPath, `${JSON.stringify(schemaSnapshot, null, 2)}\n`, "utf8");
  await chmod(dataPath, 0o600);
  await chmod(schemaPath, 0o600);

  console.log(JSON.stringify({
    outputDir,
    tables: Object.fromEntries(
      Object.entries(tables).map(([name, rows]) => [name, rows.length]),
    ),
    schema: {
      columns: columns.length,
      policies: policies.length,
      indexes: indexes.length,
    },
  }, null, 2));
} finally {
  await client.end();
}
