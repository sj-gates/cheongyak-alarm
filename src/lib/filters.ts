import { todayStr } from './dates';
import type { HouseModel, Notice, NoticeStatus, ScheduleEvent, Settings } from './types';

export const STATUS_LABEL: Record<NoticeStatus, string> = {
  open: '접수중',
  upcoming: '접수예정',
  waiting: '발표대기',
  closed: '마감',
};

export function noticeStatus(n: Notice, today = todayStr()): NoticeStatus {
  if (n.receiptStart && today < n.receiptStart) return 'upcoming';
  if (n.receiptEnd && today <= n.receiptEnd) return 'open';
  if (!n.receiptStart && n.announceDate && today < n.announceDate) return 'upcoming';
  if (n.winnerDate && today <= n.winnerDate) return 'waiting';
  return 'closed';
}

/** 오늘 이후(오늘 포함)로 남은 첫 일정. 모집공고일은 건너뛴다. */
export function nextEvent(n: Notice, today = todayStr()): ScheduleEvent | undefined {
  return n.events.find((e) => e.kind !== 'announce' && (e.end ?? e.start) >= today);
}

export function matchesRegion(n: Notice, regions: string[]): boolean {
  return regions.length === 0 || regions.includes(n.region);
}

/** 공고 목록만으로 판단할 수 있는 조건: 세부 종류 + 지역 */
export function matchesBasic(n: Notice, s: Settings): boolean {
  return s.kinds.includes(n.kind) && matchesRegion(n, s.regions);
}

/** 분양가·전용면적·특별공급 조건이 있으면 주택형별 정보를 받아 봐야 한다 */
export function needsModelFilter(s: Settings): boolean {
  return s.maxPrice !== null || s.minArea !== null || s.maxArea !== null || s.specialKinds.length > 0;
}

/**
 * 주택형 중 하나라도 조건에 맞으면 통과. 값이 비어 있는 항목은 거르지 않는다.
 * 특별공급 조건은 세부 세대수가 있는 APT 공고에만 적용한다.
 */
export function matchesModels(n: Notice, models: HouseModel[], s: Settings): boolean {
  if (models.length === 0) return true;
  const priceArea = models.some(
    (m) =>
      (s.maxPrice === null || m.price === undefined || m.price <= s.maxPrice) &&
      (s.minArea === null || m.exclusiveArea === undefined || m.exclusiveArea >= s.minArea) &&
      (s.maxArea === null || m.exclusiveArea === undefined || m.exclusiveArea <= s.maxArea)
  );
  const special =
    s.specialKinds.length === 0 ||
    n.category !== 'APT' ||
    models.some((m) => s.specialKinds.some((k) => (m.special[k] ?? 0) > 0));
  return priceArea && special;
}

const STATUS_RANK: Record<NoticeStatus, number> = { open: 0, upcoming: 1, waiting: 2, closed: 3 };

/** 접수중(마감 임박순) → 접수예정(시작 임박순) → 발표대기 → 마감(최근 공고순) */
export function sortNotices(list: Notice[], today = todayStr()): Notice[] {
  const withStatus = list.map((n) => ({ n, s: noticeStatus(n, today) }));
  withStatus.sort((a, b) => {
    const r = STATUS_RANK[a.s] - STATUS_RANK[b.s];
    if (r !== 0) return r;
    switch (a.s) {
      case 'open':
        return (a.n.receiptEnd ?? '').localeCompare(b.n.receiptEnd ?? '');
      case 'upcoming':
        return (a.n.receiptStart ?? a.n.announceDate ?? '').localeCompare(
          b.n.receiptStart ?? b.n.announceDate ?? ''
        );
      case 'waiting':
        return (a.n.winnerDate ?? '').localeCompare(b.n.winnerDate ?? '');
      default:
        return (b.n.announceDate ?? '').localeCompare(a.n.announceDate ?? '');
    }
  });
  return withStatus.map((x) => x.n);
}
