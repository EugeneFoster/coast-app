// Runs the same bounded check/discovery batch as the scheduled monitor.
// Never prints the authorization token or changes selling prices automatically.
const secret = process.env.PRICE_MONITOR_CRON_SECRET;
if (!secret) throw new Error("Price-monitor secret is not configured.");
const response = await fetch("https://coast-app-production.up.railway.app/api/supplier-price-monitor", {
  method: "POST",
  headers: { authorization: `Bearer ${secret}` },
  signal: AbortSignal.timeout(180_000),
});
const result = await response.json();
console.log(JSON.stringify({ status: response.status, ...result }));
if (!response.ok || typeof result.checks?.paused !== "number") process.exitCode = 1;
