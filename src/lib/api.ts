import { CATEGORIES } from './categories';
import {
  normalizeCompetition,
  normalizeModel,
  normalizeNotice,
  normalizeScore,
  hasScore,
  parseNoticeKey,
  type RawRecord,
} from './normalize';
import type { Category, CompetitionRow, HouseModel, Notice, ScoreRow } from './types';

const BASE = 'https://api.odcloud.kr/api';
const DETAIL_SVC = 'ApplyhomeInfoDetailSvc';
const COMPETITION_SVC = 'ApplyhomeInfoCmpetRtSvc';
const PER_PAGE = 300;
const MAX_PAGES = 10;
const TIMEOUT_MS = 20000;

export class ApiError extends Error {
  code?: number;
  constructor(message: string, code?: number) {
    super(message);
    this.code = code;
  }
}

/**
 * 공공데이터포털은 Encoding / Decoding 두 가지 키를 준다.
 * 어느 쪽을 붙여넣어도 되도록 한 번 디코딩한 뒤 다시 인코딩해서 보낸다.
 */
export function cleanKey(key: string): string {
  const k = key.trim();
  if (/%[0-9A-Fa-f]{2}/.test(k)) {
    try {
      return decodeURIComponent(k);
    } catch {
      return k;
    }
  }
  return k;
}

function friendlyError(msg: string | undefined, status: number): string {
  const text = msg || `HTTP ${status}`;
  if (status === 401 && !/필수/.test(text)) {
    return `${text}\n활용신청 직후라면 인증키가 반영될 때까지 조금 기다려 주세요.`;
  }
  return text;
}

interface ApiPage {
  data: RawRecord[];
  matchCount: number;
  totalCount: number;
}

async function callApi(
  svc: string,
  op: string,
  serviceKey: string,
  params: Record<string, string | number>
): Promise<ApiPage> {
  const query = [
    `serviceKey=${encodeURIComponent(cleanKey(serviceKey))}`,
    'returnType=JSON',
    ...Object.entries(params).map(
      ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`
    ),
  ].join('&');
  const url = `${BASE}/${svc}/v1/${op}?${query}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
  } catch {
    throw new ApiError(
      controller.signal.aborted ? '응답 시간이 초과됐어요.' : '인터넷 연결을 확인해 주세요.'
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ApiError(`응답을 읽을 수 없어요 (HTTP ${res.status})`);
  }
  if (!res.ok || (typeof json.code === 'number' && json.code < 0)) {
    throw new ApiError(friendlyError(json.msg, res.status), json.code);
  }
  const data: RawRecord[] = Array.isArray(json.data) ? json.data : [];
  return {
    data,
    matchCount: typeof json.matchCount === 'number' ? json.matchCount : data.length,
    totalCount: typeof json.totalCount === 'number' ? json.totalCount : data.length,
  };
}

async function fetchAll(
  svc: string,
  op: string,
  serviceKey: string,
  params: Record<string, string | number>
): Promise<RawRecord[]> {
  const rows: RawRecord[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await callApi(svc, op, serviceKey, { ...params, page, perPage: PER_PAGE });
    rows.push(...res.data);
    if (res.data.length < PER_PAGE || rows.length >= res.matchCount) break;
  }
  return rows;
}

/** 인증키 확인용: APT 분양정보 1건만 조회 */
export async function testConnection(serviceKey: string): Promise<number> {
  const res = await callApi(DETAIL_SVC, CATEGORIES.APT.detailOp, serviceKey, {
    page: 1,
    perPage: 1,
  });
  return res.totalCount;
}

export interface FetchNoticesResult {
  notices: Notice[];
  errors: { category: Category; message: string }[];
}

/** 모집공고일이 since 이후인 공고를 공고 종류별로 모아온다 */
export async function fetchNotices(
  serviceKey: string,
  categories: Category[],
  since: string
): Promise<FetchNoticesResult> {
  const results = await Promise.allSettled(
    categories.map(async (category) => {
      const meta = CATEGORIES[category];
      const rows = await fetchAll(DETAIL_SVC, meta.detailOp, serviceKey, {
        'cond[RCRIT_PBLANC_DE::GTE]': meta.compactDate ? since.replace(/-/g, '') : since,
        ...(meta.houseSecd ? { 'cond[HOUSE_SECD::EQ]': meta.houseSecd } : {}),
      });
      return rows.map((r) => normalizeNotice(category, r));
    })
  );

  const notices: Notice[] = [];
  const errors: FetchNoticesResult['errors'] = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') notices.push(...r.value);
    else errors.push({ category: categories[i], message: errorMessage(r.reason) });
  });
  if (notices.length === 0 && errors.length > 0 && errors.length === categories.length) {
    throw new ApiError(errors[0].message);
  }

  // 서버 필터는 글자 비교라 형식이 어긋나면 넉넉하게 걸린다. 한 번 더 거른다
  const seen = new Set<string>();
  const filtered = notices.filter((n) => {
    if (seen.has(n.key)) return false;
    seen.add(n.key);
    return !n.announceDate || n.announceDate >= since;
  });
  return { notices: filtered, errors };
}

export async function fetchNoticeByKey(serviceKey: string, key: string): Promise<Notice | null> {
  const { category, houseManageNo, pblancNo } = parseNoticeKey(key);
  if (!CATEGORIES[category]) return null;
  const res = await callApi(DETAIL_SVC, CATEGORIES[category].detailOp, serviceKey, {
    page: 1,
    perPage: 5,
    'cond[HOUSE_MANAGE_NO::EQ]': houseManageNo,
    'cond[PBLANC_NO::EQ]': pblancNo,
  });
  return res.data[0] ? normalizeNotice(category, res.data[0]) : null;
}

function noticeParams(n: Pick<Notice, 'houseManageNo' | 'pblancNo'>) {
  return {
    'cond[HOUSE_MANAGE_NO::EQ]': n.houseManageNo,
    'cond[PBLANC_NO::EQ]': n.pblancNo,
  };
}

export async function fetchModels(serviceKey: string, notice: Notice): Promise<HouseModel[]> {
  const rows = await fetchAll(
    DETAIL_SVC,
    CATEGORIES[notice.category].modelOp,
    serviceKey,
    noticeParams(notice)
  );
  return rows
    .sort((a, b) => String(a.MODEL_NO ?? '').localeCompare(String(b.MODEL_NO ?? ''), 'ko', { numeric: true }))
    .map((r) => normalizeModel(notice.category, r));
}

export async function fetchCompetition(
  serviceKey: string,
  notice: Notice
): Promise<CompetitionRow[]> {
  const rows = await fetchAll(
    COMPETITION_SVC,
    CATEGORIES[notice.category].competitionOp,
    serviceKey,
    noticeParams(notice)
  );
  return rows.map((r) => normalizeCompetition(notice.category, r));
}

export async function fetchScores(serviceKey: string, notice: Notice): Promise<ScoreRow[]> {
  if (notice.category !== 'APT') return [];
  const rows = await fetchAll(
    COMPETITION_SVC,
    'getAptLttotPblancScore',
    serviceKey,
    noticeParams(notice)
  );
  return rows.map(normalizeScore).filter(hasScore);
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
