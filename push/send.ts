/**
 * 웹 푸시 알림 보내기 (GitHub Actions: .github/workflows/push.yml)
 *
 *   찜한 공고   아침(한국 8시 전): 오늘 청약 접수 시작 · 오늘 접수 마감 / 저녁(한국 20시 전): 내일 청약 접수 시작
 *   새 공고     지난 발송 뒤 새로 올라온 공고 가운데 구독자가 정한 조건(종류·지역·최대 분양가·면적)에 맞는 것
 *
 * 구독(기기별 알림 주소 + 찜한 공고 key + 새 공고 알림 조건)은 Firebase Firestore 의 subscribers 컬렉션,
 * 공고는 배포된 사이트의 data/notices.json, 주택형(분양가·면적)은 data/state.json 에서 읽는다.
 * 새 공고를 어디까지 알렸는지는 Firestore 의 meta/push 문서(newSince)에 남긴다.
 *
 * 필요한 값: FIREBASE_SERVICE_ACCOUNT(서비스 계정 JSON), VAPID_PRIVATE_KEY, SITE_URL, TZ=Asia/Seoul
 * 선택: MODE=auto|morning|evening|test, DRY_RUN=true (보내지 않고 누구에게 뭘 보낼지만 출력)
 *   test: 최근 10분 안에 알림을 켠(찜·조건을 바꾼) 기기에만 시험 알림 — 공개 사이트라 다른 사람에게 가지 않게
 */
import fs from 'node:fs';
import path from 'node:path';

import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import webpush from 'web-push';

interface WebEvent {
  id: string;
  kind: string;
  label: string;
  start: string;
  end?: string;
}
interface WebNotice {
  key: string;
  name: string;
  region: string;
  kind: string;
  typeName?: string;
  firstSeen?: number;
  receiptStart?: string;
  receiptEnd?: string;
  events: WebEvent[];
}
interface Model {
  exclusiveArea?: number;
  price?: number; // 만원
}
interface Message {
  notice: WebNotice;
  title: string;
}
interface Conditions {
  newNotice?: boolean;
  kinds?: string[];
  regions?: string[];
  maxPrice?: number;
  area?: string;
}
interface Payload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

const RECEIPT_KINDS = new Set(['special', 'rank1', 'rank2', 'general', 'receipt']);
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
// 처음 실행(어디까지 알렸는지 기록이 없을 때)은 최근 12시간 안에 올라온 공고만
const FIRST_WINDOW_MS = 12 * 3600 * 1000;

const toDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const shortDate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return `${m}.${d}(${WEEKDAYS[new Date(y, m - 1, d).getDay()]})`;
};
const range = (ev: WebEvent) => (ev.end && ev.end !== ev.start ? `${shortDate(ev.start)} ~ ${shortDate(ev.end)}` : shortDate(ev.start));

/** web/assets/config.js 의 공개 키를 그대로 쓴다 (둘이 어긋나면 알림이 안 가므로) */
function vapidPublicKey(): string {
  const config = fs.readFileSync(path.resolve(__dirname, '../web/assets/config.js'), 'utf8');
  const m = config.match(/vapidPublicKey:\s*'([^']+)'/);
  if (!m) throw new Error('web/assets/config.js 에서 vapidPublicKey 를 찾지 못했어요.');
  return m[1];
}

/** 이 구독자에게 보낼 찜한 공고 접수일 알림 */
export function messagesFor(favorites: string[], notices: Map<string, WebNotice>, mode: 'morning' | 'evening', today: string, tomorrow: string) {
  const out: Message[] = [];
  for (const key of favorites) {
    const n = notices.get(key);
    if (!n) continue;
    for (const ev of n.events) {
      if (!RECEIPT_KINDS.has(ev.kind)) continue;
      if (mode === 'evening' && ev.start === tomorrow) out.push({ notice: n, title: `내일 ${ev.label} 접수` });
      if (mode === 'morning' && ev.start === today) out.push({ notice: n, title: `오늘 ${ev.label} 접수${ev.end && ev.end !== ev.start ? ` (${range(ev)})` : ''}` });
      if (mode === 'morning' && ev.end && ev.end !== ev.start && ev.end === today) out.push({ notice: n, title: `오늘 ${ev.label} 접수 마감` });
    }
  }
  return out;
}

