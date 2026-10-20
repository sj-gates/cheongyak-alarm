/**
 * 웹 푸시 알림 보내기 (한 곳에서만 정의하고 두 곳이 같이 쓴다)
 *   - Firebase 예약 함수(index.js): 매일 한국 시간 오전 10시(morning) · 밤 10시(evening) 정각
 *   - GitHub Actions(push/send.ts): 손으로 돌리는 시험 알림 · 미리 보기(dry-run)
 *
 *   찜한 공고   오전 10시: 오늘 청약 접수 시작 · 오늘 접수 마감 / 밤 10시: 내일 청약 접수 시작
 *   새 공고     지난 발송 뒤 새로 올라온 공고 가운데 구독자가 정한 조건(종류·지역·최대 분양가·면적)에 맞는 것
 *
 * 구독(기기별 알림 주소 + 찜한 공고 key + 새 공고 알림 조건)은 Firestore 의 subscribers,
 * 공고는 배포된 사이트의 data/notices.json, 주택형(분양가·면적)은 data/state.json 에서 읽는다.
 * 보낸 기록은 Firestore 의 meta/push (newSince: 새 공고를 어디까지 알렸는지, lastMorning·lastEvening: 찜 알림 보낸 날).
 *
 * firebase-admin·web-push 는 부르는 쪽이 넘겨준다 (두 곳의 설치 위치가 달라서).
 */

const RECEIPT_KINDS = new Set(['special', 'rank1', 'rank2', 'general', 'receipt']);
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
// 처음 실행(어디까지 알렸는지 기록이 없을 때)은 최근 12시간 안에 올라온 공고만
const FIRST_WINDOW_MS = 12 * 3600 * 1000;
const KST_MS = 9 * 3600 * 1000; // 한국은 서머타임이 없다

/** 한국 시간 기준 날짜 "2026-10-20" (dayOffset: 0 오늘, 1 내일) */
function kstDate(now, dayOffset = 0) {
  return new Date(now.getTime() + KST_MS + dayOffset * 86400000).toISOString().slice(0, 10);
}
const kstHour = (now) => new Date(now.getTime() + KST_MS).getUTCHours();
const shortDate = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return `${m}.${d}(${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`;
};
const range = (ev) => (ev.end && ev.end !== ev.start ? `${shortDate(ev.start)} ~ ${shortDate(ev.end)}` : shortDate(ev.start));

/** 이 구독자에게 보낼 찜한 공고 접수일 알림 */
export function messagesFor(favorites, notices, mode, today, tomorrow) {
  const out = [];
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

const inArea = (area, a) => (area === 'small' ? a <= 60 : area === 'mid' ? a > 60 && a <= 85 : area === 'large' ? a > 85 : true);

/**
 * 새 공고가 구독자 조건에 맞는지. 종류·지역은 비어 있으면 모두.
 * 최대 분양가·면적은 주택형 가운데 하나라도 맞으면 된다 (주택형 정보가 없거나 가격이 비어 있으면 따지지 않는다).
 */
export function matches(n, c, models) {
  if (c.kinds?.length && !c.kinds.includes(n.kind)) return false;
  if (c.regions?.length && !c.regions.includes(n.region)) return false;
  const priceLimit = c.maxPrice && c.maxPrice > 0 ? c.maxPrice : 0;
  const areaLimit = c.area && c.area !== 'all' ? c.area : undefined;
  if (!models?.length || (!priceLimit && !areaLimit)) return true;
  return models.some(
    (m) => (!priceLimit || m.price === undefined || m.price <= priceLimit) && (!areaLimit || m.exclusiveArea === undefined || inArea(areaLimit, m.exclusiveArea))
  );
}

function newNoticePayload(list, siteUrl, today, mode) {
  if (list.length === 1) {
    const n = list[0];
    const receipt = n.receiptStart ? ` · 접수 ${shortDate(n.receiptStart)}${n.receiptEnd && n.receiptEnd !== n.receiptStart ? ` ~ ${shortDate(n.receiptEnd)}` : ''}` : '';
    return { title: `새 청약 공고 · ${n.region}`, body: `${n.name}\n${n.typeName ?? ''}${receipt}`.trim(), url: `${siteUrl}/n/${n.key}.html`, tag: `new-${n.key}` };
  }
  const shown = list.slice(0, 5).map((n) => `${n.name} · ${n.region}`);
  return {
    title: `조건에 맞는 새 청약 공고 ${list.length}건`,
    body: shown.join('\n') + (list.length > 5 ? `\n외 ${list.length - 5}건` : ''),
    url: `${siteUrl}/`,
    tag: `new-${today}-${mode}`,
  };
}

/** 배포된 사이트의 공개 키 (web/assets/config.js 와 어긋나면 알림이 안 가므로 거기서 읽는다) */
export async function vapidPublicKeyFrom(siteUrl) {
  const res = await fetch(`${siteUrl}/assets/config.js`, { cache: 'no-store' });
  const m = (await res.text()).match(/vapidPublicKey:\s*'([^']+)'/);
  if (!m) throw new Error('사이트 config.js 에서 vapidPublicKey 를 찾지 못했어요.');
  return m[1];
}

/**
 * @param {object} o
 * @param {import('firebase-admin/firestore').Firestore} o.db
 * @param {typeof import('web-push')} o.webpush  setVapidDetails 를 마친 것
 * @param {string} o.siteUrl
 * @param {'morning'|'evening'|'test'} o.mode
 * @param {boolean} [o.force]  찜 알림을 오늘 이미 보냈어도 또 보낸다 (손으로 돌릴 때)
 * @param {boolean} [o.dryRun] 보내지 않고 누구에게 뭘 보낼지만 출력
 * @param {Date} [o.now]
 * @param {(s: string) => void} [o.log]
 */
