import assert from "node:assert/strict";

// P11: supplier layer behaviour and leak checks.
//
// No live supplier portal is contacted. Adapters are replaced with fakes so the
// orchestration rules — isolation, caching, session reuse, classification and
// redaction — can be asserted deterministically.

// Credentials are set before the config module is imported so the leak checks
// below have concrete secrets to look for.
const SECRETS = {
  mercury_password: "mercury-secret-pw-DO-NOT-LEAK",
  marinepartssupply_password: "mps-secret-pw-DO-NOT-LEAK",
  westernmarine_password: "wm-secret-pw-DO-NOT-LEAK",
};
process.env.mercury_link = "https://mercnet.example.test/";
process.env.mercury_login = "mercury-user";
process.env.mercury_password = SECRETS.mercury_password;
process.env.marinepartssupply_link = "https://mps.example.test/";
process.env.marinepartssupply_login = "mps-user";
process.env.marinepartssupply_password = SECRETS.marinepartssupply_password;
process.env.westernmarine_link = "https://wm.example.test/";
process.env.westernmarine_login = "wm-user";
process.env.westernmarine_password = SECRETS.westernmarine_password;

const {
  buildResult,
  looseKey,
  normalizePartNumber,
  parseMoney,
  parseQuantity,
  partNumbersMatch,
  isValidSearchQuery,
  sanitizeProductUrl,
} = await import("@/lib/suppliers/normalize.ts");
const { SupplierError } = await import("@/lib/suppliers/errors.ts");
const { CookieJar, SupplierSessionManager } = await import("@/lib/suppliers/session.ts");
const { resolveAgainstBase, supplierFetch } = await import("@/lib/suppliers/http.ts");
const { searchSuppliers } = await import("@/lib/suppliers/search.ts");
const { invalidateSupplierCache } = await import("@/lib/suppliers/cache.ts");
const { getSupplierRegistry } = await import("@/lib/suppliers/registry.ts");
const { getSupplierCredentials, isSupplierConfigured } = await import(
  "@/lib/suppliers/config.ts"
);
const { NO_CAPABILITIES, SUPPLIER_IDS } = await import("@/lib/suppliers/types.ts");

// ---------------------------------------------------------------------------
// Part number handling
// ---------------------------------------------------------------------------

assert.equal(normalizePartNumber("  8m0123456  "), "8M0123456");
assert.equal(normalizePartNumber("18-3214"), "18-3214", "hyphens are significant");
assert.equal(normalizePartNumber("35 8M0103970"), "35 8M0103970");

assert.ok(partNumbersMatch("8m0123456", "8M0123456"), "case differences are the same part");
assert.ok(
  !partNumbersMatch("18-2001", "182001"),
  "punctuation differences are different parts until a supplier says otherwise",
);
assert.equal(looseKey("18-2001"), looseKey("182001"), "looseKey groups near-misses for ranking");

assert.ok(isValidSearchQuery("18-3214"), "hyphenated numbers are valid queries");
assert.ok(isValidSearchQuery("water pump"), "descriptive searches are allowed");
assert.ok(!isValidSearchQuery("a"), "one character is too short");
assert.ok(!isValidSearchQuery("bad\u0000value"), "control characters are rejected");

// Absent money stays absent — it must never become zero.
assert.equal(parseMoney(undefined), null);
assert.equal(parseMoney(""), null);
assert.equal(parseMoney("n/a"), null);
assert.equal(parseMoney("$1,234.56"), 1234.56);
assert.equal(parseMoney("1.234,56"), 1234.56);
assert.equal(parseMoney("124.50 CAD"), 124.5);
assert.equal(parseQuantity("3 available"), 3);
assert.equal(parseQuantity("none"), null);

assert.equal(
  sanitizeProductUrl("https://portal.example.test/p/1?session=abc&sku=9"),
  "https://portal.example.test/p/1?sku=9",
  "credential-ish query parameters are stripped from product links",
);
assert.equal(sanitizeProductUrl("javascript:alert(1)"), null);

