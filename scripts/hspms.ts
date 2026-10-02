/**
 * 단지 전체 세대수: 국토교통부 건축HUB 주택인허가정보 (기본개요).
 * 청약홈 공고에는 "이번 공고" 세대수만 있어서, 사업계획승인 자료의 총세대수를 붙인다.
 *   지번(법정동코드 + 본번·부번)으로 찾는다. 도로명·블록(A17BL) 주소는 카카오로 지번을 알아낸 뒤에 부른다.
 */
const URL = 'https://apis.data.go.kr/1613000/HsPmsHubService/getHpBasisOulnInfo';

export interface Jibun {
  bCode: string; // 법정동코드 10자리
  bun: string;
  ji: string;
  mountain: boolean;
}

interface Item {
  purpsCdNm?: string;
  totHhldCnt?: number | string;
}

export class HsPmsAuthError extends Error {}

/** 총세대수 (못 찾으면 null) */
export async function complexUnits(serviceKey: string, j: Jibun): Promise<number | null> {
  const q = new URLSearchParams({
    serviceKey,
    sigunguCd: j.bCode.slice(0, 5),
    bjdongCd: j.bCode.slice(5, 10),
    platGbCd: j.mountain ? '1' : '0',
    bun: j.bun.padStart(4, '0'),
    ji: (j.ji || '0').padStart(4, '0'),
    _type: 'json',
    numOfRows: '20',
    pageNo: '1',
  });
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${URL}?${q}`, { signal: AbortSignal.timeout(20000) }).catch((e: Error) => e);
    if (res instanceof Response) {
      if (res.status === 401 || res.status === 403) throw new HsPmsAuthError(`주택인허가 ${res.status}`);
      if (res.ok) {
        const text = await res.text();
        if (text.includes('SERVICE_KEY_IS_NOT_REGISTERED')) throw new HsPmsAuthError('주택인허가 키 미등록');
        const body = JSON.parse(text) as { response?: { body?: { items?: { item?: Item | Item[] } | '' } } };
        const raw = body.response?.body?.items;
        const items = raw && typeof raw === 'object' ? ([] as Item[]).concat(raw.item ?? []) : [];
        // 같은 땅에 인허가가 여러 건이면 공동주택 중 세대수가 가장 큰 것 (변경 승인 등)
        const counts = items
          .filter((it) => !it.purpsCdNm || it.purpsCdNm.includes('주택') || Number(it.totHhldCnt) > 0)
          .map((it) => Number(it.totHhldCnt))
          .filter((v) => v > 0);
        return counts.length ? Math.max(...counts) : null;
      }
      if (attempt >= 3) throw new Error(`주택인허가 HTTP ${res.status}`);
    } else if (attempt >= 3) throw res;
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
}
