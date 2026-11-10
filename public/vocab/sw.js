/* FlashCards moved to /flashcards/. This worker exists only to get out of
 * the way.
 *
 * A service worker outlives the page that registered it. The one that used
 * to own /vocab/ was network-first, so it would not have trapped anybody on
 * a stale page — but it would go on answering for an address with no app
 * behind it, and its caches would sit there for good. So: claim, delete
 * what belonged to the old app, and unregister.
 *
 * Only the caches named for the old app. Cache storage is shared across the
 * whole origin, so deleting everything would take the new app's cache with
 * it — which is exactly the sort of thing that looks like it worked in a
 * test and breaks on a phone with no signal.
 */
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => /^vocab-/.test(k)).map((k) => caches.delete(k))
      ))
      .then(() => self.registration.unregister())
      .catch(() => {})
  );
});

/* No fetch handler, so nothing here is between the browser and the network. */
