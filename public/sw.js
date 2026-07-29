/**
 * Field Ops offline shell.
 *
 * Strategy split — the previous single cache-first rule served stale HTML for a
 * whole extra visit after every deploy, and its cache name never rotated:
 *
 *   navigations  -> network-first, falling back to the cached shell then /offline
 *   /assets/*    -> cache-first (content-hashed filenames are immutable)
 *   everything   -> stale-while-revalidate
 *
 * BUILD_ID and PRECACHE below are rewritten by scripts/build-sw.mjs after
 * `vite build`, so a deploy always lands in a fresh cache and the full hashed
 * asset graph is precached — that is what makes the game genuinely playable
 * off-grid rather than only if you happen to have visited every route.
 */
const BUILD_ID = "dev";
const PRECACHE = ["/", "/offline", "/manifest.webmanifest"];

const CACHE = `fieldops-${BUILD_ID}`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // Individually, so one 404 cannot fail the whole install.
      .then((c) =>
        Promise.allSettled(PRECACHE.map((url) => c.add(new Request(url, { cache: "reload" })))),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith("fieldops-") && k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** Deep links multiply cached copies of the same HTML; key them as one. */
function shellKey(url) {
  return new URL(url).origin + new URL(url).pathname;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(shellKey(req.url), copy));
          return res;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE);
          return (
            (await cache.match(shellKey(req.url))) ??
            (await cache.match("/")) ??
            (await cache.match("/offline")) ??
            new Response("OFFLINE — SURVEY MESH UNAVAILABLE", {
              status: 503,
              headers: { "content-type": "text/plain; charset=utf-8" },
            })
          );
        }),
    );
    return;
  }

  const immutable = url.pathname.startsWith("/assets/");
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      if (cached && immutable) return cached;

      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);

      return cached ?? network;
    }),
  );
});
