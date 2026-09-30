/**
 * 카카오 REST 키가 없을 때 쓰는 무료 위치 찾기: OpenStreetMap Nominatim.
 * 번지는 못 찾아서 법정동 중심(대략)으로만 잡는다. 사용 규칙대로 초당 1번, 결과는 state 에 남겨 다시 묻지 않는다.
 * (지도 데이터 © OpenStreetMap contributors)
 */
import { addressArea } from '../src/lib/address';

export interface GeoPoint {
  lat: number;
  lng: number;
  approx: boolean; // 동네 중심
  src: 'kakao' | 'osm';
}

const UA = { 'User-Agent': 'cheongyak-alarm/1.0 (https://sj-gates.github.io/cheongyak-alarm)', 'Accept-Language': 'ko' };
let last = 0;

/** "서울특별시 영등포구 신길동 ..." → "신길동, 영등포구, 서울특별시" 로 찾는다 (동을 모르면 null) */
export async function osmDong(address: string): Promise<GeoPoint | null> {
  const where = addressArea(address);
  if (!where?.dong) return null;
  const dong = where.dong.replace(/(\D)\d+동$/, '$1동'); // 간석1동 → 간석동
  const q = [dong, ...where.area.split(' ').reverse()].join(', ');
  const wait = last + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=kr&q=${encodeURIComponent(q)}`, {
    headers: UA,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`nominatim HTTP ${res.status}`);
  const hit = ((await res.json()) as { lat: string; lon: string }[])[0];
  return hit ? { lat: +(+hit.lat).toFixed(5), lng: +(+hit.lon).toFixed(5), approx: true, src: 'osm' } : null;
}
