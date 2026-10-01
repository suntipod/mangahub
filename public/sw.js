// Service Worker for MangaHub PWA
const CACHE_NAME = "mangahub-pwa-v1";
const STATIC_ASSETS = [
  "/",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/icon.svg"
];

// Install: pre-cache critical shell assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn("ServiceWorker pre-cache error:", err);
      });
    })
  );
  self.skipWaiting();
});

// Activate: cleanup old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch: Network first with cache fallback for HTML/assets; bypass APIs
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never cache API requests or external scraping / Supabase calls
  if (
    url.pathname.startsWith("/api/") ||
    event.request.method !== "GET" ||
    url.hostname.includes("supabase.co") ||
    url.hostname.includes("anilist.co") ||
    url.hostname.includes("mangadex.org")
  ) {
    return;
  }

  // Network-first strategy for navigation and static assets
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone and store valid responses
        if (response && response.status === 200 && response.type === "basic") {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // If navigation fails and no cache, return root cache
          if (event.request.mode === "navigate") {
            return caches.match("/");
          }
        });
      })
  );
});
