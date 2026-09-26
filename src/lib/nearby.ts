/**
 * 공고 상세의 "주변 실거래가".
 * 공고의 대표 주택형과 넓이가 비슷한 주변 아파트의 최근 매매를 골라 보여 준다.
 * 실거래 자료는 웹 빌드(scripts/rtms.ts)가 받아서 사이트의 data/nearby/<공고>.json 으로 올리고, 앱은 그 파일을 읽는다.
 */
import { dotDate } from './dates';
import { formatArea } from './format';
import type { HouseModel, NearbyRate, NearbyTrade } from './types';

/** 이 공고들만 비교한다 (오피스텔·도시형·임대는 아파트 매매와 비교하기 어렵다) */
export const NEARBY_CATEGORIES = new Set(['APT', 'REMNDR', 'RESUPPLY']);

/** 비교 기준 주택형: 세대수가 가장 많은 것 (같으면 84㎡에 가까운 것) */
export function baseModel(models: HouseModel[]): HouseModel | undefined {
  const units = (m: HouseModel) => (m.generalUnits ?? 0) + (m.specialUnits ?? 0);
  return models
    .filter((m) => m.exclusiveArea)
    .sort((a, b) => units(b) - units(a) || Math.abs(a.exclusiveArea! - 84) - Math.abs(b.exclusiveArea! - 84))[0];
}

/** "간석1동"(행정동) → "간석동"(법정동) */
function legalDong(dong: string): string {
  return dong.replace(/(\D)\d+동$/, '$1동');
}

const nameKey = (s: string) => s.replace(/\([^)]*\)/g, '').replace(/[^가-힣a-zA-Z0-9]/g, '').toLowerCase();

/** 공고 단지 자신의 거래는 빼기 위한 느슨한 이름 비교 */
function sameComplex(a: string, b: string): boolean {
  const x = nameKey(a);
  const y = nameKey(b);
  if (!x || !y) return false;
  return x === y || (x.length >= 4 && y.includes(x)) || (y.length >= 4 && x.includes(y));
}

/**
 * 비슷한 조건의 주변 단지 고르기.
 *   넓이: 기준 전용면적 ±10% (최소 ±5㎡)
 *   순서: 같은 동의 최근 10년 안에 지은 단지 → 같은 시·군·구의 최근 지은 단지 → 같은 동 → 나머지, 그 안에서는 최근 거래 순
 *   단지마다 가장 최근 거래 하나씩
 */
export function pickNearby(
  trades: NearbyTrade[],
  opts: { area: number; dong?: string; name: string; year: number; count?: number }
): NearbyTrade[] {
  const band = Math.max(5, opts.area * 0.1);
  const dong = opts.dong ? legalDong(opts.dong) : undefined;
  const inDong = (t: NearbyTrade) => !!dong && (t.dong === dong || t.dong.startsWith(`${dong} `));
  const rank = (t: NearbyTrade) => ((t.buildYear ?? 0) >= opts.year - 10 ? 0 : 2) + (inDong(t) ? 0 : 1);

  const sorted = trades
    .filter((t) => Math.abs(t.area - opts.area) <= band && !sameComplex(t.name, opts.name))
    .sort((a, b) => rank(a) - rank(b) || b.date.localeCompare(a.date));

  const picked: NearbyTrade[] = [];
  const seen = new Set<string>();
  for (const t of sorted) {
    const key = `${t.dong}|${nameKey(t.name)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(t);
    if (picked.length >= (opts.count ?? 2)) break;
  }
  return picked;
}

/** "대방동 · 2019년 준공 · 전용 84.97㎡ · 12층" */
export function tradeMeta(t: NearbyTrade): string {
  return [t.dong, t.buildYear ? `${t.buildYear}년 준공` : '', `전용 ${formatArea(t.area)}`, t.floor !== undefined ? `${t.floor}층` : '']
    .filter(Boolean)
    .join(' · ');
}

/** "2026.8.14 거래" */
export const tradeDate = (t: NearbyTrade) => `${dotDate(t.date)} 거래`;

/** 1순위 평균 경쟁률 "12.3 : 1", 모자라면 "미달" */
export function rateText(r: Pick<NearbyRate, 'units' | 'requests'>): { text: string; short: boolean } {
  const rate = r.requests / r.units;
  return rate < 1 ? { text: '1순위 미달', short: true } : { text: `${rate.toFixed(rate >= 100 ? 0 : 1)} : 1`, short: false };
}

/** "동작구 · 2026.5 공고 · 일반 312세대 · 최고 59A 45.1:1" */
export function rateMeta(r: NearbyRate): string {
  const [y, m] = r.date.split('-').map(Number);
  return [r.area, `${y}.${m} 공고`, `일반 ${r.units.toLocaleString('ko-KR')}세대`, r.top ? `최고 ${r.top.type} ${r.top.rate.toFixed(1)}:1` : '']
    .filter(Boolean)
    .join(' · ');
}
