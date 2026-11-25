// 서비스 워커: 웹 푸시 알림 + 홈 화면 앱(오프라인에서도 마지막으로 본 화면) + 알림이 끊기면 스스로 다시 잇기.
// 알림은 Firebase 예약 함수(push/route)가 매일 오전·밤 10시에 보낸다: { title, body, url, tag }

const CACHE = 'cy-offline-v1';
// 사이트가 알림을 켤 때 남겨 둔 메모 (push.js): 알림 서버 문서 주소 · 공개 키 · 찜·조건
const META_CACHE = 'cy-push-meta';
const META_URL = new URL('push-meta', self.registration.scope).href;
const LOCAL_URL = new URL('push-local', self.registration.scope).href; // 이 기기에서 마지막으로 확인한 것
const SYNC_TAG = 'cy-sync';

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
    Promise.all([
      self.registration.showNotification(data.title || '청약알림', {
        body: data.body || '',
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
        tag: data.tag,
        data: { url: data.url || './' },
      }),
      // 알림이 왔다 = 지금 주소는 살아 있다. 확인한 시각을 남기고, 브라우저가 주소를 바꿨으면 새 주소를 저장
      syncPush('push').catch(() => {}),
    ])
  );
});

// ── 알림이 끊기면 다시 잇기 ──────────────────────────────────────
// 크롬은 알림 주소를 스스로 바꾸거나 없애도 알려 주지 않을 때가 많다. 그러면 알림 서버는 그 주소를 '끊김'으로 표시한다.
// 사이트를 열 때 · 하루 한두 번 백그라운드(홈 화면 앱) · 알림을 받을 때 서버 문서를 확인해서
// 끊겼으면 새로 구독해 다시 저장하고, 끊긴 사이 놓친 공고를 알림 한 번으로 알려 준다.

async function readJsonCache(url) {
  const hit = await caches.open(META_CACHE).then((c) => c.match(url));
  return hit ? hit.json() : null;
}
async function writeJsonCache(url, value) {
  await caches.open(META_CACHE).then((c) => c.put(url, new Response(JSON.stringify(value))));
}

function vapidBytes(vapid) {
  const pad = '='.repeat((4 - (vapid.length % 4)) % 4);
  return Uint8Array.from(atob((vapid + pad).replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0));
}

const str = (f) => f?.stringValue;
const strs = (f) => (f?.arrayValue?.values ?? []).map((v) => v.stringValue);

/**
 * via: page(사이트를 열었을 때) · periodic(백그라운드) · push(알림을 받을 때) · change(브라우저가 주소를 바꿈)
 * 돌려주는 값: 'ok' | 'fixed' | 'saved' | 'off' | 'blocked'
 */
async function syncPush(via, newSub) {
  const meta = await readJsonCache(META_URL);
  if (!meta) return 'off'; // 알림을 안 켰다
  const { docUrl, vapid, fields } = meta;
  const pm = self.registration.pushManager;
  const permission = await pm.permissionState({ userVisibleOnly: true, applicationServerKey: vapidBytes(vapid) }).catch(() => 'granted');
  if (permission !== 'granted') return 'blocked'; // 권한이 없으면 아무것도 할 수 없다 (사이트를 열면 경고가 뜬다)

  // 서버 문서: 없거나(예전 방식으로 지워짐) 끊김 표시면 고쳐야 한다
  const res = await fetch(docUrl, { cache: 'no-store' });
  if (!res.ok && res.status !== 404) throw new Error(`알림 서버 확인 실패 ${res.status}`);
  const doc = res.ok ? await res.json() : null;
  const dead = !doc || doc.fields?.dead?.booleanValue === true;
  const deadSince = doc?.fields?.deadAt?.timestampValue;

  let sub = newSub || (await pm.getSubscription());
  if (dead && sub && !newSub) {
    // 서버가 '끊김'이라 한 주소는 다시 쓰지 않는다
    await sub.unsubscribe().catch(() => {});
    sub = null;
  }
  if (!sub) sub = await pm.subscribe({ userVisibleOnly: true, applicationServerKey: vapidBytes(vapid) });

  const { endpoint, keys } = sub.toJSON();
  const changed = !doc || str(doc.fields?.endpoint) !== endpoint;
  // 백그라운드·알림 수신 때는 고칠 게 있을 때만 저장한다 (사이트를 열 때는 찜·조건이 바뀌었을 수 있어서 늘 저장)
  if (dead || changed || via === 'page' || via === 'change') {
    const save = await fetch(docUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          ...fields,
          endpoint: { stringValue: endpoint },
          p256dh: { stringValue: keys.p256dh },
          auth: { stringValue: keys.auth },
          client: { stringValue: `${meta.client ?? '?'} · ${via}${dead ? ' · 다시 연결' : ''}`.slice(0, 120) },
          updatedAt: { timestampValue: new Date().toISOString() },
        },
      }),
    });
    if (!save.ok) throw new Error(`알림 서버 저장 실패 ${save.status}`);
  }

  const local = (await readJsonCache(LOCAL_URL)) ?? {};
  if (dead) {
    // 끊긴 사이 놓친 것 알려 주기 (끊긴 시각을 모르면 이 기기가 마지막으로 정상 확인한 때, 그것도 모르면 일주일 전부터. 접수가 끝난 건 뺀다)
    const since = Date.parse(deadSince ?? '') || local.okAt || Date.now() - 7 * 86400000;
    await catchUp(fields, since).catch(() => {});
  }
  await writeJsonCache(LOCAL_URL, { ...local, okAt: Date.now(), via });
  return dead ? 'fixed' : changed ? 'saved' : 'ok';
}

