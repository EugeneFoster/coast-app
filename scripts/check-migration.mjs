import { readFile } from "node:fs/promises";
import { connectToSupabaseDatabase } from "./lib/supabase-db.mjs";

const migrationPaths = process.argv.slice(2);
if (migrationPaths.length === 0) {
  throw new Error("Usage: node scripts/check-migration.mjs <migration.sql> [...]");
}

const sql = (
  await Promise.all(migrationPaths.map((migrationPath) => readFile(migrationPath, "utf8")))
).join("\n\n");
const { client } = await connectToSupabaseDatabase();

try {
  await client.query("begin");
  await client.query(sql);
  await client.query("rollback");
  console.log(`Migration check passed: ${migrationPaths.join(", ")}`);
} catch (error) {
  try {
    await client.query("rollback");
  } catch {}
  throw error;
} finally {
  await client.end();
}