// ---------------------------------------------------------------------------
// Result classification
// ---------------------------------------------------------------------------

const exact = buildResult({
  supplier: "westernmarine",
  searchedPartNumber: "18-3214",
  partNumber: "18-3214",
  dealerCost: 94.3,
});
assert.equal(exact.matchType, "exact");
assert.equal(exact.exactMatch, true);
assert.equal(exact.listPrice, null, "an unpublished list price stays null");
assert.equal(exact.quantityAvailable, null);

const superseded = buildResult({
  supplier: "mercury",
  searchedPartNumber: "8M0051234",
  partNumber: "8M0051234",
  supersededBy: "8M0123456",
});
assert.equal(superseded.matchType, "superseded");
assert.equal(superseded.exactMatch, false, "a supersession is never an exact match");
assert.equal(superseded.supersededBy, "8M0123456");

const related = buildResult({
  supplier: "marinepartssupply",
  searchedPartNumber: "8M0051234",
  partNumber: "8M0999999",
});
assert.equal(related.matchType, "related");
assert.equal(related.exactMatch, false, "a fuzzy hit is never presented as exact");

const withSku = buildResult({
  supplier: "westernmarine",
  searchedPartNumber: "18-3214",
  partNumber: "18-3214",
  supplierSku: "WM-99123",
});
assert.equal(withSku.supplierSku, "WM-99123");
assert.notEqual(
  withSku.supplierSku,
  withSku.partNumber,
  "supplier SKU and manufacturer number stay separate",
);

// ---------------------------------------------------------------------------
// Fake adapters
// ---------------------------------------------------------------------------

function fakeAdapter(id, behaviour) {
  return {
    id,
    name: id,
    capabilities: { ...NO_CAPABILITIES, dealerCost: true },
    isConfigured: () => true,
    ensureAuthenticated: async () => {},
    searchPart: behaviour,
    getPartDetails: async (partNumber) => {
      const results = await behaviour(partNumber);
      return results[0] ?? null;
    },
    healthCheck: async () => ({
      supplier: id,
      supplierName: id,
      state: "ready",
      detail: "",
      checkedAt: new Date().toISOString(),
    }),
    close: async () => {},
  };
}

const okResult = (partNumber) => [
  buildResult({
    supplier: "westernmarine",
    searchedPartNumber: partNumber,
    partNumber,
    dealerCost: 94.3,
    currency: "CAD",
  }),
];

// ---------------------------------------------------------------------------
// One failing supplier must not take the others down
// ---------------------------------------------------------------------------

invalidateSupplierCache();
const mixedRegistry = {
  mercury: fakeAdapter("mercury", async () => {
    throw new SupplierError("mercury", "SUPPLIER_TIMEOUT", "portal hung");
  }),
  marinepartssupply: fakeAdapter("marinepartssupply", async () => {
    throw new SupplierError("marinepartssupply", "NOT_FOUND");
  }),
  westernmarine: fakeAdapter("westernmarine", async (partNumber) => okResult(partNumber)),
};

const mixed = await searchSuppliers({
  query: "18-3214",
  registry: mixedRegistry,
  perSupplierTimeoutMs: 5_000,
});

assert.equal(mixed.supplierStatus.mercury, "timeout");
assert.equal(mixed.supplierStatus.marinepartssupply, "not_found");
assert.equal(mixed.supplierStatus.westernmarine, "success");
assert.equal(mixed.results.length, 1, "the healthy supplier's result still reaches the caller");
assert.equal(mixed.results[0].partNumber, "18-3214");

