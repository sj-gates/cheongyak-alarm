// 웹 푸시 알림 켜기·끄기.
// 이 기기의 알림 주소(구독), 찜한 공고 목록, 새 공고 알림 조건만 Firebase Firestore 에 저장하고,
// Firebase 예약 함수(push/route)가 매일 오전·밤 10시에 읽어서 찜한 공고 접수일과 조건에 맞는 새 공고를 알린다.
import { PUSH } from './config.js';
import { getFavorites, readSettings } from './common.js';

const STATE_KEY = 'cy.push';
const SW_URL = new URL('../sw.js', import.meta.url);
const SCOPE = new URL('../', import.meta.url);
// 서비스 워커가 알림이 끊겼을 때 혼자 다시 저장하려고 쓰는 메모 (sw.js 와 같은 이름)
const META_CACHE = 'cy-push-meta';
const META_URL = new URL('../push-meta', import.meta.url).href;

function readState() {
  try {
    return JSON.parse(localStorage.getItem(STATE_KEY) || '{}');
  } catch {
    return {};
  }
}
function writeState(v) {
  try {
    if (v) localStorage.setItem(STATE_KEY, JSON.stringify(v));
    else localStorage.removeItem(STATE_KEY);
  } catch {
    /* 저장 못 해도 알림 자체는 켜진다 */
  }
}

export function pushConfigured() {
  return !!(PUSH.firebaseProjectId && PUSH.firebaseApiKey && PUSH.vapidPublicKey);
}

/** 'ok' | 'unconfigured' | 'unsupported' | 'ios-install' | 'denied' */
export function pushSupport() {
  if (!pushConfigured()) return 'unconfigured';
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  // 아이폰은 '홈 화면에 추가'한 앱에서만 웹 푸시가 된다
  if (ios && !standalone) return 'ios-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return 'ok';
}

export function pushEnabled() {
  return !!readState().docId && 'Notification' in window && Notification.permission === 'granted';
}

/** 알림을 켜 뒀는데 브라우저 쪽에서 권한이 사라진 경우 (다시 켜야 한다) */
export function pushLost() {
  return !!readState().docId && 'Notification' in window && Notification.permission !== 'granted';
}

/** 서비스 워커: 웹 푸시 + 홈 화면 앱 설치 + 오프라인 (알림을 안 켜도 등록한다) */
export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register(SW_URL, { scope: SCOPE.pathname }).catch(() => {});
  }
}

