import { normDate } from './dates';
import { toNumber } from './format';
import { regionOf } from './regions';
import type {
  Category,
  CompetitionRow,
  HouseModel,
  Kind,
  Notice,
  ScheduleEvent,
  ScoreRow,
  SpecialKind,
} from './types';

export type RawRecord = Record<string, unknown>;

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

export function noticeKey(category: Category, houseManageNo: string, pblancNo: string) {
  return `${category}_${houseManageNo}_${pblancNo}`;
}

export function parseNoticeKey(key: string) {
  const [category, houseManageNo, pblancNo] = key.split('_');
  return { category: category as Category, houseManageNo, pblancNo };
}

function typeNameOf(category: Category, r: RawRecord): string {
  switch (category) {
    case 'APT': {
      const secd = str(r.HOUSE_SECD);
      if (secd && secd !== '01') return str(r.HOUSE_SECD_NM) || 'APT';
      return str(r.HOUSE_DTL_SECD_NM) || 'APT';
    }
    case 'REMNDR':
      return str(r.HOUSE_SECD_NM) || '무순위';
    case 'RESUPPLY':
      return str(r.HOUSE_SECD_NM) || '불법행위 재공급';
    case 'URBTY':
      return str(r.HOUSE_DTL_SECD_NM) || '오피스텔';
    case 'PBLPVT':
      return str(r.HOUSE_DETAIL_SECD_NM) || '공공지원민간임대';
    case 'OPT':
      return str(r.HOUSE_SECD_NM) || '임의공급';
  }
}

/** 주택구분코드로 세부 종류를 정한다 (이름 글자보다 코드가 안정적이다) */
function kindOf(category: Category, r: RawRecord): Kind {
  switch (category) {
    case 'APT': {
      const secd = str(r.HOUSE_SECD);
      if (secd === '10') return 'APT_NEWLYWED';
      if (secd === '09') return 'APT_PRESALE';
      return str(r.HOUSE_DTL_SECD) === '03' ? 'APT_PUBLIC' : 'APT_PRIVATE';
    }
    case 'URBTY': {
      const dtl = str(r.HOUSE_DTL_SECD);
      if (dtl === '01') return 'URBTY_CITY';
      if (dtl === '03') return 'URBTY_RENTAL';
      if (dtl === '04') return 'URBTY_LODGING';
      return 'URBTY_OFFICETEL';
    }
    default:
      return category;
  }
}

const APT_FLAGS: [string, string][] = [
  ['SPECLT_RDN_EARTH_AT', '투기과열지구'],
  ['MDAT_TRGET_AREA_SECD', '조정대상지역'],
  ['PARCPRC_ULS_AT', '분양가상한제'],
  ['IMPRMN_BSNS_AT', '정비사업'],
  ['PUBLIC_HOUSE_EARTH_AT', '공공주택지구'],
  ['LRSCL_BLDLND_AT', '대규모택지'],
];

/**
 * 해당지역·기타경기·기타지역 접수일이 같으면 "1순위" 한 줄로, 다르면 나눠서 보여준다.
 */
function rankEvents(
  kind: 'rank1' | 'rank2',
  label: string,
  parts: [string, unknown, unknown][]
): ScheduleEvent[] {
  const groups = new Map<string, { names: string[]; start: string; end?: string }>();
  for (const [name, s, e] of parts) {
    const start = normDate(s);
    if (!start) continue;
    const end = normDate(e);
    const id = `${start}|${end ?? ''}`;
    const g = groups.get(id);
    if (g) g.names.push(name);
    else groups.set(id, { names: [name], start, end });
  }
  const list = [...groups.values()];
  return list.map((g, i) => ({
    id: `${kind}${i}`,
    kind,
    label: list.length > 1 ? `${label} ${g.names.join('·')}` : label,
    start: g.start,
    end: g.end && g.end !== g.start ? g.end : undefined,
  }));
}