// Every supplier failing is a normal response, not an exception.
invalidateSupplierCache();
const allFail = await searchSuppliers({
  query: "0000",
  registry: {
    mercury: fakeAdapter("mercury", async () => {
      throw new SupplierError("mercury", "AUTH_INTERVENTION_REQUIRED");
    }),
    marinepartssupply: fakeAdapter("marinepartssupply", async () => {
      throw new SupplierError("marinepartssupply", "RATE_LIMITED");
    }),
    westernmarine: fakeAdapter("westernmarine", async () => {
      throw new Error("kaboom");
    }),
  },
});
assert.equal(allFail.results.length, 0);
assert.equal(allFail.supplierStatus.mercury, "auth_intervention_required");
assert.equal(allFail.supplierStatus.marinepartssupply, "rate_limited");
assert.equal(
  allFail.supplierStatus.westernmarine,
  "unavailable",
  "an unexpected throw is normalized, not leaked",
);

// A malformed adapter response is reported as a parsing failure, not a crash.
invalidateSupplierCache();
const malformed = await searchSuppliers({
  query: "1111",
  registry: {
    ...mixedRegistry,
    mercury: fakeAdapter("mercury", async () => {
      throw new SupplierError("mercury", "PARSING_FAILED", "unexpected payload");
    }),
  },
});
assert.equal(malformed.supplierStatus.mercury, "parsing_failed");

// ---------------------------------------------------------------------------
// Caching keeps checkedAt honest
// ---------------------------------------------------------------------------

invalidateSupplierCache();
let liveCalls = 0;
const countingRegistry = {
  ...mixedRegistry,
  westernmarine: fakeAdapter("westernmarine", async (partNumber) => {
    liveCalls += 1;
    return okResult(partNumber);
  }),
};

const firstPass = await searchSuppliers({ query: "22-7788", registry: countingRegistry });
const secondPass = await searchSuppliers({ query: "22-7788", registry: countingRegistry });
assert.equal(liveCalls, 1, "a repeated lookup is served from the short-lived cache");
const cachedOutcome = secondPass.outcomes.find((o) => o.supplier === "westernmarine");
assert.equal(cachedOutcome.cached, true);
assert.equal(
  cachedOutcome.results[0].checkedAt,
  firstPass.outcomes.find((o) => o.supplier === "westernmarine").results[0].checkedAt,
  "cached results keep the original checkedAt so the UI cannot claim they are fresh",
);

// forceFresh is what the approval flow uses before touching money.
await searchSuppliers({ query: "22-7788", registry: countingRegistry, forceFresh: true });
assert.equal(liveCalls, 2, "forceFresh bypasses the cache");

// A request may only narrow the server-defined supplier list, never extend it.
invalidateSupplierCache();
const narrowed = await searchSuppliers({
  query: "33-1234",
  suppliers: ["westernmarine", "not-a-supplier"],
  registry: countingRegistry,
});
assert.deepEqual(Object.keys(narrowed.supplierStatus), ["westernmarine"]);

// ---------------------------------------------------------------------------
// Session reuse and single-flight login
// ---------------------------------------------------------------------------

let logins = 0;
const sessions = new SupplierSessionManager("mercury");
const login = async () => {
  logins += 1;
  await new Promise((resolve) => setTimeout(resolve, 10));
  return { jar: new CookieJar(), ttlMs: 60_000 };
};

await Promise.all(Array.from({ length: 10 }, () => sessions.acquire(login)));
assert.equal(logins, 1, "ten concurrent searches trigger exactly one login");

await sessions.acquire(login);
assert.equal(logins, 1, "a live session is reused rather than re-established");

sessions.invalidate();
await sessions.acquire(login);
assert.equal(logins, 2, "an invalidated session is re-established");

// An expired session is retried once, transparently.
logins = 0;
let attempts = 0;
const retried = await sessions.run(login, async () => {
  attempts += 1;
  if (attempts === 1) throw new SupplierError("mercury", "SESSION_EXPIRED");
  return "ok";
});
assert.equal(retried, "ok");
assert.equal(attempts, 2, "the operation is retried after re-authenticating");

// A session that dies again immediately is surfaced, not retried forever.
await assert.rejects(
  sessions.run(login, async () => {
    throw new SupplierError("mercury", "SESSION_EXPIRED");
  }),
  (error) => error instanceof SupplierError && error.code === "AUTH_FAILED",
);

