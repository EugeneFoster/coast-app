import { readFileSync } from "node:fs";
import { connectToSupabaseDatabase } from "./lib/supabase-db.mjs";

const { client } = await connectToSupabaseDatabase();
const migrations = [
  "supabase/migrations/20260915000001_supplier_price_watch.sql",
  "supabase/migrations/20260915000002_supplier_price_watch_mps.sql",
  "supabase/migrations/20260915000003_supplier_price_discovery.sql",
  "supabase/migrations/20260916000001_supplier_package_pricing.sql",
  "supabase/migrations/20260916000002_supplier_routing.sql",
];

try {
  await client.query("begin");
  for (const path of migrations) await client.query(readFileSync(path, "utf8"));
  const { rows } = await client.query(`
    select
      to_regclass('public.supplier_price_watches') is not null as watches,
      to_regclass('public.supplier_price_observations') is not null as observations,
      to_regclass('public.supplier_price_alerts') is not null as alerts,
      to_regprocedure('public.record_supplier_price_check(uuid,text,text,numeric,numeric,text,timestamptz)') is not null as record_function,
      to_regprocedure('public.decide_supplier_price_alert(uuid,text)') is not null as decide_function
  `);
  if (!Object.values(rows[0] ?? {}).every(Boolean)) {
    throw new Error("Supplier price-watch schema verification failed.");
  }
  await client.query("commit");
  console.log("Supplier price-watch schema applied and verified.");
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
