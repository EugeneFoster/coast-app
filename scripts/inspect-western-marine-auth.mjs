import { getSupplierCredentials } from "../src/lib/suppliers/config.ts";
import { supplierFetch } from "../src/lib/suppliers/http.ts";
import { CookieJar } from "../src/lib/suppliers/session.ts";

const credentials = getSupplierCredentials("westernmarine");
if (!credentials) throw new Error("Western Marine is not configured");

const jar = new CookieJar();
const entry = await supplierFetch("westernmarine", credentials.baseUrl, {
  jar,
  followRedirects: false,
});
const location = entry.headers.get("location");
const authenticateUrl = location ? new URL(location, credentials.baseUrl) : null;
if (authenticateUrl && authenticateUrl.origin !== new URL(credentials.baseUrl).origin) {
  throw new Error("Authentication redirected to another origin");
}

const basic = Buffer.from(`${credentials.login}:${credentials.password}`).toString("base64");
let authenticated = null;
let retried = null;
if (authenticateUrl) {
  authenticated = await supplierFetch("westernmarine", authenticateUrl.toString(), {
    jar,
    followRedirects: false,
    headers: { authorization: `Basic ${basic}` },
  });
  if (authenticated.status === 401) {
    retried = await supplierFetch("westernmarine", authenticateUrl.toString(), {
      jar,
      followRedirects: true,
      headers: { authorization: `Basic ${basic}` },
    });
  }
}

console.log(JSON.stringify({
  entryStatus: entry.status,
  redirectIsAuthenticate: Boolean(authenticateUrl?.pathname.includes("*AUTHENTICATE")),
  entryCookieCount: jar.size,
  authenticatedStatus: authenticated?.status ?? null,
  challengeIsBasic: authenticated?.headers.get("www-authenticate")?.toLowerCase().startsWith("basic") ?? false,
  retryStatus: retried?.status ?? null,
  retryLandedInStore: retried?.url.includes("/Store/homepage.html") ?? false,
}));
