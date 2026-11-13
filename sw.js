// Compatibility retirement worker: never cache or intercept requests.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  const names = await caches.keys();
  await Promise.allSettled(names.filter(name => name.startsWith('icf-')).map(name => caches.delete(name)));
  await self.clients.claim();
  const tabs = await self.clients.matchAll({type:'window',includeUncontrolled:true});
  await self.registration.unregister();
  // One-time normal reload detaches the old cache worker; saved local data stays.
  await Promise.allSettled(tabs.filter(tab => tab.url.startsWith(self.registration.scope)).map(tab => tab.navigate(tab.url)));
})()));
