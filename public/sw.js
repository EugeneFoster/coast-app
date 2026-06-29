// COAST service worker — shop-floor offline support.
//
// Strategy:
//   - Deep-zoom tiles (/api/tiles/...) are version-pinned & immutable → cache-first.
//     Sheets a welder has opened stay viewable on-site with poor/no signal.
//   - Next.js hashed static assets (/_next/static/...) → cache-first.
//   - Navigations → network-first with an offline fallback page.
//   - Everything else (Supabase, auth, mutations) → straight to network.

const VERSION = "coast-v1";
const STATIC_CACHE = `${VERSION}-static`;
const TILE_CACHE = `${VERSION}-tiles`;
const ASSET_CACHE = `${VERSION}-assets`;
const OFFLINE_URL = "/offline.html";

const PRECACHE = [OFFLINE_URL, "/manifest.json", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !k.startsWith(VERSION))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirstNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(STATIC_CACHE);
    const offline = await cache.match(OFFLINE_URL);
    return offline ?? Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (sameOrigin && url.pathname.startsWith("/api/tiles/")) {
    event.respondWith(cacheFirst(request, TILE_CACHE));
    return;
  }

  if (sameOrigin && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }
});
