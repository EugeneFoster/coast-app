import { timingSafeEqual } from "node:crypto";
import { discoverMarinePartsSupplyWatches, runDueSupplierPriceChecks } from "@/lib/suppliers/price-watch";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.PRICE_MONITOR_CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || !supplied ||
      Buffer.byteLength(secret) !== Buffer.byteLength(supplied) ||
      !timingSafeEqual(Buffer.from(secret), Buffer.from(supplied))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const checks = await runDueSupplierPriceChecks(30);
    const discovery = await discoverMarinePartsSupplyWatches(10);
    return Response.json({ checks, discovery });
  } catch (error) {
    console.error("Supplier price monitoring failed", error);
    return Response.json({ error: "Supplier price monitoring failed" }, { status: 500 });
  }
}
