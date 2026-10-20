/**
 * Firebase Functions
 *   route: 내 장소 → 공고 길찾기 중계 (아래)
 *   notifyMorning · notifyEvening: 웹 푸시 알림, 매일 한국 시간 오전 10시 · 밤 10시 정각 (notify.js)
 *
 * 내 장소 → 공고 길찾기 중계.
 * 키를 브라우저에 두지 않으려고 여기서 대신 부른다.
 *   자동차: 카카오내비 길찾기 (지금 교통 기준)
 *   대중교통: 서울시 대중교통 환승경로 (버스+지하철)
 * 좌표는 POST 본문으로만 받는다 (주소창·요청 기록에 남지 않게). 아무것도 저장하지 않는다.
 */
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import webpush from 'web-push';

import { runNotify, vapidPublicKeyFrom } from './notify.js';

const KAKAO_REST_KEY = defineSecret('KAKAO_REST_KEY');
const SEOUL_BUS_KEY = defineSecret('SEOUL_BUS_KEY');
const VAPID_PRIVATE_KEY = defineSecret('VAPID_PRIVATE_KEY');

// 공고 사이트 주소 (도메인을 옮기면 여기도 바꾼다)
const SITE_URL = 'https://sj-gates.github.io/cheongyak-alarm';

const ORIGINS = ['https://sj-gates.github.io', /^http:\/\/localhost(:\d+)?$/];
const TIMEOUT_MS = 12_000;

/** 같은 길을 여러 번 묻지 않게 잠깐 기억 (인스턴스 메모리, 10분) */
const cache = new Map();
const CACHE_MS = 10 * 60 * 1000;

const inKorea = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.lat > 33 && p.lat < 39 && p.lng > 124 && p.lng < 132;
const round = (v) => Math.round(v * 1e4) / 1e4; // 약 10m 단위로 맞춰 캐시를 같이 쓴다

async function getJson(url, init) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** 자동차: 분 · km · 택시비 · 통행료 */
async function car(from, to) {
  const q = new URLSearchParams({ origin: `${from.lng},${from.lat}`, destination: `${to.lng},${to.lat}`, priority: 'RECOMMEND', summary: 'true' });
  const j = await getJson(`https://apis-navi.kakaomobility.com/v1/directions?${q}`, {
    headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY.value().trim()}` },
  });
  const r = j.routes?.[0];
  if (!r || r.result_code !== 0) return null;
  return {
    minutes: Math.round(r.summary.duration / 60),
    km: Math.round(r.summary.distance / 100) / 10,
    taxi: r.summary.fare?.taxi ?? null,
    toll: r.summary.fare?.toll ?? null,
  };
}

/** 대중교통: 가장 빠른 경로의 분 · 환승 횟수 · 타는 노선 */
async function transit(from, to) {
  const q = new URLSearchParams({
    serviceKey: SEOUL_BUS_KEY.value().trim(),
    startX: String(from.lng),
    startY: String(from.lat),
    endX: String(to.lng),
    endY: String(to.lat),
    resultType: 'json',
  });
  const j = await getJson(`http://ws.bus.go.kr/api/rest/pathinfo/getPathInfoByBusNSub?${q}`);
  const items = j.msgBody?.itemList;
  const list = Array.isArray(items) ? items : items ? [items] : [];
  const best = list.map((it) => ({ ...it, time: Number(it.time) })).filter((it) => it.time > 0).sort((a, b) => a.time - b.time)[0];
  if (!best) return null;
  const legs = Array.isArray(best.pathList) ? best.pathList : best.pathList ? [best.pathList] : [];
  return {
    minutes: best.time,
    transfers: Math.max(legs.length - 1, 0),
    lines: legs.map((l) => String(l.routeNm ?? '').trim()).filter(Boolean),
  };
}

const settle = (p) => p.then((v) => v, (e) => ({ error: String(e?.message ?? e).slice(0, 80) }));

export const route = onRequest(
  { region: 'asia-northeast3', cors: ORIGINS, secrets: [KAKAO_REST_KEY, SEOUL_BUS_KEY], maxInstances: 2, memory: '256MiB', timeoutSeconds: 30 },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'POST only' });
      return;
    }
    const { from, to } = req.body ?? {};
    if (!inKorea(from) || !inKorea(to)) {
      res.status(400).json({ error: 'bad coords' });
      return;
    }
    const a = { lat: round(from.lat), lng: round(from.lng) };
    const b = { lat: round(to.lat), lng: round(to.lng) };
    const key = `${a.lat},${a.lng}>${b.lat},${b.lng}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) {
      res.json(hit.body);
      return;
    }
    const [c, t] = await Promise.all([settle(car(a, b)), settle(transit(a, b))]);
    const body = { car: c, transit: t, at: Date.now() };
    if (!c?.error && !t?.error) {
      if (cache.size > 500) cache.clear();
      cache.set(key, { at: Date.now(), body });
    }
    res.set('Cache-Control', 'no-store').json(body);
  }
);

// ── 웹 푸시 알림 (GitHub 예약 실행은 몇 시간씩 늦어서 Cloud Scheduler 로 정각에) ──
initializeApp();

const notifyAt = (schedule, mode) =>
  onSchedule(
    { schedule, timeZone: 'Asia/Seoul', region: 'asia-northeast3', secrets: [VAPID_PRIVATE_KEY], memory: '256MiB', timeoutSeconds: 300, retryCount: 1 },
    async () => {
      webpush.setVapidDetails(SITE_URL, await vapidPublicKeyFrom(SITE_URL), VAPID_PRIVATE_KEY.value().trim());
      // 같은 날 두 번 돌아도(재시도) 찜 알림은 한 번만 간다 (meta/push 의 보낸 기록)
      await runNotify({ db: getFirestore(), webpush, siteUrl: SITE_URL, mode });
    }
  );

/** 오전 10시: 오늘 청약 접수 시작 · 오늘 마감 + 밤사이 올라온 새 공고 */
export const notifyMorning = notifyAt('0 10 * * *', 'morning');
/** 밤 10시: 내일 청약 접수 시작 + 낮에 올라온 새 공고 */
export const notifyEvening = notifyAt('0 22 * * *', 'evening');
