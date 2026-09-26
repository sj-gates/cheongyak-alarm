/**
 * 공고의 공급위치 주소를 지도 검색에 쓰기 좋게 줄인다.
 * "대방동 23-61번지 일대", "구름산지구 도시개발사업지구 A6BL" 처럼 지도가 못 알아듣는 말을 떼어 낸다.
 *
 *   1) 도로명 + 건물번호   경기도 광주시 초월읍 도곡길 27
 *   2) 지번              서울특별시 동작구 대방동 23-61
 *   3) 괄호 속 도로명·지번 (괄호 안이 온전한 주소가 아니면 시·군·구를 앞에 붙여서)
 *   4) 동·읍·면까지       경기도 광명시 소하동   ← 정확한 위치가 아니라 동네 위치
 */
export interface MapQuery {
  query: string;
  /** 번지·도로명을 못 찾아 동네 단위로 줄였는지 */
  approximate: boolean;
}

// "동부로 19길 18", "과천대로8길 15", "오리로1165", "다솜1로 9" 모두 받는다
const ROAD = /[가-힣][가-힣0-9·]*(?:로|길)(?:\s?\d+(?:번)?길)?\s?\d+(?:-\d+)?/;
const JIBUN = /[가-힣0-9]+(?:동|리|가)\s(?:산\s?)?\d+(?:-\d+)?/;
// "거모동, 군자동"처럼 나열돼 있으면 첫 번째에서 끊는다
const AREA = /[가-힣0-9]+(?:동|읍|면|리)(?=[\s,]|$)/;
// 시·도 + 시·군·구 (+ 일반구). "오산세교2지구" 같은 개발지구 이름은 구로 치지 않는다
const PREFIX = /^\S+(?:도|시)\s\S+(?:시|군|구)(?:\s[가-힣]*[^지\s]구)?/;

function upTo(text: string, re: RegExp): string | null {
  const m = re.exec(text);
  return m ? text.slice(0, m.index + m[0].length).trim() : null;
}

export function mapQuery(address: string): MapQuery {
  const clean = address.replace(/\s+/g, ' ').trim();
  const base = clean.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const prefix = base.match(PREFIX)?.[0];
  const inners = (clean.match(/\(([^)]*)\)/g) ?? []).map((s) => s.slice(1, -1).trim());

  /** 괄호 안에서 찾기: 안쪽이 온전한 주소면 그대로, 아니면 바깥 시·군·구를 붙인다 */
  const fromInner = (re: RegExp): string | null => {
    for (const inner of inners) {
      if (PREFIX.test(inner)) {
        const hit = upTo(inner, re);
        if (hit) return hit;
      } else if (prefix) {
        const m = inner.match(re);
        if (m) return `${prefix} ${m[0]}`;
      }
    }
    return null;
  };

  const exact = upTo(base, ROAD) ?? upTo(base, JIBUN) ?? fromInner(ROAD) ?? fromInner(JIBUN);
  if (exact) return { query: exact, approximate: false };

  const area = upTo(base, AREA) ?? fromInner(AREA);
  return { query: area ?? base, approximate: true };
}

/**
 * 실거래가 조회용: 주소의 시·도 + 시·군·구(+ 일반구)와 법정동.
 *   "경기도 부천시 소사구 괴안동 ..."  → { area: "경기도 부천시 소사구", dong: "괴안동" }
 *   "세종특별자치시 다솜동 ..."        → { area: "세종특별자치시", dong: "다솜동" }  (세종은 시·군·구가 없다)
 *   "김포 풍무역세권 B4블록 (경기도 김포시 사우동 ...)" → 괄호 안에서 찾는다
 */
export interface AddressArea {
  area: string;
  dong?: string;
}

const SIDO_SGG =
  /^(\S+(?:특별시|광역시|특별자치시|특별자치도|도))(?=\s|$)(?:\s(\S+(?:시|군|구))(?=[\s,(]|$)(?:\s([가-힣]*[^지\s]구)(?=[\s,(]|$))?)?/;
const DONG = /[가-힣0-9]+(?:동|읍|면|가)(?=[\s,(]|$)/;

function areaOf(text: string): { area: string; rest: string; complete: boolean } | null {
  const m = text.match(SIDO_SGG);
  if (!m) return null;
  const [whole, sido, sgg, gu] = m;
  return {
    area: [sido, sgg, gu].filter(Boolean).join(' '),
    rest: text.slice(whole.length),
    complete: !!sgg || sido.startsWith('세종'),
  };
}

export function addressArea(address: string): AddressArea | null {
  const clean = address.replace(/\s+/g, ' ').trim();
  const base = clean.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const inners = (clean.match(/\(([^)]*)\)/g) ?? []).map((s) => s.slice(1, -1).trim());

  const outer = areaOf(base);
  const inner = inners.map(areaOf).find((a) => a?.complete) ?? null;
  const found = outer?.complete ? outer : inner;
  if (!found) return null;

  // 동은 바깥 주소에서 먼저, 없으면 괄호 안에서 (같은 시·군·구일 때만)
  const dongIn = (a: typeof found | null) => (a && a.area === found.area ? a.rest.match(DONG)?.[0] : undefined);
  const dong = dongIn(outer) ?? dongIn(inner) ?? inners.map((s) => (areaOf(s) ? undefined : s.match(DONG)?.[0])).find(Boolean);
  return { area: found.area, dong };
}