function vapidKey(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function docUrl(docId) {
  return `https://firestore.googleapis.com/v1/projects/${PUSH.firebaseProjectId}/databases/(default)/documents/subscribers/${docId}?key=${PUSH.firebaseApiKey}`;
}

/** 어떤 브라우저에서 켰는지 (알림이 끊길 때 원인을 찾으려고 서버 기록에 남긴다): "Chrome 141 · Android · 앱" */
function clientLabel() {
  const ua = navigator.userAgent;
  const browser =
    ua.match(/SamsungBrowser\/(\d+)/)?.[0].replace('/', ' ') ??
    ua.match(/(?:Edg|EdgA)\/(\d+)/)?.[0].replace(/\//, ' ') ??
    ua.match(/(?:Chrome|CriOS)\/(\d+)/)?.[0].replace('/', ' ') ??
    ua.match(/Firefox\/(\d+)/)?.[0].replace('/', ' ') ??
    (/Safari/.test(ua) ? 'Safari' : '기타');
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : '기타';
  const app = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true ? '앱' : '브라우저';
  return `${browser} · ${os} · ${app}`;
}

/** 서버에 저장할 찜 · 새 공고 알림 조건 (Firestore 필드 모양) */
function conditionFields() {
  const favorites = Object.keys(getFavorites()).slice(0, 100);
  const s = readSettings();
  const list = (items) => ({ arrayValue: items.length ? { values: items.map((v) => ({ stringValue: v })) } : {} });
  return {
    favorites: list(favorites),
    newNotice: { booleanValue: !!s.newNotice },
    kinds: list(s.kinds.slice(0, 30)),
    regions: list(s.regions.slice(0, 30)),
    maxPrice: { integerValue: String(Number(s.maxPrice) || 0) },
    area: { stringValue: s.area },
  };
}

/** 서비스 워커용 메모: 서비스 워커가 앱을 안 열어도 같은 내용으로 다시 저장할 수 있게 */
async function writeMeta(docId) {
  await caches
    .open(META_CACHE)
    .then((c) =>
      c.put(META_URL, new Response(JSON.stringify({ docUrl: docUrl(docId), vapid: PUSH.vapidPublicKey, fields: conditionFields(), client: clientLabel() })))
    );
}

async function saveSubscription(docId, sub) {
  const { endpoint, keys } = sub.toJSON();
  const body = {
    fields: {
      endpoint: { stringValue: endpoint },
      p256dh: { stringValue: keys.p256dh },
      auth: { stringValue: keys.auth },
      ...conditionFields(),
      client: { stringValue: `${clientLabel()} · 켜기` },
      updatedAt: { timestampValue: new Date().toISOString() },
    },
  };
  const res = await fetch(docUrl(docId), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`알림 설정을 저장하지 못했어요 (${res.status})`);
  await writeMeta(docId).catch(() => {});
}

/**
 * 서비스 워커에게 확인을 부탁한다 (sw.js 의 syncPush):
 * 서버 문서를 보고 끊겼으면 새로 구독해 다시 저장 + 끊긴 사이 놓친 공고 알림, 아니면 찜·조건만 저장.
 */
async function askWorker() {
  const reg = await navigator.serviceWorker.ready;
  const worker = reg.active;
  if (!worker) return 'none';
  return new Promise((resolve) => {
    const done = (e) => {
      if (e.data?.type !== 'cy-sync') return;
      navigator.serviceWorker.removeEventListener('message', done);
      resolve(e.data.result);
    };
    navigator.serviceWorker.addEventListener('message', done);
    worker.postMessage({ type: 'cy-sync' });
    setTimeout(() => resolve('timeout'), 20000);
  });
}

/** 홈 화면 앱이면 하루 한두 번 백그라운드에서 알림이 살아 있는지 확인 (크롬) */
async function registerPeriodicCheck() {
  const reg = await navigator.serviceWorker.ready;
  if (!('periodicSync' in reg)) return;
  const status = await navigator.permissions.query({ name: 'periodic-background-sync' }).catch(() => null);
  if (status?.state !== 'granted') return;
  await reg.periodicSync.register('cy-sync', { minInterval: 12 * 3600 * 1000 });
}

function subscribe(reg) {
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKey(PUSH.vapidPublicKey) });
}

async function currentSubscription() {
  const reg = await navigator.serviceWorker.getRegistration(SCOPE.pathname);
  return reg ? reg.pushManager.getSubscription() : null;
}

/** 알림 켜기: 권한 요청 → 구독 → 저장 */
export async function enablePush() {
  const reg = await navigator.serviceWorker.register(SW_URL, { scope: SCOPE.pathname });
  await navigator.serviceWorker.ready;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('알림 권한이 허용되지 않았어요.');
  const sub = (await reg.pushManager.getSubscription()) ?? (await subscribe(reg));
  // 예전에 켰다가 꺼진 기기면 같은 문서를 다시 쓴다
  const docId = readState().docId ?? (await sha256(sub.endpoint));
  await saveSubscription(docId, sub);
  writeState({ docId, syncedAt: Date.now() });
  registerPeriodicCheck().catch(() => {});
}

/** 알림 끄기: 저장된 구독 지우고 브라우저 구독도 해제 */
export async function disablePush() {
  const { docId } = readState();
  if (docId) await fetch(docUrl(docId), { method: 'DELETE' }).catch(() => {});
  const sub = await currentSubscription().catch(() => null);
  await sub?.unsubscribe().catch(() => {});
  await caches.delete(META_CACHE).catch(() => {});
  const reg = await navigator.serviceWorker.getRegistration(SCOPE.pathname).catch(() => null);
  await reg?.periodicSync?.unregister('cy-sync').catch(() => {});
  writeState(null);
}