const inArea = (area: string | undefined, a: number) =>
  area === 'small' ? a <= 60 : area === 'mid' ? a > 60 && a <= 85 : area === 'large' ? a > 85 : true;

/**
 * 새 공고가 구독자 조건에 맞는지. 종류·지역은 비어 있으면 모두.
 * 최대 분양가·면적은 주택형 가운데 하나라도 맞으면 된다 (주택형 정보가 없거나 가격이 비어 있으면 따지지 않는다).
 */
export function matches(n: WebNotice, c: Conditions, models: Model[] | undefined): boolean {
  if (c.kinds?.length && !c.kinds.includes(n.kind)) return false;
  if (c.regions?.length && !c.regions.includes(n.region)) return false;
  const priceLimit = c.maxPrice && c.maxPrice > 0 ? c.maxPrice : 0;
  const areaLimit = c.area && c.area !== 'all' ? c.area : undefined;
  if (!models?.length || (!priceLimit && !areaLimit)) return true;
  return models.some(
    (m) =>
      (!priceLimit || m.price === undefined || m.price <= priceLimit) &&
      (!areaLimit || m.exclusiveArea === undefined || inArea(areaLimit, m.exclusiveArea))
  );
}

function newNoticePayload(list: WebNotice[], siteUrl: string, today: string, mode: string): Payload {
  if (list.length === 1) {
    const n = list[0];
    const receipt = n.receiptStart ? ` · 접수 ${shortDate(n.receiptStart)}${n.receiptEnd && n.receiptEnd !== n.receiptStart ? ` ~ ${shortDate(n.receiptEnd)}` : ''}` : '';
    return {
      title: `새 청약 공고 · ${n.region}`,
      body: `${n.name}\n${n.typeName ?? ''}${receipt}`.trim(),
      url: `${siteUrl}/n/${n.key}.html`,
      tag: `new-${n.key}`,
    };
  }
  const shown = list.slice(0, 5).map((n) => `${n.name} · ${n.region}`);
  return {
    title: `조건에 맞는 새 청약 공고 ${list.length}건`,
    body: shown.join('\n') + (list.length > 5 ? `\n외 ${list.length - 5}건` : ''),
    url: `${siteUrl}/`,
    tag: `new-${today}-${mode}`,
  };
}

