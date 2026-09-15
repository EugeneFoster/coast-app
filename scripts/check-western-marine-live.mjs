import { WesternMarineAdapter } from "../src/lib/suppliers/adapters/western-marine.ts";

const query = process.argv[2] ?? "18-7420";
const adapter = new WesternMarineAdapter();

try {
  const results = await adapter.searchPart(query);
  console.log(JSON.stringify({
    query,
    matches: results.map((result) => ({
      partNumber: result.partNumber,
      supplierSku: result.supplierSku,
      matchType: result.matchType,
      stockStatus: result.stockStatus,
      quantityAvailable: result.quantityAvailable,
      dealerCost: result.dealerCost,
      listPrice: result.listPrice,
      currency: result.currency,
    })),
  }));
  if (results.length === 0) process.exitCode = 1;
} catch (caught) {
  console.error(caught instanceof Error ? caught.name + ": " + caught.message : "Search failed");
  process.exitCode = 1;
} finally {
  await adapter.close();
}