/** 찜 목록이나 알림 조건이 바뀌면 서버에 저장된 것도 맞춘다 (끊겨 있었으면 그 김에 다시 잇는다) */
export async function syncSubscription() {
  const { docId } = readState();
  if (!docId || !pushConfigured() || !pushEnabled()) return;
  await writeMeta(docId);
  const result = await askWorker();
  if (result !== 'error' && result !== 'none' && result !== 'timeout') writeState({ ...readState(), syncedAt: Date.now() });
}

/**
 * 사이트(홈 화면 앱)를 열 때 알림이 살아 있는지 확인하고 고친다 (30분에 한 번).
 * 크롬은 알림 주소를 말없이 바꾸거나 없앨 때가 있고, 그러면 알림 서버가 '끊김'으로 표시한다.
 * 서비스 워커가 그 표시를 보고 새로 구독해 다시 저장한다. 홈 화면 앱은 백그라운드 확인도 같이 켠다.
 */
export function syncDaily() {
  const state = readState();
  if (!state.docId || !pushConfigured() || !pushEnabled()) return;
  registerPeriodicCheck().catch(() => {});
  if (Date.now() - (state.syncedAt ?? 0) < 30 * 60 * 1000) return;
  syncSubscription().catch(() => {});
}

export async function testNotification() {
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification('🔔 알림 테스트', {
    body: '이 기기에서 청약알림 알림을 받을 수 있어요.',
    icon: new URL('../icons/icon-192.png', import.meta.url).href,
  });
}

/** 공고 목록 위 경고: 켜 둔 알림이 꺼졌을 때만 */
export function pushWarningHtml() {
  if (!pushConfigured() || !pushLost()) return '';
  return '<a class="push-lost" href="#/fav"><b>알림이 꺼졌어요</b><span>찜한 공고 알림을 받으려면 눌러서 다시 켜 주세요</span></a>';
}

/** 알림 설정 카드 (찜 탭·설정 탭 공용). 설정 전(Firebase 미설정)이면 빈 문자열 */
export function pushCardHtml() {
  const support = pushSupport();
  if (support === 'unconfigured') return '';
  const on = support === 'ok' && pushEnabled();
  const lost = pushLost();
  const body = {
    'ios-install':
      '<p class="hint">아이폰은 사파리 아래쪽 <b>공유 버튼 → 홈 화면에 추가</b>를 한 뒤, 홈 화면의 청약알림으로 열어야 알림을 켤 수 있어요.</p>',
    unsupported: '<p class="hint">이 브라우저는 알림을 지원하지 않아요. 크롬이나 사파리(홈 화면에 추가)로 열어 주세요.</p>',
    denied: `<p class="${lost ? 'push-warn' : 'hint'}">${lost ? '켜 두셨던 알림이 차단됐어요. ' : '알림이 차단돼 있어요. '}휴대폰 설정 → 애플리케이션 → 청약알림(또는 크롬) → 알림을 허용한 뒤 다시 눌러 주세요.</p>`,
    ok: on
      ? `<div class="push-actions"><button class="btn secondary" data-push="off">알림 끄기</button><button class="btn ghost" data-push="test">테스트 알림</button></div>`
      : `${lost ? '<p class="push-warn">켜 두셨던 알림이 꺼졌어요. 휴대폰이나 브라우저가 알림 권한을 해제한 것 같아요. 다시 켜 주세요.</p>' : ''}<div class="push-actions"><button class="btn primary" data-push="on">${lost ? '알림 다시 켜기' : '알림 켜기'}</button></div>`,
  }[support];
  return `
  <div class="card push-card">
    <div class="push-head"><b>이 기기 알림</b><span class="push-state ${on ? 'on' : ''}">${on ? '켜짐' : '꺼짐'}</span></div>
    <p class="hint" style="margin-top:4px">찜한 공고는 청약 접수 전날 밤 10시와 당일 오전 10시에, 조건에 맞는 새 공고는 오전 10시·밤 10시에 모아서 알려 드려요.</p>
    ${body}
  </div>`;
}