function buildEvents(category: Category, r: RawRecord): ScheduleEvent[] {
  const events: ScheduleEvent[] = [];
  const push = (id: string, kind: ScheduleEvent['kind'], label: string, s: unknown, e?: unknown) => {
    const start = normDate(s);
    if (!start) return;
    const end = normDate(e);
    events.push({ id, kind, label, start, end: end && end !== start ? end : undefined });
  };

  push('announce', 'announce', '모집공고', r.RCRIT_PBLANC_DE);
  push('special', 'special', '특별공급', r.SPSPLY_RCEPT_BGNDE, r.SPSPLY_RCEPT_ENDDE);

  if (category === 'APT') {
    events.push(
      ...rankEvents('rank1', '1순위', [
        ['해당지역', r.GNRL_RNK1_CRSPAREA_RCPTDE, r.GNRL_RNK1_CRSPAREA_ENDDE],
        ['기타경기', r.GNRL_RNK1_ETC_GG_RCPTDE, r.GNRL_RNK1_ETC_GG_ENDDE],
        ['기타지역', r.GNRL_RNK1_ETC_AREA_RCPTDE, r.GNRL_RNK1_ETC_AREA_ENDDE],
      ]),
      ...rankEvents('rank2', '2순위', [
        ['해당지역', r.GNRL_RNK2_CRSPAREA_RCPTDE, r.GNRL_RNK2_CRSPAREA_ENDDE],
        ['기타경기', r.GNRL_RNK2_ETC_GG_RCPTDE, r.GNRL_RNK2_ETC_GG_ENDDE],
        ['기타지역', r.GNRL_RNK2_ETC_AREA_RCPTDE, r.GNRL_RNK2_ETC_AREA_ENDDE],
      ])
    );
  } else if (normDate(r.GNRL_RCEPT_BGNDE)) {
    push('general', 'general', '일반공급', r.GNRL_RCEPT_BGNDE, r.GNRL_RCEPT_ENDDE);
  } else {
    // 전체 접수기간이 특별공급 기간과 똑같으면 같은 일정이 두 줄로 보이므로 뺀다
    const special = events.find((e) => e.kind === 'special');
    const start = normDate(r.SUBSCRPT_RCEPT_BGNDE);
    const end = normDate(r.SUBSCRPT_RCEPT_ENDDE);
    const sameAsSpecial = special && special.start === start && (special.end ?? special.start) === (end ?? start);
    if (!sameAsSpecial) push('receipt', 'receipt', '청약접수', r.SUBSCRPT_RCEPT_BGNDE, r.SUBSCRPT_RCEPT_ENDDE);
  }

  push('winner', 'winner', '당첨자 발표', r.PRZWNER_PRESNATN_DE);
  push('contract', 'contract', '계약', r.CNTRCT_CNCLS_BGNDE, r.CNTRCT_CNCLS_ENDDE);

  const order: Record<ScheduleEvent['kind'], number> = {
    announce: 0,
    special: 1,
    rank1: 2,
    rank2: 3,
    general: 2,
    receipt: 2,
    winner: 4,
    contract: 5,
  };
  return events.sort((a, b) => a.start.localeCompare(b.start) || order[a.kind] - order[b.kind]);
}

const RECEIPT_KINDS = new Set(['special', 'rank1', 'rank2', 'general', 'receipt']);

export function normalizeNotice(category: Category, r: RawRecord): Notice {
  const houseManageNo = str(r.HOUSE_MANAGE_NO);
  const pblancNo = str(r.PBLANC_NO);
  const area = str(r.SUBSCRPT_AREA_CODE_NM);
  const address = str(r.HSSPLY_ADRES);
  const events = buildEvents(category, r);

  const receiptEvents = events.filter((e) => RECEIPT_KINDS.has(e.kind));
  const receiptStart =
    normDate(category === 'APT' ? r.RCEPT_BGNDE : r.SUBSCRPT_RCEPT_BGNDE) ?? receiptEvents[0]?.start;
  const lastReceipt = receiptEvents[receiptEvents.length - 1];
  const receiptEnd =
    normDate(category === 'APT' ? r.RCEPT_ENDDE : r.SUBSCRPT_RCEPT_ENDDE) ??
    (lastReceipt ? lastReceipt.end ?? lastReceipt.start : undefined);

  const tags =
    category === 'APT' ? APT_FLAGS.filter(([f]) => str(r[f]) === 'Y').map(([, label]) => label) : [];

  return {
    key: noticeKey(category, houseManageNo, pblancNo),
    category,
    kind: kindOf(category, r),
    houseManageNo,
    pblancNo,
    name: str(r.HOUSE_NM) || '(이름 없음)',
    typeName: typeNameOf(category, r),
    area,
    region: regionOf(area, address),
    address,
    totalUnits: toNumber(r.TOT_SUPLY_HSHLDCO),
    announceDate: normDate(r.RCRIT_PBLANC_DE),
    receiptStart,
    receiptEnd,
    winnerDate: normDate(r.PRZWNER_PRESNATN_DE),
    contractStart: normDate(r.CNTRCT_CNCLS_BGNDE),
    contractEnd: normDate(r.CNTRCT_CNCLS_ENDDE),
    moveIn: str(r.MVN_PREARNGE_YM) || undefined,
    url: str(r.PBLANC_URL) || undefined,
    homepage: str(r.HMPG_ADRES) || undefined,
    phone: str(r.MDHS_TELNO) || undefined,
    builder: str(r.CNSTRCT_ENTRPS_NM) || undefined,
    developer: str(r.BSNS_MBY_NM) || undefined,
    tags,
    events,
  };
}

