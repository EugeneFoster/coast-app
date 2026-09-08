import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

const AUTHORIZE_URL = "https://login.xero.com/identity/connect/authorize";
const TOKEN_URL = "https://identity.xero.com/connect/token";
const CONNECTIONS_URL = "https://api.xero.com/connections";
const ACCOUNTING_URL = "https://api.xero.com/api.xro/2.0";
export const XERO_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "accounting.settings",
  "accounting.invoices",
] as const;

export interface XeroTokenSet {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type?: string;
  scope?: string;
  id_token?: string;
}

interface StoredXeroTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
}

interface XeroConnectionRow {
  tenant_id: string;
  tenant_name: string | null;
  token_ciphertext: string;
  token_expires_at: string;
  scopes: string[];
  last_item_pull_at: string | null;
  last_item_push_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  connected_at: string;
}

interface XeroOrganisationConnection {
  tenantId: string;
  tenantName?: string;
  tenantType?: string;
}

export class XeroError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "XeroError";
  }
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new XeroError(`${name} is not configured.`);
  return value;
}

function clientCredentials() {
  return {
    clientId: requiredEnv("XERO_CLIENT_ID"),
    clientSecret: requiredEnv("XERO_CLIENT_SECRET"),
    redirectUri: requiredEnv("XERO_REDIRECT_URI"),
  };
}

function encryptionKey() {
  // Hashing allows Railway operators to provide a high-entropy passphrase or a
  // base64 secret while always producing the 32 bytes AES-256-GCM expects.
  return createHash("sha256").update(requiredEnv("XERO_TOKEN_ENCRYPTION_KEY")).digest();
}

function encryptTokens(tokens: StoredXeroTokens) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(tokens), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

function decryptTokens(value: string): StoredXeroTokens {
  const [version, ivRaw, tagRaw, ciphertextRaw] = value.split(".");
  if (version !== "v1" || !ivRaw || !tagRaw || !ciphertextRaw) {
    throw new XeroError("Stored Xero credentials are unreadable.");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivRaw, "base64url"));
    decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
    return JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(ciphertextRaw, "base64url")),
        decipher.final(),
      ]).toString("utf8"),
    ) as StoredXeroTokens;
  } catch {
    throw new XeroError("Stored Xero credentials could not be decrypted.");
  }
}

function basicAuthHeader() {
  const { clientId, clientSecret } = clientCredentials();
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

export function xeroAuthorizationUrl(state: string) {
  const { clientId, redirectUri } = clientCredentials();
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: XERO_SCOPES.join(" "),
    state,
  }).toString();
  return url.toString();
}

async function tokenRequest(body: URLSearchParams): Promise<XeroTokenSet> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      authorization: basicAuthHeader(),
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body,
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as Partial<XeroTokenSet> | null;
  if (!response.ok || !payload?.access_token || !payload.refresh_token) {
    throw new XeroError(`Xero authorization failed (${response.status}).`, response.status);
  }
  return payload as XeroTokenSet;
}

export function exchangeXeroCode(code: string) {
  const { redirectUri } = clientCredentials();
  return tokenRequest(new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  }));
}

async function refreshXeroTokens(refreshToken: string) {
  return tokenRequest(new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  }));
}

export async function listXeroConnections(accessToken: string) {
  const response = await fetch(CONNECTIONS_URL, {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as XeroOrganisationConnection[] | null;
  if (!response.ok || !Array.isArray(payload)) {
    throw new XeroError(`Could not read Xero organisations (${response.status}).`, response.status);
  }
  return payload;
}

export async function saveXeroConnection(
  tokenSet: XeroTokenSet,
  connection: XeroOrganisationConnection,
  connectedBy: string,
) {
  const supabase = createAdminClient();
  const tokenExpiresAt = new Date(Date.now() + tokenSet.expires_in * 1000).toISOString();
  const tokenCiphertext = encryptTokens({
    accessToken: tokenSet.access_token,
    refreshToken: tokenSet.refresh_token,
    tokenType: tokenSet.token_type ?? "Bearer",
  });
  const { error } = await supabase.from("xero_connections").upsert({
    id: "primary",
    tenant_id: connection.tenantId,
    tenant_name: connection.tenantName ?? null,
    token_ciphertext: tokenCiphertext,
    token_expires_at: tokenExpiresAt,
    scopes: (tokenSet.scope ?? XERO_SCOPES.join(" ")).split(/\s+/).filter(Boolean),
    connected_by: connectedBy,
    connected_at: new Date().toISOString(),
    last_error: null,
  });
  if (error) throw new XeroError(`Could not save the Xero connection: ${error.message}`);
}

let refreshInFlight: Promise<{ accessToken: string; tenantId: string }> | null = null;

async function loadAccess(): Promise<{ accessToken: string; tenantId: string }> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("xero_connections")
    .select("*")
    .eq("id", "primary")
    .maybeSingle();
  if (error || !data) throw new XeroError("Xero is not connected.");
  const row = data as XeroConnectionRow;
  const stored = decryptTokens(row.token_ciphertext);
  if (new Date(row.token_expires_at).getTime() > Date.now() + 120_000) {
    return { accessToken: stored.accessToken, tenantId: row.tenant_id };
  }

  if (refreshInFlight) return refreshInFlight;
  const attempt = (async () => {
    const refreshed = await refreshXeroTokens(stored.refreshToken);
    const { error: updateError } = await supabase
      .from("xero_connections")
      .update({
        token_ciphertext: encryptTokens({
          accessToken: refreshed.access_token,
          refreshToken: refreshed.refresh_token,
          tokenType: refreshed.token_type ?? "Bearer",
        }),
        token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        scopes: (refreshed.scope ?? row.scopes.join(" ")).split(/\s+/).filter(Boolean),
        last_error: null,
      })
      .eq("id", "primary");
    if (updateError) throw new XeroError(`Could not rotate Xero credentials: ${updateError.message}`);
    return { accessToken: refreshed.access_token, tenantId: row.tenant_id };
  })();
  refreshInFlight = attempt;
  try {
    return await attempt;
  } finally {
    if (refreshInFlight === attempt) refreshInFlight = null;
  }
}

export async function xeroRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { accessToken, tenantId } = await loadAccess();
  const response = await fetch(`${ACCOUNTING_URL}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      "xero-tenant-id": tenantId,
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as T | { Message?: string } | null;
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "Message" in payload
      ? String(payload.Message)
      : `HTTP ${response.status}`;
    throw new XeroError(`Xero request failed: ${message}`, response.status);
  }
  return payload as T;
}

export async function getXeroStatus() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("xero_connections")
    .select("tenant_name, connected_at, last_item_pull_at, last_item_push_at, last_success_at, last_error")
    .eq("id", "primary")
    .maybeSingle();
  return data
    ? { connected: true as const, ...data }
    : { connected: false as const };
}

export async function markXeroConnection(values: Record<string, unknown>) {
  const supabase = createAdminClient();
  await supabase.from("xero_connections").update(values).eq("id", "primary");
}

