/* Offline for the study page, and nothing more.
 *
 * Network first, always. A cache-first worker is how a page gets stuck on a
 * version from three deploys ago with no way for the user to tell; this one
 * only reaches for the cache when the network actually fails, which is the
 * case it exists for — a phone on the underground.
 *
 * Scope is /vocab/, so the rest of the site is untouched. Sign-in and sync
 * are never cached: a stale answer there would be worse than no answer.
 */
const VERSION = "vocab-3";
const SHELL = [
  "/vocab/",
  "/vocab/manifest.webmanifest",
  "/vocab/icon-192.png",
  "/vocab/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;      /* Wiktionary etc. */
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;
  if (!url.pathname.startsWith("/vocab/")) return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        /* Keep a copy of what worked, for the next time it does not. */
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match("/vocab/")))
  );
});