async function main() {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const siteUrl = (process.env.SITE_URL ?? '').trim().replace(/\/+$/, '');
  if (!serviceAccount || !privateKey || !siteUrl) {
    console.log('웹 알림 설정(FIREBASE_SERVICE_ACCOUNT · VAPID_PRIVATE_KEY · SITE_URL)이 아직 없어서 건너뜀');
    return;
  }
  const dryRun = process.env.DRY_RUN === 'true';
  const now = new Date();
  const today = toDateStr(now);
  const tomorrow = toDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const requested = process.env.MODE ?? 'auto';
  const testMode = requested === 'test';
  const mode: 'morning' | 'evening' =
    requested === 'morning' || requested === 'evening' ? requested : now.getHours() < 14 ? 'morning' : 'evening';

  const res = await fetch(`${siteUrl}/data/notices.json`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`공고 데이터를 받지 못했어요 (HTTP ${res.status})`);
  const list = (await res.json()).notices as WebNotice[];
  const notices = new Map<string, WebNotice>(list.map((n) => [n.key, n]));
  // 주택형(분양가·면적)은 없어도 알림은 보낸다 (가격·면적 조건만 못 따진다)
  const models: Record<string, Model[]> = await fetch(`${siteUrl}/data/state.json`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : {}))
    .then((s: { models?: Record<string, Model[]> }) => s.models ?? {})
    .catch(() => ({}));

  webpush.setVapidDetails(siteUrl, vapidPublicKey(), privateKey);
  initializeApp({ credential: cert(JSON.parse(serviceAccount)) });
  const db = getFirestore();

  // 지난 발송 뒤 새로 올라온 공고 (firstSeen: 웹 빌드가 처음 본 시각, 0 은 첫 배포 때 이미 있던 공고)
  const metaRef = db.collection('meta').doc('push');
  const since: number = ((await metaRef.get()).data()?.newSince as number | undefined) ?? Date.now() - FIRST_WINDOW_MS;
  const fresh = list.filter((n) => (n.firstSeen ?? 0) > since);
  const newSince = Math.max(since, ...list.map((n) => n.firstSeen ?? 0));

  const snap = await db.collection('subscribers').get();
  let sent = 0;
  let removed = 0;
  let newNoticeTargets = 0;
  for (const doc of snap.docs) {
    const data = doc.data() as Conditions & {
      endpoint: string;
      p256dh: string;
      auth: string;
      favorites?: string[];
      updatedAt?: { toMillis(): number };
    };
    const { endpoint, p256dh, auth, favorites = [], updatedAt } = data;
    const payloads: Payload[] = [];

    if (testMode) {
      if (!updatedAt || Date.now() - updatedAt.toMillis() > 10 * 60 * 1000) continue;
      payloads.push({
        title: '🔔 서버 알림 테스트',
        body: `찜한 공고 ${favorites.length}개${data.newNotice ? ' · 조건에 맞는 새 공고 알림 켜짐' : ''} · 알림이 이렇게 와요.`,
        url: `${siteUrl}/#/fav`,
        tag: 'server-test',
      });
    } else {
      const messages = messagesFor(favorites, notices, mode, today, tomorrow);
      const day = mode === 'morning' ? '오늘' : '내일';
      if (messages.length === 1) {
        payloads.push({
          title: messages[0].title,
          body: `${messages[0].notice.name} · ${messages[0].notice.region}`,
          url: `${siteUrl}/n/${messages[0].notice.key}.html`,
          tag: `${messages[0].notice.key}-${today}-${mode}`,
        });
      } else if (messages.length > 1) {
        payloads.push({
          title: `${day} 청약 접수 ${messages.length}건`,
          body: messages.map((m) => `${m.notice.name} · ${m.title.replace(/^(오늘|내일) /, '')}`).join('\n'),
          url: `${siteUrl}/#/fav`,
          tag: `many-${today}-${mode}`,
        });
      }
      // 조건에 맞는 새 공고 (예전 구독은 조건이 없으면 받지 않는다)
      if (data.newNotice) {
        const matched = fresh.filter((n) => !favorites.includes(n.key) && matches(n, data, models[n.key]));
        if (matched.length) {
          newNoticeTargets++;
          payloads.push(newNoticePayload(matched, siteUrl, today, mode));
        }
      }
    }
    if (payloads.length === 0) continue;

    for (const payload of payloads) {
      if (dryRun) {
        console.log(`[dry-run] ${doc.id.slice(0, 8)}… ← ${payload.title} / ${payload.body.replace(/\n/g, ' | ')}`);
        continue;
      }
      try {
        await webpush.sendNotification({ endpoint, keys: { p256dh, auth } }, JSON.stringify(payload), { TTL: 6 * 3600 });
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        // 브라우저에서 알림을 끄거나 앱을 지우면 404/410 → 구독 정리
        if (status === 404 || status === 410) {
          await doc.ref.delete();
          removed++;
          break;
        }
        console.warn(`! 보내기 실패 ${doc.id.slice(0, 8)}…: ${status ?? ''} ${(e as Error).message}`);
      }
    }
  }

  // 새 공고를 어디까지 알렸는지 기록 (시험·dry-run 은 남기지 않는다)
  if (!testMode && !dryRun) await metaRef.set({ newSince, at: Date.now() });
  console.log(
    `${today} ${testMode ? '테스트' : mode === 'morning' ? '아침' : '저녁'} 알림 · 구독 ${snap.size}개 · 새 공고 ${fresh.length}건(받을 기기 ${newNoticeTargets}) · 보냄 ${sent} · 정리 ${removed}${dryRun ? ' (dry-run)' : ''}`
  );
}

main().catch((e) => {
  console.error(`실패: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