// A failed login does not wedge the manager.
const failing = new SupplierSessionManager("mercury");
await assert.rejects(
  failing.acquire(async () => {
    throw new SupplierError("mercury", "AUTH_FAILED");
  }),
);
let recovered = false;
await failing.acquire(async () => {
  recovered = true;
  return { jar: new CookieJar(), ttlMs: 60_000 };
});
assert.ok(recovered, "the session manager recovers after a failed login");

// ---------------------------------------------------------------------------
// URL confinement
// ---------------------------------------------------------------------------

assert.equal(
  resolveAgainstBase("mercury", "https://portal.example.test/app/", "search?q=1"),
  "https://portal.example.test/app/search?q=1",
);
assert.throws(
  () => resolveAgainstBase("mercury", "https://portal.example.test/", "https://evil.test/steal"),
  (error) => error instanceof SupplierError && error.code === "CONFIGURATION_ERROR",
  "a supplier URL can never be pointed at another origin",
);

// Redirects are part of the authenticated HTTP flow, so they must stay on the
// configured origin as well. Otherwise a portal/open-redirect could receive a
// bearer token or Basic credentials on the second hop.
{
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), authorization: init.headers?.authorization });
    return new Response("", {
      status: 302,
      headers: { location: "https://redirect-target.example/capture" },
    });
  };
  try {
    await assert.rejects(
      () =>
        supplierFetch("marinepartssupply", "https://supplier.example/search", {
          headers: { authorization: "Bearer test-session-token" },
        }),
      (error) =>
        error instanceof SupplierError &&
        error.code === "SUPPLIER_UNAVAILABLE" &&
        error.internalDetail === "refused a cross-origin supplier redirect",
    );
    assert.equal(calls.length, 1, "authorization is never replayed to another origin");
  } finally {
    globalThis.fetch = realFetch;
  }
}

// ---------------------------------------------------------------------------
// Configuration and secrecy
// ---------------------------------------------------------------------------

for (const id of SUPPLIER_IDS) {
  assert.ok(isSupplierConfigured(id), `${id} should read its configured credentials`);
}

const saved = process.env.mercury_password;
delete process.env.mercury_password;
assert.equal(isSupplierConfigured("mercury"), false, "a missing secret means not configured");
assert.equal(getSupplierCredentials("mercury"), null);
process.env.mercury_password = saved;

// Plain-HTTP portals are refused outright so credentials never cross the wire
// unencrypted.
const savedLink = process.env.westernmarine_link;
process.env.westernmarine_link = "http://insecure.example.test/";
assert.equal(getSupplierCredentials("westernmarine"), null, "http portals are rejected");
process.env.westernmarine_link = savedLink;

// The cookie jar refuses to render its contents.
const jar = new CookieJar();
jar.storeFromResponse("https://portal.example.test/", {
  headers: new Headers({ "set-cookie": "SESSIONID=super-secret-value; Path=/" }),
});
assert.ok(!String(jar).includes("super-secret"), "cookie jar does not stringify its contents");
assert.ok(
  !JSON.stringify({ jar }).includes("super-secret"),
  "cookie jar does not serialize its contents",
);

// Nothing a search returns may contain credentials or session material.
invalidateSupplierCache();
const serialized = JSON.stringify(
  await searchSuppliers({ query: "44-5566", registry: mixedRegistry }),
);
for (const [name, secret] of Object.entries(SECRETS)) {
  assert.ok(!serialized.includes(secret), `${name} must never reach the response body`);
}
assert.ok(!/set-cookie|sessionid/i.test(serialized), "no session material in the response");

// Error payloads are equally clean.
const authError = new SupplierError("mercury", "AUTH_FAILED", `bad password ${SECRETS.mercury_password}`);
assert.ok(
  !authError.userMessage.includes(SECRETS.mercury_password),
  "the user-facing message never carries the internal detail",
);

