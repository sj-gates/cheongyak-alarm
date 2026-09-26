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
