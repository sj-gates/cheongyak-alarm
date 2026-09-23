import { fetchModels, fetchNotices, errorMessage } from './api';
import { CATEGORIES, categoriesForKinds, typeLabel } from './categories';
import { addDays, rangeLabel, todayStr } from './dates';
import { matchesBasic, matchesModels, needsModelFilter } from './filters';
import { notifyNow, rescheduleFavoriteAlerts } from './notifications';
import {
  appendAlertLog,
  getServiceKey,
  loadFavorites,
  loadModelCache,
  loadSeen,
  loadSettings,
  saveFavorites,
  saveLastCheck,
  saveModelCache,
  saveNoticeCache,
  saveSeen,
} from './storage';
import type { CheckResult, HouseModel, Notice } from './types';

export async function getModelsCached(serviceKey: string, notice: Notice): Promise<HouseModel[]> {
  const cached = await loadModelCache(notice.key);
  if (cached && cached.length > 0) return cached;
  const models = await fetchModels(serviceKey, notice);
  if (models.length > 0) await saveModelCache(notice.key, models);
  return models;
}

async function notifyNewNotices(list: Notice[]): Promise<number> {
  const at = Date.now();
  const lines = (n: Notice) =>
    `${n.name} (${typeLabel(n, ' ')})\n접수 ${rangeLabel(n.receiptStart, n.receiptEnd)}`;

  if (list.length <= 3) {
    for (const n of list) {
      await notifyNow(`🏠 새 청약 공고 · ${n.region}`, lines(n), { noticeKey: n.key }, 'new');
    }
  } else {
    const body =
      list
        .slice(0, 4)
        .map((n) => `· ${n.name} (${n.region})`)
        .join('\n') + (list.length > 4 ? `\n외 ${list.length - 4}건` : '');
    await notifyNow(`🏠 새 청약 공고 ${list.length}건`, body, {}, 'new');
  }

  await appendAlertLog(
    list.map((n) => ({
      at,
      title: `새 공고 · ${n.region} ${CATEGORIES[n.category].short}`,
      body: lines(n),
      noticeKey: n.key,
    }))
  );
  return list.length;
}

/**
 * 공고를 새로 받아와서
 *  1) 목록 캐시 저장  2) 찜한 공고 최신화 + 일정 알림 다시 잡기
 *  3) 처음 보는 공고 중 조건에 맞는 것 알림
 * 백그라운드 작업과 앱 새로고침이 같이 쓴다.
 */
export async function runCheck(opts: { notify?: boolean } = {}): Promise<CheckResult> {
  const notify = opts.notify ?? true;
  const now = Date.now();
  const serviceKey = await getServiceKey();
  if (!serviceKey) {
    return { ok: false, at: now, message: '설정에서 인증키를 먼저 넣어 주세요.' };
  }
  const settings = await loadSettings();
  const categories = categoriesForKinds(settings.kinds);
  if (categories.length === 0) {
    return { ok: false, at: now, message: '받아볼 공고 종류를 하나 이상 골라 주세요.' };
  }

  try {
    const since = addDays(todayStr(), -settings.lookbackDays);
    const { notices, errors } = await fetchNotices(serviceKey, categories, since);
    await saveNoticeCache({ fetchedAt: now, notices });

    // 정정공고로 일정이 바뀔 수 있어서 찜한 공고도 새 내용으로 바꿔 둔다
    const favorites = await loadFavorites();
    let favChanged = false;
    for (const n of notices) {
      const old = favorites[n.key];
      if (old && JSON.stringify(old) !== JSON.stringify(n)) {
        favorites[n.key] = n;
        favChanged = true;
      }
    }
    if (favChanged) await saveFavorites(favorites);
    // 예약 개수 제한이 있어 지난 알림 자리를 다음 일정으로 채우려면 매번 다시 잡는다
    await rescheduleFavoriteAlerts(Object.values(favorites), settings);

    // 처음 조회하는 공급유형은 알림 없이 '본 공고'로만 채운다 (알림 폭탄 방지)
    const seen = await loadSeen();
    const seeding = categories.filter((c) => !seen.seededCategories.includes(c));
    const fresh: Notice[] = [];
    for (const n of notices) {
      if (n.key in seen.keys) continue;
      const isSeed = seeding.includes(n.category);
      seen.keys[n.key] = isSeed ? 0 : now;
      if (!isSeed) fresh.push(n);
    }
    seen.seededCategories = [...new Set([...seen.seededCategories, ...seeding])];
    await saveSeen(seen);

    let matched = fresh.filter((n) => matchesBasic(n, settings));
    if (matched.length > 0 && needsModelFilter(settings)) {
      const keep: Notice[] = [];
      for (const n of matched) {
        const models = await getModelsCached(serviceKey, n).catch(() => []);
        if (matchesModels(n, models, settings)) keep.push(n);
      }
      matched = keep;
    }

    let notified = 0;
    if (notify && settings.newNoticeAlert && matched.length > 0) {
      notified = await notifyNewNotices(matched);
    }

    const message =
      errors.length > 0
        ? `${errors.map((e) => CATEGORIES[e.category].short).join(', ')} 조회 실패 — ${errors[0].message}`
        : matched.length > 0
          ? `새 공고 ${matched.length}건`
          : '새 공고 없음';
    const result: CheckResult = {
      ok: errors.length === 0,
      at: now,
      message,
      total: notices.length,
      newCount: matched.length,
      notified,
    };
    await saveLastCheck(result);
    return result;
  } catch (e) {
    const result: CheckResult = { ok: false, at: now, message: errorMessage(e) };
    await saveLastCheck(result);
    return result;
  }
}
