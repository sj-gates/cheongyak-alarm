// 웹 푸시 알림 켜기·끄기.
// 이 기기의 알림 주소(구독), 찜한 공고 목록, 새 공고 알림 조건만 Firebase Firestore 에 저장하고,
// GitHub Actions(push/send.ts)가 매일 아침·저녁에 읽어서 찜한 공고 접수일과 조건에 맞는 새 공고를 알린다.
import { PUSH } from './config.js';
import { getFavorites, readSettings } from './common.js';

const STATE_KEY = 'cy.push';
const SW_URL = new URL('../sw.js', import.meta.url);
const SCOPE = new URL('../', import.meta.url);

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

export function registerServiceWorker() {
  if (pushConfigured() && 'serviceWorker' in navigator) {
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

async function saveSubscription(docId, sub) {
  const { endpoint, keys } = sub.toJSON();
  const favorites = Object.keys(getFavorites()).slice(0, 100);
  const s = readSettings();
  const list = (items) => ({ arrayValue: items.length ? { values: items.map((v) => ({ stringValue: v })) } : {} });
  const body = {
    fields: {
      endpoint: { stringValue: endpoint },
      p256dh: { stringValue: keys.p256dh },
      auth: { stringValue: keys.auth },
      favorites: list(favorites),
      // 새 공고 알림 조건
      newNotice: { booleanValue: !!s.newNotice },
      kinds: list(s.kinds.slice(0, 30)),
      regions: list(s.regions.slice(0, 30)),
      maxPrice: { integerValue: String(Number(s.maxPrice) || 0) },
      area: { stringValue: s.area },
      updatedAt: { timestampValue: new Date().toISOString() },
    },
  };
  const res = await fetch(docUrl(docId), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`알림 설정을 저장하지 못했어요 (${res.status})`);
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
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKey(PUSH.vapidPublicKey) }));
  const docId = await sha256(sub.endpoint);
  await saveSubscription(docId, sub);
  writeState({ docId });
}

/** 알림 끄기: 저장된 구독 지우고 브라우저 구독도 해제 */
export async function disablePush() {
  const { docId } = readState();
  if (docId) await fetch(docUrl(docId), { method: 'DELETE' }).catch(() => {});
  const sub = await currentSubscription().catch(() => null);
  await sub?.unsubscribe().catch(() => {});
  writeState(null);
}

/** 찜 목록이나 알림 조건이 바뀌면 서버에 저장된 것도 맞춘다 */
export async function syncSubscription() {
  const { docId } = readState();
  if (!docId || !pushConfigured()) return;
  const sub = await currentSubscription();
  if (!sub) {
    writeState(null);
    return;
  }
  await saveSubscription(docId, sub);
}

export async function testNotification() {
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification('🔔 알림 테스트', {
    body: '이 기기에서 청약알림 알림을 받을 수 있어요.',
    icon: new URL('../icons/icon-192.png', import.meta.url).href,
  });
}

/** 알림 설정 카드 (찜 탭·설정 탭 공용). 설정 전(Firebase 미설정)이면 빈 문자열 */
export function pushCardHtml() {
  const support = pushSupport();
  if (support === 'unconfigured') return '';
  const on = support === 'ok' && pushEnabled();
  const body = {
    'ios-install':
      '<p class="hint">아이폰은 사파리 아래쪽 <b>공유 버튼 → 홈 화면에 추가</b>를 한 뒤, 홈 화면의 청약알림으로 열어야 알림을 켤 수 있어요.</p>',
    unsupported: '<p class="hint">이 브라우저는 알림을 지원하지 않아요. 크롬이나 사파리(홈 화면에 추가)로 열어 주세요.</p>',
    denied: '<p class="hint">알림이 차단돼 있어요. 브라우저 설정에서 이 사이트의 알림을 허용한 뒤 다시 눌러 주세요.</p>',
    ok: on
      ? `<div class="push-actions"><button class="btn secondary" data-push="off">알림 끄기</button><button class="btn ghost" data-push="test">테스트 알림</button></div>`
      : `<div class="push-actions"><button class="btn primary" data-push="on">알림 켜기</button></div>`,
  }[support];
  return `
  <div class="card push-card">
    <div class="push-head"><b>이 기기 알림</b><span class="push-state ${on ? 'on' : ''}">${on ? '켜짐' : '꺼짐'}</span></div>
    <p class="hint" style="margin-top:4px">찜한 공고의 청약 접수 전날 저녁 8시·당일 아침 8시쯤, 그리고 조건에 맞는 새 공고가 올라오면 아침·저녁 8시쯤 알려 드려요.</p>
    ${body}
  </div>`;
}
