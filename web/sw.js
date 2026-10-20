// 서비스 워커: 웹 푸시 알림 + 홈 화면 앱(오프라인에서도 마지막으로 본 화면).
// 알림은 GitHub Actions(push/send.ts)가 보낸다: { title, body, url, tag }

const CACHE = 'cy-offline-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) =>
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith('cy-offline-') && key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })()
  )
);

// 늘 새로 받아 오고(공고는 하루 두 번 바뀐다), 인터넷이 안 될 때만 마지막으로 받은 것을 보여 준다
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  event.respondWith(
    (async () => {
      try {
        const res = await fetch(req);
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          event.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy)));
        }
        return res;
      } catch (err) {
        const hit = await caches.match(req, { ignoreSearch: true });
        if (hit) return hit;
        if (req.mode === 'navigate') {
          const home = await caches.match(scope.href);
          if (home) return home;
        }
        throw err;
      }
    })()
  );
});

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

// 브라우저가 알림 주소를 바꾸면(오래돼 갱신 등) 새 주소로 다시 구독해 알림 서버에 저장한다.
// 무엇을 저장할지는 사이트가 알림을 켤 때 남겨 둔 메모(push.js 의 cy-push-meta)를 쓴다.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const metaUrl = new URL('push-meta', self.registration.scope).href;
      const hit = await caches.open('cy-push-meta').then((c) => c.match(metaUrl));
      if (!hit) return;
      const { docUrl, vapid, fields } = await hit.json();
      const pad = '='.repeat((4 - (vapid.length % 4)) % 4);
      const key = Uint8Array.from(atob((vapid + pad).replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0));
      const sub = event.newSubscription || (await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
      const { endpoint, keys } = sub.toJSON();
      await fetch(docUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            ...fields,
            endpoint: { stringValue: endpoint },
            p256dh: { stringValue: keys.p256dh },
            auth: { stringValue: keys.auth },
            updatedAt: { timestampValue: new Date().toISOString() },
          },
        }),
      });
    })().catch(() => {})
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
