import dns from "node:dns";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

// GitHub Actions runners have no IPv6 route. Supabase pooler hosts expose both
// A and AAAA records, so force IPv4 to avoid ENETUNREACH.
dns.setDefaultResultOrder("ipv4first");

const require = createRequire(import.meta.url);

function ipv4Lookup(hostname, options, callback) {
  return dns.lookup(hostname, { ...options, family: 4 }, callback);
}

// Supabase Supavisor pooler regions (IPv4 reachable from GitHub Actions).
const POOLER_REGIONS = [
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "ca-central-1",
  "eu-central-1",
  "eu-central-2",
  "eu-west-1",
  "eu-west-2",
  "eu-west-3",
  "eu-north-1",
  "ap-south-1",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-northeast-1",
  "ap-northeast-2",
  "sa-east-1",
];

const POOLER_PREFIXES = ["aws-0", "aws-1"];

function getProjectRef(supabaseUrl) {
  const hostname = new URL(supabaseUrl).hostname;
  return hostname.split(".")[0];
}

async function schemaExistsViaServiceRole(supabaseUrl, serviceRoleKey) {
  const { createClient } = require("@supabase/supabase-js");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await supabase.from("profiles").select("id").limit(1);
  if (!error) return true;

  const message = error.message ?? "";
  if (
    message.includes("schema cache") ||
    message.includes("Could not find the table") ||
    error.code === "PGRST205"
  ) {
    return false;
  }

  throw new Error(message);
}

function buildPoolerCandidates(ref, password) {
  const candidates = [];
  for (const prefix of POOLER_PREFIXES) {
    for (const region of POOLER_REGIONS) {
      candidates.push({
        host: `${prefix}.${region}.pooler.supabase.com`,
        port: 5432,
        user: `postgres.${ref}`,
        password,
        database: "postgres",
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 8000,
        query_timeout: 60000,
        lookup: ipv4Lookup,
      });
    }
  }
  return candidates;
}

async function tryConnect(config) {
  const { Client } = require("pg");
  const client = new Client(config);
  try {
    await client.connect();
    return client;
  } catch {
    try {
      await client.end();
    } catch {}
    return null;
  }
}

async function connectViaPooler(ref, password) {
  for (const config of buildPoolerCandidates(ref, password)) {
    const client = await tryConnect(config);
    if (client) {
      console.log(`Connected to Supabase pooler at ${config.host}`);
      return client;
    }
  }
  return null;
}

async function connectDirect(ref, password) {
  const { Client } = require("pg");
  const config = {
    host: process.env.SUPABASE_DB_HOST?.trim() || `db.${ref}.supabase.co`,
    port: Number(process.env.SUPABASE_DB_PORT?.trim() || "5432"),
    user: process.env.SUPABASE_DB_USER?.trim() || "postgres",
    password,
    database: process.env.SUPABASE_DB_NAME?.trim() || "postgres",
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
    query_timeout: 60000,
    lookup: ipv4Lookup,
  };
  const client = new Client(config);
  await client.connect();
  return client;
}

async function connectFromDatabaseUrl(connectionString) {
  const { Client } = require("pg");
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
    query_timeout: 60000,
  });
  await client.connect();
  return client;
}

async function schemaExistsOnClient(client) {
  const result = await client.query(
    "select to_regclass('public.profiles') as table_name",
  );
  return Boolean(result.rows[0]?.table_name);
}

async function applyWithClient(client, sql) {
  if (await schemaExistsOnClient(client)) {
    console.log("Supabase schema already exists. Skipping setup.");
    return;
  }
  console.log("Applying Supabase schema...");
  await client.query(sql);
  console.log("Supabase schema applied.");
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
  console.log("Supabase schema applied via Management API.");
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is required.");
  }

  if (serviceRoleKey) {
    try {
      if (await schemaExistsViaServiceRole(supabaseUrl, serviceRoleKey)) {
        console.log("Supabase schema already exists. Skipping setup.");
        return;
      }
    } catch (error) {
      console.warn(
        `Could not verify schema via service role: ${error.message ?? error}`,
      );
    }
  }

  const ref = getProjectRef(supabaseUrl);
  const sql = readFileSync("supabase/setup-all.sql", "utf8");
  const password = process.env.SUPABASE_DB_PASSWORD?.trim();
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN?.trim();

  // 1. Explicit connection string wins.
  if (databaseUrl) {
    const client = await connectFromDatabaseUrl(databaseUrl);
    try {
      await applyWithClient(client, sql);
    } finally {
      await client.end();
    }
    return;
  }

  // 2. DB password: try IPv4 pooler (auto region), then direct connection.
  if (password) {
    let client = await connectViaPooler(ref, password);

    if (!client) {
      try {
        client = await connectDirect(ref, password);
      } catch (error) {
        console.warn(
          `Direct database connection failed: ${error.message ?? error}`,
        );
      }
    }

    if (client) {
      try {
        await applyWithClient(client, sql);
      } finally {
        await client.end();
      }
      return;
    }

    console.warn(
      "::warning::Could not reach the Supabase database with the provided password. " +
        "Continuing deploy without schema setup.",
    );
    return;
  }

  // 3. Management API with personal access token.
  if (accessToken) {
    await applyViaManagementApi(ref, accessToken, sql);
    return;
  }

  console.warn(
    "::warning::Supabase schema is missing and no DB credentials are available to create it automatically. " +
      "Add SUPABASE_DB_PASSWORD or SUPABASE_ACCESS_TOKEN to GitHub secrets. Continuing deploy without schema setup.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
