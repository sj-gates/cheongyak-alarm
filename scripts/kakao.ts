/**
 * 입지 분석 자료 (웹 빌드 전용): 카카오 로컬 API.
 * 공고 주소 → 좌표 → 가까운 지하철역·학교·학원·병원·대형마트.
 *
 * 필요: 카카오 디벨로퍼스 앱의 REST API 키 (GitHub Secret KAKAO_REST_KEY, 로컬은 .env.local 의 KAKAO_REST_KEY).
 * 키가 없거나 거절되면 입지만 빠지고 나머지 분석은 그대로 만든다.
 */
import { mapQuery } from '../src/lib/address';

const BASE = 'https://dapi.kakao.com/v2/local';
const PARALLEL = 4;

/** 키가 없거나 거절됨 → 이번 빌드에서는 더 부르지 않는다 */
export class KakaoAuthError extends Error {}

export interface Place {
  name: string;
  distance: number; // m (직선거리)
}

export interface LocationInfo {
  at: number;
  approximate: boolean; // 번지를 몰라 동네 중심으로 찾았는지
  stations: (Place & { lines: string[] })[];
  schools: (Place & { kind: '초등학교' | '중학교' | '고등학교' })[];
  academies?: number; // 반경 1km 학원 수
  hospitals?: number; // 반경 1km 병원 수
  mart?: Place; // 가장 가까운 대형마트 (3km 안)
}

interface KakaoDoc {
  place_name?: string;
  distance?: string;
  x: string;
  y: string;
}
interface KakaoRes {
  documents: KakaoDoc[];
  meta: { total_count: number };
}

function limiter(max: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active >= max) await new Promise<void>((resolve) => queue.push(resolve));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      queue.shift()?.();
    }
  };
}

export function createKakao(restKey: string) {
  const run = limiter(PARALLEL);
  const source = {
    calls: 0,
    disabled: restKey ? '' : 'KAKAO_REST_KEY 없음',

    async get(path: string, params: Record<string, string | number>): Promise<KakaoRes> {
      if (source.disabled) throw new KakaoAuthError(source.disabled);
      source.calls++;
      const qs = Object.entries(params)
        .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
        .join('&');
      return run(async () => {
        for (let attempt = 1; ; attempt++) {
          const res = await fetch(`${BASE}/${path}.json?${qs}`, {
            headers: { Authorization: `KakaoAK ${restKey}` },
            signal: AbortSignal.timeout(15000),
          }).catch((e: Error) => e);
          if (res instanceof Response) {
            if (res.ok) return (await res.json()) as KakaoRes;
            if (res.status === 401 || res.status === 403) {
              const body = await res.text();
              source.disabled = `카카오 ${res.status} ${body.slice(0, 120)}`;
              throw new KakaoAuthError(source.disabled);
            }
            if (attempt >= 3) throw new Error(`카카오 HTTP ${res.status}`);
          } else if (attempt >= 3) throw res;
          await new Promise((r) => setTimeout(r, 800 * attempt));
        }
      });
    },

    /** 주소 → 좌표. 주소로 못 찾으면 키워드(단지명·지구명)로 */
    async locate(address: string): Promise<{ x: string; y: string; approximate: boolean } | null> {
      const { query, approximate } = mapQuery(address);
      const byAddress = await source.get('search/address', { query, size: 1 });
      const hit = byAddress.documents[0] ?? (await source.get('search/keyword', { query, size: 1 })).documents[0];
      return hit ? { x: hit.x, y: hit.y, approximate } : null;
    },

    async nearest(x: string, y: string, kind: '초등학교' | '중학교' | '고등학교'): Promise<Place | undefined> {
      const res = await source.get('search/keyword', { query: kind, category_group_code: 'SC4', x, y, radius: 3000, sort: 'distance', size: 5 });
      const doc = res.documents.find((d) => d.place_name?.endsWith(kind));
      return doc ? { name: doc.place_name!, distance: Number(doc.distance) } : undefined;
    },

    async location(address: string): Promise<LocationInfo | null> {
      const at = await source.locate(address);
      if (!at) return null;
      const { x, y } = at;
      const around = (code: string, radius: number, size = 15) =>
        source.get('search/category', { category_group_code: code, x, y, radius, sort: 'distance', size });

      const [subway, elementary, middle, high, academies, hospitals, marts] = await Promise.all([
        around('SW8', 3000),
        source.nearest(x, y, '초등학교'),
        source.nearest(x, y, '중학교'),
        source.nearest(x, y, '고등학교'),
        around('AC5', 1000, 1),
        around('HP8', 1000, 1),
        around('MT1', 3000, 1),
      ]);

      // "대방역 1호선", "대방역 신림선" → 대방역 (1호선·신림선)
      const stations = new Map<string, Place & { lines: string[] }>();
      for (const d of subway.documents) {
        const name = d.place_name ?? '';
        const m = name.match(/^(.+?역)\s+(.+)$/);
        const station = m ? m[1] : name;
        const line = m ? m[2] : '';
        const s = stations.get(station) ?? { name: station, lines: [], distance: Number(d.distance) };
        if (line && !s.lines.includes(line)) s.lines.push(line);
        s.distance = Math.min(s.distance, Number(d.distance));
        stations.set(station, s);
      }

      const mart = marts.documents[0];
      return {
        at: Date.now(),
        approximate: at.approximate,
        stations: [...stations.values()].sort((a, b) => a.distance - b.distance).slice(0, 2),
        schools: [
          elementary && { ...elementary, kind: '초등학교' as const },
          middle && { ...middle, kind: '중학교' as const },
          high && { ...high, kind: '고등학교' as const },
        ].filter((s): s is Place & { kind: '초등학교' | '중학교' | '고등학교' } => !!s),
        academies: academies.meta.total_count,
        hospitals: hospitals.meta.total_count,
        mart: mart ? { name: mart.place_name ?? '', distance: Number(mart.distance) } : undefined,
      };
    },
  };
  return source;
}
