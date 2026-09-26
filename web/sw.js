// 웹 푸시 알림을 받아 보여 주는 서비스 워커.
// 알림은 GitHub Actions(push/send.ts)가 보낸다: { title, body, url, tag }

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || '청약알림', {
      body: data.body || '',
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      tag: data.tag,
      data: { url: data.url || './' },
    })
  );
});

// 알림을 누르면 공고 페이지로 (이미 열려 있으면 그 창으로)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || './', self.registration.scope).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const same = windows.find((w) => w.url === url);
      if (same) return same.focus();
      return self.clients.openWindow(url);
    })()
  );
});