// ---------------------------------------------------------------------------
// The real adapters degrade honestly
// ---------------------------------------------------------------------------

// Mercury and Western Marine are not activated yet: they must say so rather
// than invent results. Marine Parts Supply is activated, so against a host that
// does not exist it reports a transport failure instead.
invalidateSupplierCache();
const real = await searchSuppliers({ query: "8M0123456", perSupplierTimeoutMs: 3_000 });
assert.equal(real.supplierStatus.mercury, "portal_contract_unconfirmed");
assert.equal(real.supplierStatus.westernmarine, "portal_contract_unconfirmed");
assert.ok(
  ["unavailable", "timeout", "auth_failed"].includes(real.supplierStatus.marinepartssupply),
  `an activated adapter pointed at a dead host reports a transport failure, got ${real.supplierStatus.marinepartssupply}`,
);
assert.equal(real.results.length, 0, "no adapter fabricated a result");

const registry = getSupplierRegistry();
for (const id of ["mercury", "westernmarine"]) {
  const health = await registry[id].healthCheck();
  assert.equal(health.state, "portal_contract_unconfirmed");
  assert.ok(health.detail.length > 0, "health checks say what still needs confirming");
}
for (const adapter of Object.values(registry)) {
  const health = await adapter.healthCheck();
  for (const secret of Object.values(SECRETS)) {
    assert.ok(!health.detail.includes(secret), "health detail carries no credentials");
  }
}

// ---------------------------------------------------------------------------
// Marine Parts Supply field mapping, against a captured real response
// ---------------------------------------------------------------------------

// Recorded from https://marinepartssupply.com/api on 2026-09-08. The dealer
// price is deliberately different from retail here so the two cannot be
// silently mapped onto the same field.
const MPS_SEARCH_FIXTURE = {
  results: [
    {
      id: 9567,
      part_code: "18-2001",
      code_desc1: "OIL SEAL",
      code_desc2: "",
      ecommerce_desc: "Oil Seal",
      qty_onhand: 2,
      qty_bo: 0,
      qty_resv: 0,
      is_instock: true,
      stock_status: "in",
      price_retail: 17.52,
      current_price: 15.2,
      vendor1_code: "M1162",
      vendor1_friendly_name: "Sierra",
      status: "active",
      media_links: [{ media_asset_id: 8533, preference: 100 }],
      matched_xrefs: [],
    },
  ],
  total: 1,
  limit: 25,
  offset: 0,
};

const MPS_DETAIL_FIXTURE = {
  part_code: "18-2001",
  ecommerce_desc: "Oil Seal",
  qty_available: 2,
  stock_status: "in",
  price_retail: 17.52,
  current_price: 15.2,
  vendor1_friendly_name: "Sierra",
  images: [{ asset_id: 8533, preference: 100, title: "18-2001_2.jpg" }],
  xrefs: ["03099930947", "47-2001"],
  substitutes: [{ part_code: "BRP330137", code_desc1: "SEAL, DRL 5-PK", qty_available: 6 }],
};

const requestLog = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const href = String(url);
  requestLog.push({ href, init });
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });

  if (href.includes("/api/auth/login")) {
    // The deployed API answers camelCase even though its OpenAPI document says
    // snake_case; the adapter must accept the shape the service actually sends.
    return json({ accessToken: "test-token", refreshToken: "r", tokenType: "bearer" });
  }
  if (href.includes("/api/inventory/search")) {
    return json(MPS_SEARCH_FIXTURE);
  }
  if (href.includes("/api/inventory/parts/")) {
    return json(MPS_DETAIL_FIXTURE);
  }
  return json({ detail: "Not Found" }, 404);
};

