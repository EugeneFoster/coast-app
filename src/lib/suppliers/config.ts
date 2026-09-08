import { SUPPLIER_LABELS, type SupplierId } from "@/lib/suppliers/types";

/**
 * Server-only access to supplier portal credentials.
 *
 * The environment variable names are fixed by the deployment and are read
 * verbatim — do not rename them, and do not add `NEXT_PUBLIC_` variants, which
 * would ship the values to the browser.
 *
 * Nothing here may be imported from a client component. The guard below turns a
 * mistaken import into an immediate, loud failure rather than a silent leak.
 */

function assertServerOnly() {
  if (typeof window !== "undefined") {
    throw new Error(
      "Supplier credentials are server-only and must never be imported into client code.",
    );
  }
}

/** Environment variable names, exactly as provisioned. */
const ENV_KEYS: Record<SupplierId, { link: string; login: string; password: string }> = {
  mercury: {
    link: "mercury_link",
    login: "mercury_login",
    password: "mercury_password",
  },
  marinepartssupply: {
    link: "marinepartssupply_link",
    login: "marinepartssupply_login",
    password: "marinepartssupply_password",
  },
  westernmarine: {
    link: "westernmarine_link",
    login: "westernmarine_login",
    password: "westernmarine_password",
  },
};

export interface SupplierCredentials {
  /** Portal base URL. Server-defined — never accepted from a request. */
  readonly baseUrl: string;
  readonly login: string;
  readonly password: string;
}

function readEnv(name: string): string {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

export function isSupplierConfigured(supplier: SupplierId): boolean {
  assertServerOnly();
  const keys = ENV_KEYS[supplier];
  return Boolean(readEnv(keys.link) && readEnv(keys.login) && readEnv(keys.password));
}

/**
 * Returns the credentials for a supplier, or null when the deployment has not
 * configured it. Callers must not log, serialize or forward the result.
 */
export function getSupplierCredentials(supplier: SupplierId): SupplierCredentials | null {
  assertServerOnly();
  const keys = ENV_KEYS[supplier];
  const rawLink = readEnv(keys.link);
  const login = readEnv(keys.login);
  const password = readEnv(keys.password);
  if (!rawLink || !login || !password) return null;

  const baseUrl = normalizeBaseUrl(rawLink);
  if (!baseUrl) return null;

  return { baseUrl, login, password };
}

/**
 * Only the origin is ever exposed to operators (health checks, logs). The path,
 * query and credentials are not.
 */
export function getSupplierOrigin(supplier: SupplierId): string | null {
  assertServerOnly();
  const rawLink = readEnv(ENV_KEYS[supplier].link);
  if (!rawLink) return null;
  try {
    return new URL(withScheme(rawLink)).origin;
  } catch {
    return null;
  }
}

function withScheme(value: string) {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function normalizeBaseUrl(value: string): string | null {
  try {
    const url = new URL(withScheme(value));
    // Only https portals are acceptable: credentials must never cross plain HTTP.
    if (url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function supplierLabel(supplier: SupplierId) {
  return SUPPLIER_LABELS[supplier];
}

/** Names of the environment variables a supplier needs, for operator messages. */
export function missingEnvKeys(supplier: SupplierId): string[] {
  assertServerOnly();
  const keys = ENV_KEYS[supplier];
  return Object.values(keys).filter((name) => !readEnv(name));
}
