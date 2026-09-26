/**
 * 찜한 공고 웹 푸시 알림 보내기 (GitHub Actions: .github/workflows/push.yml)
 *
 *   아침(한국 8시 전): 오늘 청약 접수 시작 · 오늘 접수 마감
 *   저녁(한국 20시 전): 내일 청약 접수 시작
 *
 * 구독(기기별 알림 주소 + 찜한 공고 key)은 Firebase Firestore 의 subscribers 컬렉션,
 * 공고 일정은 배포된 사이트의 data/notices.json 에서 읽는다.
 *
 * 필요한 값: FIREBASE_SERVICE_ACCOUNT(서비스 계정 JSON), VAPID_PRIVATE_KEY, SITE_URL, TZ=Asia/Seoul
 * 선택: MODE=auto|morning|evening, DRY_RUN=true (보내지 않고 누구에게 뭘 보낼지만 출력)
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
  events: WebEvent[];
}
interface Message {
  notice: WebNotice;
  title: string;
}

const RECEIPT_KINDS = new Set(['special', 'rank1', 'rank2', 'general', 'receipt']);
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

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

/** 이 구독자에게 보낼 알림 목록 */
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
  const mode: 'morning' | 'evening' =
    requested === 'morning' || requested === 'evening' ? requested : now.getHours() < 14 ? 'morning' : 'evening';

  const res = await fetch(`${siteUrl}/data/notices.json`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`공고 데이터를 받지 못했어요 (HTTP ${res.status})`);
  const notices = new Map<string, WebNotice>(((await res.json()).notices as WebNotice[]).map((n) => [n.key, n]));

  webpush.setVapidDetails(siteUrl, vapidPublicKey(), privateKey);
  initializeApp({ credential: cert(JSON.parse(serviceAccount)) });
  const db = getFirestore();
  const snap = await db.collection('subscribers').get();

  let sent = 0;
  let removed = 0;
  for (const doc of snap.docs) {
    const { endpoint, p256dh, auth, favorites = [] } = doc.data() as { endpoint: string; p256dh: string; auth: string; favorites?: string[] };
    const messages = messagesFor(favorites, notices, mode, today, tomorrow);
    if (messages.length === 0) continue;

    const day = mode === 'morning' ? '오늘' : '내일';
    const payload =
      messages.length === 1
        ? {
            title: messages[0].title,
            body: `${messages[0].notice.name} · ${messages[0].notice.region}`,
            url: `${siteUrl}/n/${messages[0].notice.key}.html`,
            tag: `${messages[0].notice.key}-${today}-${mode}`,
          }
        : {
            title: `${day} 청약 접수 ${messages.length}건`,
            body: messages.map((m) => `${m.notice.name} · ${m.title.replace(/^(오늘|내일) /, '')}`).join('\n'),
            url: `${siteUrl}/#/fav`,
            tag: `many-${today}-${mode}`,
          };

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
      } else {
        console.warn(`! 보내기 실패 ${doc.id.slice(0, 8)}…: ${status ?? ''} ${(e as Error).message}`);
      }
    }
  }
  console.log(`${today} ${mode === 'morning' ? '아침' : '저녁'} 알림 · 구독 ${snap.size}개 · 보냄 ${sent} · 정리 ${removed}${dryRun ? ' (dry-run)' : ''}`);
}

main().catch((e) => {
  console.error(`실패: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
