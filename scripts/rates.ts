/**
 * 주변 청약 경쟁률 (웹 빌드 전용).
 * 최근 1년 APT 분양(민영·국민) 가운데 가까운 곳에서 먼저 접수를 마친 단지의 1순위 경쟁률.
 * 같은 시·군·구 → 같은 시(일반구가 있는 시) → 같은 시·도 순으로, 그 안에서는 최근 공고부터.
 * 청약홈 경쟁률 API 를 쓰므로 활용신청을 더 할 필요는 없다.
 */
import { addressArea } from '../src/lib/address';
import { toNumber } from '../src/lib/format';
import type { CompetitionRow, NearbyRate, Notice } from '../src/lib/types';

/** "서울특별시 동작구" → "동작구", "경기도 수원시 권선구" → "수원시 권선구", "세종특별자치시" → "세종" */
function shortArea(area: string): string {
  const parts = area.split(' ');
  return parts.length > 1 ? parts.slice(1).join(' ') : area.replace(/특별자치시$/, '');
}

/** 경쟁률 표 → 1순위 합계. 주택형별 세대수에 1순위(해당·기타지역) 접수 건수를 더한다 */
export function summarizeRank1(n: Notice, rows: CompetitionRow[]): NearbyRate | null {
  const byType = new Map<string, { units: number; requests: number }>();
  for (const r of rows) {
    if (!r.group.startsWith('1순위')) continue;
    const t = byType.get(r.houseType) ?? { units: 0, requests: 0 };
    t.units = Math.max(t.units, r.units ?? 0);
    t.requests += toNumber(r.requests) ?? 0;
    byType.set(r.houseType, t);
  }
  const types = [...byType].filter(([, t]) => t.units > 0);
  const units = types.reduce((s, [, t]) => s + t.units, 0);
  const requests = types.reduce((s, [, t]) => s + t.requests, 0);
  const area = addressArea(n.address)?.area;
  if (!units || !area || !n.announceDate) return null;
  const top = types.map(([type, t]) => ({ type, rate: t.requests / t.units })).sort((a, b) => b.rate - a.rate)[0];
  return {
    name: n.name,
    area: shortArea(area),
    date: n.announceDate,
    units,
    requests,
    top: types.length > 1 && top.rate >= 1 ? { type: top.type, rate: Math.round(top.rate * 10) / 10 } : undefined,
  };
}

/** 비교할 단지 후보: 가까운 곳 먼저, 그 안에서는 최근 공고부터 */
export function rateCandidates(n: Notice, pool: Notice[], today: string): Notice[] {
  const here = addressArea(n.address)?.area;
  if (!here) return [];
  const city = here.split(' ').slice(0, 2).join(' ');
  const level = (p: Notice): number => {
    const a = addressArea(p.address)?.area;
    if (!a) return 9;
    if (a === here) return 0;
    if (a === city || a.startsWith(`${city} `)) return 1;
    return p.region === n.region ? 2 : 9;
  };
  return pool
    .filter((p) => p.key !== n.key && !!p.receiptEnd && p.receiptEnd < today)
    .map((p) => ({ p, lv: level(p) }))
    .filter(({ lv }) => lv < 9)
    .sort((a, b) => a.lv - b.lv || (b.p.announceDate ?? '').localeCompare(a.p.announceDate ?? ''))
    .map(({ p }) => p);
}
