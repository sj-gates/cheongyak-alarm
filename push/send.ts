/**
 * 웹 푸시 알림을 손으로 보내기 (GitHub Actions: .github/workflows/push.yml 의 "Run workflow")
 * 매일 보내는 알림은 Firebase 예약 함수(push/route/index.js)가 오전·밤 10시 정각에 보낸다. 내용은 둘 다 route/notify.js.
 *
 * 필요한 값: FIREBASE_SERVICE_ACCOUNT(서비스 계정 JSON), VAPID_PRIVATE_KEY, SITE_URL
 * MODE=test|morning|evening, DRY_RUN=true (보내지 않고 누구에게 뭘 보낼지만 출력)
 *   test: 최근 10분 안에 알림을 켠(찜·조건을 바꾼) 기기에만 시험 알림 — 공개 사이트라 다른 사람에게 가지 않게
 *   morning·evening: 그 알림을 바로 (오늘 이미 보냈어도)
 */
import fs from 'node:fs';
import path from 'node:path';

import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import webpush from 'web-push';

/** web/assets/config.js 의 공개 키를 그대로 쓴다 (둘이 어긋나면 알림이 안 가므로) */
function vapidPublicKey(): string {
  const config = fs.readFileSync(path.resolve(__dirname, '../web/assets/config.js'), 'utf8');
  const m = config.match(/vapidPublicKey:\s*'([^']+)'/);
  if (!m) throw new Error('web/assets/config.js 에서 vapidPublicKey 를 찾지 못했어요.');
  return m[1];
}

async function main() {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const siteUrl = (process.env.SITE_URL ?? '').trim().replace(/\/+$/, '');
  if (!serviceAccount || !privateKey || !siteUrl) {
    console.log('웹 알림 설정(FIREBASE_SERVICE_ACCOUNT · VAPID_PRIVATE_KEY · SITE_URL)이 아직 없어서 건너뜀');
    return;
  }
  const mode = process.env.MODE ?? 'test';
  if (mode !== 'test' && mode !== 'morning' && mode !== 'evening') throw new Error(`MODE 는 test·morning·evening 중 하나예요: ${mode}`);

  webpush.setVapidDetails(siteUrl, vapidPublicKey(), privateKey);
  initializeApp({ credential: cert(JSON.parse(serviceAccount)) });
  // notify.js 는 ESM 이라 동적으로 불러온다
  const { runNotify } = await import('./route/notify.js');
  await runNotify({ db: getFirestore(), webpush, siteUrl, mode, force: true, dryRun: process.env.DRY_RUN === 'true' });
}

main().catch((e) => {
  console.error(`실패: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
