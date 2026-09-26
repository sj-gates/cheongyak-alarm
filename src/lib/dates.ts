const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** "2026-09-24", "20260924", "2026.09.24" → "2026-09-24" */
export function normDate(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const digits = String(value).replace(/[^0-9]/g, '');
  if (digits.length < 8) return undefined;
  const y = digits.slice(0, 4);
  const m = digits.slice(4, 6);
  const d = digits.slice(6, 8);
  if (m === '00' || d === '00') return undefined;
  return `${y}-${m}-${d}`;
}

export function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayStr(): string {
  return toDateStr(new Date());
}

/** 로컬 시간 기준 자정 Date */
export function parseDate(str: string): Date {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(str: string, days: number): string {
  const date = parseDate(str);
  date.setDate(date.getDate() + days);
  return toDateStr(date);
}

/** a - b (일) */
export function diffDays(a: string, b: string): number {
  return Math.round((parseDate(a).getTime() - parseDate(b).getTime()) / 86400000);
}

export function dDayLabel(target: string, today = todayStr()): string {
  const diff = diffDays(target, today);
  if (diff === 0) return 'D-day';
  if (diff > 0) return `D-${diff}`;
  return `D+${-diff}`;
}

/** "10.2(목)" */
export function shortDate(str?: string): string {
  if (!str) return '-';
  const date = parseDate(str);
  return `${date.getMonth() + 1}.${date.getDate()}(${WEEKDAYS[date.getDay()]})`;
}

/** "10월 2일 목요일" */
export function longDate(str: string): string {
  const date = parseDate(str);
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${WEEKDAYS[date.getDay()]}요일`;
}

export function rangeLabel(start?: string, end?: string): string {
  if (!start) return '-';
  if (!end || end === start) return shortDate(start);
  return `${shortDate(start)} ~ ${shortDate(end)}`;
}

export function timeAgo(ts: number): string {
  const sec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (sec < 60) return '방금';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hour = Math.round(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  const day = Math.round(hour / 24);
  return `${day}일 전`;
}

export function dateTimeLabel(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getMonth() + 1}.${d.getDate()}(${WEEKDAYS[d.getDay()]}) ${hh}:${mm}`;
}

/** "2026.8.14" */
export function dotDate(str: string): string {
  const [y, m, d] = str.split('-').map(Number);
  return `${y}.${m}.${d}`;
}
