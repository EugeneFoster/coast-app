const url = process.env.MONITOR_URL;
const secret = process.env.PRICE_MONITOR_CRON_SECRET;

if (!url || !secret || !url.startsWith("https://")) {
  throw new Error("MONITOR_URL (HTTPS) and PRICE_MONITOR_CRON_SECRET are required.");
}

const response = await fetch(url, {
  method: "POST",
  headers: { Authorization: `Bearer ${secret}` },
  signal: AbortSignal.timeout(5 * 60 * 1000),
});
const body = await response.text();
if (!response.ok) {
  throw new Error(`Supplier price monitor returned HTTP ${response.status}: ${body.slice(0, 200)}`);
}
console.log(`Supplier price monitoring completed: ${body.slice(0, 200)}`);