const KST_MS = 9 * 3600 * 1000;
const kstDate = (t, add = 0) => new Date(t + KST_MS + add * 86400000).toISOString().slice(0, 10);
const RECEIPT_KINDS = new Set(['special', 'rank1', 'rank2', 'general', 'receipt']);

/** 알림이 끊긴 사이 올라온 조건에 맞는 새 공고 + 오늘·내일 찜한 공고 접수를 알림 한 번으로 */
async function catchUp(fields, since) {
  const res = await fetch(new URL('data/notices.json', self.registration.scope).href, { cache: 'no-store' });
  if (!res.ok) return;
  const notices = (await res.json()).notices ?? [];
  const favorites = new Set(strs(fields.favorites));
  const kinds = strs(fields.kinds);
  const regions = strs(fields.regions);
  const today = kstDate(Date.now());
  const tomorrow = kstDate(Date.now(), 1);

  const fresh = fields.newNotice?.booleanValue
    ? notices.filter(
        (n) =>
          (n.firstSeen ?? 0) > since &&
          !favorites.has(n.key) &&
          (!kinds.length || kinds.includes(n.kind)) &&
          (!regions.length || regions.includes(n.region)) &&
          (n.receiptEnd ?? n.receiptStart ?? '9999') >= today // 이미 접수가 끝난 건 빼고
      )
    : [];
  const soon = notices.filter(
    (n) => favorites.has(n.key) && n.events.some((ev) => RECEIPT_KINDS.has(ev.kind) && (ev.start === today || ev.start === tomorrow))
  );
  if (!fresh.length && !soon.length) return;

  const lines = [
    ...soon.slice(0, 3).map((n) => `★ ${n.name} 곧 접수`),
    ...fresh.slice(0, 5 - Math.min(soon.length, 3)).map((n) => `${n.name} · ${n.region}`),
  ];
  const total = fresh.length + soon.length;
  await self.registration.showNotification(fresh.length ? `알림이 끊긴 사이 새 공고 ${fresh.length}건` : '곧 접수하는 찜한 공고가 있어요', {
    body: lines.join('\n') + (total > lines.length ? `\n외 ${total - lines.length}건` : ''),
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: 'catch-up',
    data: { url: soon.length && !fresh.length ? './#/fav' : './' },
  });
}

// 사이트가 열릴 때 확인을 부탁한다 (push.js)
self.addEventListener('message', (event) => {
  if (event.data?.type !== SYNC_TAG) return;
  event.waitUntil(
    syncPush('page')
      .then((result) => event.source?.postMessage({ type: SYNC_TAG, result }))
      .catch((e) => event.source?.postMessage({ type: SYNC_TAG, result: 'error', message: String(e?.message ?? e) }))
  );
});

// 홈 화면 앱은 앱을 안 열어도 하루 한두 번 깨워 준다 (크롬, 자주 쓰는 앱일수록 자주)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === SYNC_TAG) event.waitUntil(syncPush('periodic').catch(() => {}));
});

// 브라우저가 알림 주소를 바꿨다고 알려 줄 때 (크롬은 거의 안 보낸다)
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(syncPush('change', event.newSubscription).catch(() => {}));
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