export async function runNotify({ db, webpush, siteUrl, mode, force = false, dryRun = false, now = new Date(), log = console.log }) {
  const today = kstDate(now);
  const tomorrow = kstDate(now, 1);
  const testMode = mode === 'test';

  const res = await fetch(`${siteUrl}/data/notices.json`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`공고 데이터를 받지 못했어요 (HTTP ${res.status})`);
  const list = (await res.json()).notices;
  const notices = new Map(list.map((n) => [n.key, n]));
  // 주택형(분양가·면적)은 없어도 알림은 보낸다 (가격·면적 조건만 못 따진다)
  const models = await fetch(`${siteUrl}/data/state.json`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : {}))
    .then((s) => s.models ?? {})
    .catch(() => ({}));

  const metaRef = db.collection('meta').doc('push');
  const meta = (await metaRef.get()).data() ?? {};
  // 찜 알림: 같은 날 두 번 보내지 않는다 (예약 실행이 다시 돌아도)
  const sentToday = mode === 'morning' ? meta.lastMorning === today : mode === 'evening' ? meta.lastEvening === today : false;
  const favMode = !testMode && (force || !sentToday) ? mode : null;
  // 지난 발송 뒤 새로 올라온 공고 (firstSeen: 웹 빌드가 처음 본 시각, 0 은 첫 배포 때 이미 있던 공고)
  const since = meta.newSince ?? Date.now() - FIRST_WINDOW_MS;
  const fresh = testMode ? [] : list.filter((n) => (n.firstSeen ?? 0) > since);
  const newSince = Math.max(since, ...list.map((n) => n.firstSeen ?? 0));

  const snap = await db.collection('subscribers').get();
  let sent = 0;
  let removed = 0;
  let newNoticeTargets = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    const { endpoint, p256dh, auth, favorites = [], updatedAt } = data;
    const payloads = [];

    if (testMode) {
      if (!updatedAt || Date.now() - updatedAt.toMillis() > 10 * 60 * 1000) continue;
      payloads.push({
        title: '🔔 서버 알림 테스트',
        body: `찜한 공고 ${favorites.length}개${data.newNotice ? ' · 조건에 맞는 새 공고 알림 켜짐' : ''} · 알림이 이렇게 와요.`,
        url: `${siteUrl}/#/fav`,
        tag: 'server-test',
      });
    } else {
      const messages = favMode ? messagesFor(favorites, notices, favMode, today, tomorrow) : [];
      const day = favMode === 'morning' ? '오늘' : '내일';
      if (messages.length === 1) {
        payloads.push({
          title: messages[0].title,
          body: `${messages[0].notice.name} · ${messages[0].notice.region}`,
          url: `${siteUrl}/n/${messages[0].notice.key}.html`,
          tag: `${messages[0].notice.key}-${today}-${favMode}`,
        });
      } else if (messages.length > 1) {
        payloads.push({
          title: `${day} 청약 접수 ${messages.length}건`,
          body: messages.map((m) => `${m.notice.name} · ${m.title.replace(/^(오늘|내일) /, '')}`).join('\n'),
          url: `${siteUrl}/#/fav`,
          tag: `many-${today}-${favMode}`,
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

    for (const payload of payloads) {
      if (dryRun) {
        log(`[dry-run] ${doc.id.slice(0, 8)}… ← ${payload.title} / ${payload.body.replace(/\n/g, ' | ')}`);
        continue;
      }
      try {
        await webpush.sendNotification({ endpoint, keys: { p256dh, auth } }, JSON.stringify(payload), { TTL: 6 * 3600 });
        sent++;
      } catch (e) {
        const status = e?.statusCode;
        // 브라우저에서 알림을 끄거나 주소가 없어지면 404/410 → 구독 정리 (사이트를 다시 열면 다시 저장된다)
        if (status === 404 || status === 410) {
          log(`구독 정리 ${doc.id.slice(0, 8)}… (${status}, 마지막 저장 ${updatedAt ? new Date(updatedAt.toMillis()).toISOString().slice(0, 10) : '?'})`);
          await doc.ref.delete();
          removed++;
          break;
        }
        log(`! 보내기 실패 ${doc.id.slice(0, 8)}…: ${status ?? ''} ${e?.message ?? e}`);
      }
    }
  }

  // 보낸 기록 남기기 (시험·dry-run 은 남기지 않는다)
  if (!testMode && !dryRun) {
    await metaRef.set(
      {
        newSince,
        at: Date.now(),
        ...(favMode === 'morning' ? { lastMorning: today } : {}),
        ...(favMode === 'evening' ? { lastEvening: today } : {}),
      },
      { merge: true }
    );
  }
  const what = testMode ? '테스트' : favMode === 'morning' ? '오전 찜 알림' : favMode === 'evening' ? '밤 찜 알림' : '찜 알림은 오늘 이미 보냄';
  const summary = `${today} ${String(kstHour(now)).padStart(2, '0')}시 · ${what} · 구독 ${snap.size}개 · 새 공고 ${fresh.length}건(받을 기기 ${newNoticeTargets}) · 보냄 ${sent} · 정리 ${removed}${dryRun ? ' (dry-run)' : ''}`;
  log(summary);
  return { sent, removed, subscribers: snap.size, fresh: fresh.length };
}
