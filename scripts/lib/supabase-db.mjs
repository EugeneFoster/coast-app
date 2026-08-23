import pg from "pg";

const { Client } = pg;

function projectRefFromUrl(supabaseUrl) {
  return new URL(supabaseUrl).hostname.split(".")[0];
}

async function connect(config, password) {
  const client = new Client({
    ...config,
    database: "postgres",
    password,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10_000,
    query_timeout: 120_000,
  });
  await client.connect();
  return client;
}

export async function connectToSupabaseDatabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const password = process.env.SUPABASE_DB_PASSWORD;

  if (!supabaseUrl || !password) {
    throw new Error("Supabase URL and SUPABASE_DB_PASSWORD are required.");
  }

  const projectRef = projectRefFromUrl(supabaseUrl);
  const directHost = `db.${projectRef}.supabase.co`;
  const poolerHosts = process.env.SUPABASE_POOLER_HOST
    ? [process.env.SUPABASE_POOLER_HOST]
    : [
        "aws-0-us-east-1.pooler.supabase.com",
        "aws-1-us-east-1.pooler.supabase.com",
      ];

  try {
    const client = await connect({ host: directHost, port: 5432, user: "postgres" }, password);
    return { client, projectRef };
  } catch {
    for (const host of poolerHosts) {
      try {
        const client = await connect(
          { host, port: 5432, user: `postgres.${projectRef}` },
          password,
        );
        return { client, projectRef };
      } catch {
        // Try the next known pooler endpoint.
      }
    }
  }

  throw new Error("Could not connect to the Supabase database.");
}
