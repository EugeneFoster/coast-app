import assert from "node:assert/strict";

// Entirely offline: every database response and portal call is intercepted.
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://routing-test.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "routing-test";
const { checkSupplierPriceWatch, discoverSupplierPriceWatches, priceWatchAdapters } = await import("../src/lib/suppliers/price-watch.ts");
const { SupplierError } = await import("../src/lib/suppliers/errors.ts");
const candidates = [
  { item_id: "mps-1", sku: "M1", query_part_number: "M1", supplier_code: "marinepartssupply" },
  { item_id: "wm-1", sku: "W1", query_part_number: "W1", supplier_code: "westernmarine" },
  { item_id: "mps-2", sku: "M2", query_part_number: "M2", supplier_code: "marinepartssupply" },
];
const portalCalls = [];
const attempts = [];
let failingMps = false;
globalThis.fetch = async (input, options) => {
  const url = new URL(typeof input === "string" ? input : input.url ?? input);
  assert.equal(url.origin, "https://routing-test.invalid", "No live network calls");
  const body = options?.body ? JSON.parse(options.body) : null;
  let data;
  if (url.pathname.endsWith("/rpc/supplier_price_route")) {
    data = [{ supplier_code: body.p_item_id.startsWith("wm") ? "westernmarine" : "marinepartssupply", reason: "Test route" }];
  } else if (url.pathname.endsWith("/rpc/routed_supplier_price_candidates")) {
    data = candidates;
  } else if (url.pathname.endsWith("/supplier_price_currency_settings")) {
    data = [];
  } else if (url.pathname.endsWith("/supplier_price_discovery_attempts")) {
    attempts.push(body); data = null;
  } else if (url.pathname.endsWith("/supplier_price_watches") && options?.method === "PATCH") {
    data = null;
  } else throw new Error(`Unexpected database request: ${url.pathname}`);
  return new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
};
for (const [supplier, adapter] of Object.entries(priceWatchAdapters)) {
  adapter.searchPart = async (query) => {
    portalCalls.push([supplier, query]);
    if (supplier === "marinepartssupply" && failingMps) throw new SupplierError(supplier, "AUTH_FAILED");
    return [];
  };
}
const blocked = await checkSupplierPriceWatch({ id: "test-watch", inventory_item_id: "wm-1", supplier_code: "marinepartssupply", active: true });
assert.equal(blocked.ok, false);
assert.match(blocked.message, /Supplier routing: use Western Marine/);
assert.equal(portalCalls.length, 0, "Wrong supplier blocked before any portal request");
const result = await discoverSupplierPriceWatches(3);
assert.deepEqual(result, { linked: 0, noMatch: 3, failed: 0 });
assert.deepEqual(portalCalls, [["marinepartssupply", "M1"], ["westernmarine", "W1"], ["marinepartssupply", "M2"]]);
assert.equal(attempts[1].supplier_code, "westernmarine");
portalCalls.length = 0;
failingMps = true;
const failed = await discoverSupplierPriceWatches(3);
assert.deepEqual(failed, { linked: 0, noMatch: 1, failed: 1 });
assert.deepEqual(portalCalls, [["marinepartssupply", "M1"], ["westernmarine", "W1"]], "A failed portal does not block the other or trigger cross-supplier fallback");
console.log("Routing worker checks passed (offline).");