try {
  const mps = registry.marinepartssupply;
  await mps.close();
  invalidateSupplierCache();

  const rows = await mps.searchPart("18-2001");
  assert.equal(rows.length, 1);
  const row = rows[0];

  assert.equal(row.partNumber, "18-2001");
  assert.equal(row.exactMatch, false, "a superseded result is not presented as exact");
  assert.equal(row.matchType, "superseded");
  assert.equal(
    row.supersededBy,
    "BRP330137",
    "ordinary search enriches the exact row with its replacement number",
  );
  assert.equal(row.description, "Oil Seal");
  assert.equal(row.manufacturer, "Sierra");
  assert.equal(row.dealerCost, 15.2, "current_price is the account price");
  assert.equal(row.listPrice, 17.52, "price_retail is list");
  assert.notEqual(row.dealerCost, row.listPrice, "dealer and retail stay distinct");
  assert.equal(row.stockStatus, "in_stock");
  assert.equal(row.quantityAvailable, 2);
  assert.equal(row.backorder, false);
  assert.equal(row.currency, null, "the API publishes no currency, so none is claimed");
  assert.equal(row.warehouse, null, "an unpublished field stays null");
  assert.equal(
    row.productUrl,
    "https://mps.example.test/parts/18-2001",
    "product link is built from the configured origin",
  );
  assert.equal(
    row.imageUrl,
    "https://mps.example.test/api/media-api/sized/catalog_card/8533.jpg",
    "image link uses the media preset path",
  );

  // The login must be a form-encoded OAuth2 password grant, and the search must
  // carry the bearer token that came back.
  const loginCall = requestLog.find((entry) => entry.href.includes("/api/auth/login"));
  assert.ok(loginCall, "the adapter logged in before searching");
  assert.equal(loginCall.init.method, "POST");
  assert.match(String(loginCall.init.headers["content-type"]), /form-urlencoded/);
  assert.match(String(loginCall.init.body), /grant_type=password/);

  const searchCall = requestLog.find((entry) => entry.href.includes("/api/inventory/search"));
  assert.equal(searchCall.init.headers.authorization, "Bearer test-token");
  assert.ok(
    !JSON.stringify(rows).includes(SECRETS.marinepartssupply_password),
    "the password never reaches a result",
  );

  // A never-anonymous rule: searching without a session would report retail as
  // dealer cost, so exactly one login precedes the search.
  assert.equal(
    requestLog.filter((entry) => entry.href.includes("/api/auth/login")).length,
    1,
    "one login serves the search",
  );

  const enrichedDetailCall = requestLog.find((entry) =>
    entry.href.includes("/api/inventory/parts/18-2001"),
  );
  assert.ok(enrichedDetailCall, "search fetched exact-match detail for supersession data");
  assert.equal(enrichedDetailCall.init.headers.authorization, "Bearer test-token");

  // The explicit detail API returns the same authoritative relationship.
  const detail = await mps.getPartDetails("18-2001");
  assert.equal(detail.supersededBy, "BRP330137", "substitutes carry the replacement number");
  assert.equal(detail.matchType, "superseded", "a replacement is never an exact match");
  assert.deepEqual(detail.replaces, ["03099930947", "47-2001"], "xrefs are the numbers it replaces");

  // An expired bearer token re-authenticates once and succeeds.
  const beforeRelogin = requestLog.filter((e) => e.href.includes("/api/auth/login")).length;
  let rejectedOnce = false;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    if (href.includes("/api/inventory/search") && !rejectedOnce) {
      rejectedOnce = true;
      requestLog.push({ href, init });
      return new Response("{}", { status: 401, headers: { "content-type": "application/json" } });
    }
    return previousFetch(url, init);
  };
  invalidateSupplierCache();
  const afterExpiry = await mps.searchPart("18-2001");
  assert.equal(afterExpiry.length, 1, "the search succeeds after re-authenticating");
  assert.equal(
    requestLog.filter((e) => e.href.includes("/api/auth/login")).length,
    beforeRelogin + 1,
    "exactly one extra login was performed",
  );

  await mps.close();
} finally {
  globalThis.fetch = realFetch;
}

console.log("Supplier integration checks passed.");
