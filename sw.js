// sw.js — place this file at the ROOT of your real domain
// (e.g. https://jpslogisticsmiami.com/sw.js), next to index.html.
//
// A single downloaded HTML file (or the Claude preview link) cannot run a
// service worker — browsers only allow them on same-origin http(s) files,
// which is why this lives here as its own file instead of being inlined.
// Once this is hosted at your real domain's root, the "Activer les
// notifications" button in the client dashboard will be able to register
// it and push notifications (daily greeting + shipment status changes)
// will work.

const CACHE_NAME = 'jps-logistics-v2';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first: always serve the latest site, fall back to cache only when offline.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) return;
  event.respondWith(
    fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match(event.request))
  );
});

// Incoming push notifications from the send-notifications Edge Function
self.addEventListener('push', (event) => {
  let data = { title: "JP's Logistics & More", body: '' };
  try { data = event.data.json(); } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(data.title || "JP's Logistics & More", {
      body: data.body || '',
      icon: '/icon-192.png'
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow('/'));
});
