import { addDays, parseDate, rangeLabel } from './dates';
import type { Notice, ScheduleEvent, Settings } from './types';

export const SCHEDULE_PREFIX = 'sched-';
// iOS는 앱당 예약 알림이 64개까지라 여유를 두고 자른다
export const MAX_SCHEDULED = 60;

export interface PlannedAlert {
  id: string;
  at: number;
  title: string;
  body: string;
  noticeKey: string;
}

const RECEIPT_KINDS = new Set<ScheduleEvent['kind']>(['special', 'rank1', 'rank2', 'general', 'receipt']);

function startPhrase(ev: ScheduleEvent): string {
  if (RECEIPT_KINDS.has(ev.kind)) return ev.end ? `${ev.label} 접수 시작` : `${ev.label} 접수`;
  if (ev.kind === 'contract') return ev.end ? '계약 시작' : '계약';
  return ev.label;
}

function atHour(date: string, hour: number): number {
  const d = parseDate(date);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

/** 찜한 공고의 일정마다 전날 / 당일 / 접수 마감일 알림을 만든다 */
export function planFavoriteAlerts(favorites: Notice[], s: Settings, now = Date.now()): PlannedAlert[] {
  const plans: PlannedAlert[] = [];
  for (const n of favorites) {
    for (const ev of n.events) {
      if (ev.kind === 'announce') continue;
      const body = `${n.name} · ${rangeLabel(ev.start, ev.end)}`;
      const base = { noticeKey: n.key, body };
      if (s.dayBeforeAlert) {
        plans.push({
          ...base,
          id: `${SCHEDULE_PREFIX}${n.key}-${ev.id}-before`,
          at: atHour(addDays(ev.start, -1), s.dayBeforeHour),
          title: `내일 ${startPhrase(ev)}`,
        });
      }
      if (s.dayOfAlert) {
        plans.push({
          ...base,
          id: `${SCHEDULE_PREFIX}${n.key}-${ev.id}-day`,
          at: atHour(ev.start, s.dayOfHour),
          title: `오늘 ${startPhrase(ev)}`,
        });
        if (ev.end && RECEIPT_KINDS.has(ev.kind)) {
          plans.push({
            ...base,
            id: `${SCHEDULE_PREFIX}${n.key}-${ev.id}-end`,
            at: atHour(ev.end, s.dayOfHour),
            title: `오늘 ${ev.label} 접수 마감`,
          });
        }
      }
    }
  }
  return plans.filter((p) => p.at > now).sort((a, b) => a.at - b.at);
}
