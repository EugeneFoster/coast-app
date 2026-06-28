import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function getProjectRef(supabaseUrl) {
  const hostname = new URL(supabaseUrl).hostname;
  return hostname.split(".")[0];
}

function getDatabaseUrl() {
  if (process.env.DATABASE_URL?.trim()) {
    return process.env.DATABASE_URL.trim();
  }

  const password = process.env.SUPABASE_DB_PASSWORD?.trim();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

  if (!password || !supabaseUrl) {
    return null;
  }

  const ref = getProjectRef(supabaseUrl);
  const host = process.env.SUPABASE_DB_HOST?.trim() || `db.${ref}.supabase.co`;
  const port = process.env.SUPABASE_DB_PORT?.trim() || "5432";
  const user = process.env.SUPABASE_DB_USER?.trim() || "postgres";
  const database = process.env.SUPABASE_DB_NAME?.trim() || "postgres";

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

async function schemaExistsViaPg(connectionString) {
  const { Client } = require("pg");
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    const result = await client.query(
      "select to_regclass('public.profiles') as table_name",
    );
    return Boolean(result.rows[0]?.table_name);
  } finally {
    await client.end();
  }
}

async function applyViaPg(connectionString, sql) {
  const { Client } = require("pg");
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

async function schemaExistsViaManagementApi(projectRef, accessToken) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query/read-only`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: "select to_regclass('public.profiles') as table_name",
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase read-only query failed (${response.status}): ${body}`);
  }

  const payload = await response.json();
  const row = Array.isArray(payload) ? payload[0] : payload?.[0];
  return Boolean(row?.table_name);
}

async function applyViaManagementApi(projectRef, accessToken, sql) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase schema apply failed (${response.status}): ${body}`);
  }
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is required.");
  }

  const projectRef = getProjectRef(supabaseUrl);
  const sql = readFileSync("supabase/setup-all.sql", "utf8");
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  const databaseUrl = getDatabaseUrl();

  if (!accessToken && !databaseUrl) {
    throw new Error(
      "Add SUPABASE_ACCESS_TOKEN or SUPABASE_DB_PASSWORD (or DATABASE_URL) to GitHub secrets for automatic schema setup.",
    );
  }

  if (databaseUrl) {
    const exists = await schemaExistsViaPg(databaseUrl);
    if (exists) {
      console.log("Supabase schema already exists. Skipping setup.");
      return;
    }

    console.log("Applying Supabase schema via direct database connection...");
    await applyViaPg(databaseUrl, sql);
    console.log("Supabase schema applied.");
    return;
  }

  const exists = await schemaExistsViaManagementApi(projectRef, accessToken);
  if (exists) {
    console.log("Supabase schema already exists. Skipping setup.");
    return;
  }

  console.log("Applying Supabase schema via Supabase Management API...");
  await applyViaManagementApi(projectRef, accessToken, sql);
  console.log("Supabase schema applied.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
