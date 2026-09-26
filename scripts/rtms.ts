/**
 * 주변 실거래가 자료 받기 (웹 빌드 전용).
 *
 *   행정안전부_행정표준코드_법정동코드 (StanReginCd)        주소의 시·군·구 → 5자리 지역코드
 *   국토교통부_아파트 매매 실거래가 자료 (RTMSDataSvcAptTrade)  지역코드 · 계약월별 아파트 매매
 *
 * 둘 다 공공데이터포털에서 따로 활용신청한다 (자동승인). 인증키는 청약홈과 같은 키.
 * 지역코드는 주소 이름으로 그때그때 찾는다 (2026년에 새로 생긴 구·통합시도 코드를 손으로 적지 않으려고).
 */
import { cleanKey } from '../src/lib/api';
import { normDate } from '../src/lib/dates';
import { toNumber } from '../src/lib/format';
import type { NearbyTrade } from '../src/lib/types';

const LAWD_URL = 'https://apis.data.go.kr/1741000/StanReginCd/getStanReginCdList';
const TRADE_URL = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade';
const ROWS = 1000;
const MAX_PAGES = 10;
const PARALLEL = 4;

/** 인증키가 이 서비스에 등록되지 않았거나 하루 한도를 넘었다 → 이번 빌드에서는 더 부르지 않는다 */
export class GatewayError extends Error {}

/** 동시에 보내는 요청 수 제한 */
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(url: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    let text: string;
    let status: number;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      text = await res.text();
      status = res.status;
    } catch (e) {
      if (attempt >= 3) throw e;
      await sleep(1000 * attempt);
      continue;
    }
    // 공공데이터포털 게이트웨이 오류
    if (text.includes('OpenAPI_ServiceResponse')) {
      // 초당 요청 제한은 잠깐 쉬었다 다시 (등록 안 된 키·하루 한도 초과는 이번 빌드에서 포기)
      if (text.includes('PER_SECOND') && attempt < 8) {
        await sleep(700 * attempt + Math.random() * 500);
        continue;
      }
      const pick = (name: string) => text.match(new RegExp(`${name}"?\\s*[:>]\\s*"?([^"<]+)`))?.[1]?.trim();
      throw new GatewayError([pick('errMsg'), pick('returnAuthMsg')].filter(Boolean).join(' · ') || `HTTP ${status}`);
    }
    if (status >= 500 && attempt < 3) {
      await sleep(1000 * attempt);
      continue;
    }
    if (status >= 400) throw new Error(`HTTP ${status}`);
    return text;
  }
}

const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };

/** <name>값</name>. 예전 한글 항목명도 같이 받는다 */
function tag(xml: string, ...names: string[]): string | undefined {
  for (const name of names) {
    const m = xml.match(new RegExp(`<${name}>([^<]*)</${name}>`));
    if (m) return m[1].replace(/&(amp|lt|gt|quot|apos|#39);/g, (_, e: string) => XML_ENTITIES[e]).trim();
  }
  return undefined;
}

interface LawdRow {
  region_cd: string;
  sgg_cd: string;
  umd_cd: string;
  ri_cd: string;
  locatadd_nm: string;
}

/**
 * "경기도 부천시 소사구" → ["41194"].
 * 일반구가 있는 시를 시 이름까지만 주면("경기도 수원시") 그 아래 구 코드를 모두 준다 (실거래는 구 코드로만 조회된다).
 */
async function fetchLawdCodes(serviceKey: string, area: string): Promise<string[]> {
  const url = `${LAWD_URL}?ServiceKey=${encodeURIComponent(cleanKey(serviceKey))}&type=json&pageNo=1&numOfRows=${ROWS}&locatadd_nm=${encodeURIComponent(area)}`;
  const json = JSON.parse(await get(url)) as { StanReginCd?: { row?: LawdRow[] }[] };
  const rows = (json.StanReginCd ?? []).flatMap((part) => part.row ?? []);
  const name = (r: LawdRow) => r.locatadd_nm.replace(/\s+/g, ' ').trim();
  const sgg = rows.filter((r) => r.sgg_cd !== '000' && r.umd_cd === '000' && r.ri_cd === '00');
  const children = sgg.filter((r) => name(r).startsWith(`${area} `));
  const exact = sgg.filter((r) => name(r) === area);
  return [...new Set((children.length ? children : exact).map((r) => r.region_cd.slice(0, 5)))];
}

/** 지역코드 · 계약월(YYYYMM)의 아파트 매매. 해제된 거래는 뺀다 */
async function fetchAptTrades(serviceKey: string, code: string, ym: string): Promise<NearbyTrade[]> {
  const out: NearbyTrade[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${TRADE_URL}?serviceKey=${encodeURIComponent(cleanKey(serviceKey))}&LAWD_CD=${code}&DEAL_YMD=${ym}&pageNo=${page}&numOfRows=${ROWS}`;
    const xml = await get(url);
    const resultCode = tag(xml, 'resultCode');
    if (resultCode && !/^0+$/.test(resultCode)) throw new Error(tag(xml, 'resultMsg') ?? `resultCode ${resultCode}`);

    const items = xml.split('<item>').slice(1);
    for (const item of items) {
      if (tag(item, 'cdealType', '해제여부') === 'O') continue;
      const name = tag(item, 'aptNm', '아파트');
      const price = toNumber(tag(item, 'dealAmount', '거래금액'));
      const area = toNumber(tag(item, 'excluUseAr', '전용면적'));
      const [y, m, d] = [tag(item, 'dealYear', '년'), tag(item, 'dealMonth', '월'), tag(item, 'dealDay', '일')];
      const date = y && m && d ? normDate(`${y}${m.padStart(2, '0')}${d.padStart(2, '0')}`) : undefined;
      if (!name || !price || !area || !date) continue;
      out.push({
        name,
        dong: tag(item, 'umdNm', '법정동') ?? '',
        buildYear: toNumber(tag(item, 'buildYear', '건축년도')),
        area: Math.round(area * 100) / 100,
        price,
        date,
        floor: toNumber(tag(item, 'floor', '층')),
      });
    }
    const total = toNumber(tag(xml, 'totalCount')) ?? 0;
    if (items.length === 0 || page * ROWS >= total) break;
  }
  return out;
}

/** 오늘이 속한 달부터 거꾸로 n개월 (YYYYMM) */
export function recentMonths(today: string, n: number): string[] {
  const [y, m] = today.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(y, m - 1 - i, 1);
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
}

/**
 * 한 번의 빌드에서 쓰는 실거래 자료 창구.
 * 같은 지역·월은 한 번만 받고, 지역코드는 lawdCache(state.json 에 저장)에 남겨 다음 빌드에서 다시 찾지 않는다.
 */
export function createTradeSource(serviceKey: string, lawdCache: Record<string, string[]>) {
  const run = limiter(PARALLEL);
  const months = new Map<string, Promise<NearbyTrade[]>>();
  const source = {
    calls: 0,
    /** 게이트웨이 오류가 나면 이유를 남기고 이후 요청은 모두 건너뛴다 */
    disabled: '' as string,

    async guard<T>(fn: () => Promise<T>): Promise<T> {
      if (source.disabled) throw new GatewayError(source.disabled);
      try {
        source.calls++;
        return await run(fn);
      } catch (e) {
        if (e instanceof GatewayError && !source.disabled) source.disabled = e.message;
        throw e;
      }
    },

    async codes(area: string): Promise<string[]> {
      if (lawdCache[area]?.length) return lawdCache[area];
      const codes = await source.guard(() => fetchLawdCodes(serviceKey, area));
      if (codes.length) lawdCache[area] = codes;
      return codes;
    },

    async trades(codes: string[], yms: string[]): Promise<NearbyTrade[]> {
      const jobs = codes.flatMap((code) =>
        yms.map((ym) => {
          const key = `${code}_${ym}`;
          if (!months.has(key)) months.set(key, source.guard(() => fetchAptTrades(serviceKey, code, ym)));
          return months.get(key)!;
        })
      );
      return (await Promise.all(jobs)).flat();
    },
  };
  return source;
}