/** "084.9800A" → { label: "84A", area: 84.98 } */
export function parseHouseType(raw: string): { label: string; area?: number } {
  const m = raw.trim().match(/^0*(\d+)\.(\d+)\s*([A-Za-z가-힣0-9]*)$/);
  if (!m) return { label: raw.trim() };
  const area = Number(`${m[1]}.${m[2]}`);
  return { label: `${Number(m[1])}${m[3] ?? ''}`, area };
}

export function normalizeModel(category: Category, r: RawRecord): HouseModel {
  if (category === 'URBTY' || category === 'PBLPVT') {
    const label = [str(r.GP), str(r.TP)].filter(Boolean).join(' ') || str(r.MODEL_NO);
    const special: Partial<Record<SpecialKind, number>> = {};
    if (category === 'PBLPVT') {
      special['청년'] = toNumber(r.SPSPLY_YGMN_HSHLDCO);
      special['신혼부부'] = toNumber(r.SPSPLY_NEW_MRRG_HSHLDCO);
      special['고령자'] = toNumber(r.SPSPLY_AGED_HSHLDCO);
    }
    return {
      label,
      rawType: label,
      exclusiveArea: toNumber(r.EXCLUSE_AR),
      supplyArea: toNumber(r.SUPLY_AR),
      generalUnits: toNumber(r.GNSPLY_HSHLDCO) ?? toNumber(r.SUPLY_HSHLDCO),
      specialUnits: undefined,
      special,
      price: toNumber(r.SUPLY_AMOUNT),
      deposit: toNumber(r.SUBSCRPT_REQST_AMOUNT),
    };
  }

  const rawType = str(r.HOUSE_TY);
  const { label, area } = parseHouseType(rawType);
  const special: Partial<Record<SpecialKind, number>> = {};
  if (category === 'APT') {
    special['다자녀'] = toNumber(r.MNYCH_HSHLDCO);
    special['신혼부부'] = toNumber(r.NWWDS_HSHLDCO);
    special['생애최초'] = toNumber(r.LFE_FRST_HSHLDCO);
    special['노부모'] = toNumber(r.OLD_PARNTS_SUPORT_HSHLDCO);
    special['기관추천'] = toNumber(r.INSTT_RECOMEND_HSHLDCO);
    special['청년'] = toNumber(r.YGMN_HSHLDCO);
    special['신생아'] = toNumber(r.NWBB_HSHLDCO);
  }
  return {
    label,
    rawType,
    exclusiveArea: area,
    supplyArea: toNumber(r.SUPLY_AR),
    generalUnits: toNumber(r.SUPLY_HSHLDCO),
    specialUnits: toNumber(r.SPSPLY_HSHLDCO),
    special,
    price: toNumber(r.LTTOT_TOP_AMOUNT),
  };
}

export function normalizeCompetition(category: Category, r: RawRecord): CompetitionRow {
  const houseType = parseHouseType(str(r.HOUSE_TY)).label;
  let group = '';
  switch (category) {
    case 'APT': {
      const rank = str(r.SUBSCRPT_RANK_CODE);
      group = `${rank ? `${rank}순위 ` : ''}${str(r.RESIDE_SENM)}`.trim();
      break;
    }
    case 'URBTY':
      group = str(r.RESIDNT_PRIOR_SENM) || '일반';
      break;
    case 'PBLPVT':
      group = str(r.SPSPLY_KND_NM) || '일반공급';
      break;
    case 'REMNDR':
    case 'RESUPPLY':
      group = str(r.REMNDR_HSHLD_PBLANC_TYCD) === '02' ? '사전 접수' : '접수';
      break;
    case 'OPT':
      group = '접수';
      break;
  }
  return {
    houseType,
    group,
    units: toNumber(r.SUPLY_HSHLDCO),
    requests: str(r.REQ_CNT) || undefined,
    rate: str(r.CMPET_RATE) || undefined,
  };
}

const scoreValue = (v: unknown) => {
  const s = str(v);
  return s && s !== '-' ? s : undefined;
};

export function normalizeScore(r: RawRecord): ScoreRow {
  return {
    houseType: parseHouseType(str(r.HOUSE_TY)).label,
    reside: str(r.RESIDE_SENM),
    min: scoreValue(r.LWET_SCORE),
    max: scoreValue(r.TOP_SCORE),
    avg: scoreValue(r.AVRG_SCORE),
  };
}

/** 미달·추첨 물량은 가점이 "-" 로만 온다 */
export function hasScore(row: ScoreRow): boolean {
  return !!(row.min || row.max || row.avg);
}

/** "(△487)" → 미달 487세대, "12.34" → 경쟁률 */
export function parseRate(rate?: string): { shortfall?: number; text: string } {
  if (!rate) return { text: '-' };
  const m = rate.match(/△\s*([\d,]+)/);
  if (m) {
    const n = Number(m[1].replace(/,/g, ''));
    return { shortfall: n, text: `미달 ${n.toLocaleString('ko-KR')}` };
  }
  return { text: rate };
}
