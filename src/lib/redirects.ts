export function safeInternalPath(value: unknown, fallback = "/projects") {
  if (typeof value !== "string") return fallback;

  const path = value.trim();
  return path.startsWith("/") && !path.startsWith("//") ? path : fallback;
}
