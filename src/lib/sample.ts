/**
 * 인증키가 반영되기 전에 화면을 둘러볼 수 있는 예시 데이터.
 * 실제 API 응답과 같은 항목 이름으로 만들어 같은 변환 코드를 거친다.
 * 날짜는 오늘 기준으로 계산해서 접수중·예정·발표대기가 골고루 나온다.
 */
import { addDays, todayStr } from './dates';
import {
  normalizeCompetition,
  normalizeModel,
  normalizeNotice,
  normalizeScore,
  type RawRecord,
} from './normalize';
import type { Category, CompetitionRow, HouseModel, Notice, ScoreRow } from './types';

export const DEMO_PREFIX = 'DEMO';

function aptRaw(
  no: number,
  name: string,
  opts: {
    area: string;
    address: string;
    dtl: '01' | '03';
    secd?: '01' | '10';
    units: number;
    announce: number;
    special: number;
    rank1: number;
    rank1Etc?: number;
    rank2: number;
    winner: number;
    contract: number;
    flags?: string[];
  }
): RawRecord {
  const t = todayStr();
  const d = (n: number) => addDays(t, n);
  const id = `${DEMO_PREFIX}${String(no).padStart(3, '0')}`;
  const r1e = opts.rank1Etc ?? opts.rank1;
  const r: RawRecord = {
    HOUSE_MANAGE_NO: id,
    PBLANC_NO: id,
    HOUSE_NM: `(예시) ${name}`,
    HOUSE_SECD: opts.secd ?? '01',
    HOUSE_SECD_NM: opts.secd === '10' ? '신혼희망타운' : 'APT',
    HOUSE_DTL_SECD: opts.dtl,
    HOUSE_DTL_SECD_NM: opts.dtl === '01' ? '민영' : '국민',
    SUBSCRPT_AREA_CODE_NM: opts.area,
    HSSPLY_ADRES: opts.address,
    TOT_SUPLY_HSHLDCO: opts.units,
    RCRIT_PBLANC_DE: d(opts.announce),
    RCEPT_BGNDE: d(opts.special),
    RCEPT_ENDDE: d(opts.rank2),
    SPSPLY_RCEPT_BGNDE: d(opts.special),
    SPSPLY_RCEPT_ENDDE: d(opts.special),
    GNRL_RNK1_CRSPAREA_RCPTDE: d(opts.rank1),
    GNRL_RNK1_CRSPAREA_ENDDE: d(opts.rank1),
    GNRL_RNK1_ETC_GG_RCPTDE: d(r1e),
    GNRL_RNK1_ETC_GG_ENDDE: d(r1e),
    GNRL_RNK1_ETC_AREA_RCPTDE: d(r1e),
    GNRL_RNK1_ETC_AREA_ENDDE: d(r1e),
    GNRL_RNK2_CRSPAREA_RCPTDE: d(opts.rank2),
    GNRL_RNK2_CRSPAREA_ENDDE: d(opts.rank2),
    GNRL_RNK2_ETC_GG_RCPTDE: d(opts.rank2),
    GNRL_RNK2_ETC_GG_ENDDE: d(opts.rank2),
    GNRL_RNK2_ETC_AREA_RCPTDE: d(opts.rank2),
    GNRL_RNK2_ETC_AREA_ENDDE: d(opts.rank2),
    PRZWNER_PRESNATN_DE: d(opts.winner),
    CNTRCT_CNCLS_BGNDE: d(opts.contract),
    CNTRCT_CNCLS_ENDDE: d(opts.contract + 2),
    CNSTRCT_ENTRPS_NM: '예시건설(주)',
    BSNS_MBY_NM: '예시개발(주)',
    MDHS_TELNO: '0000000000',
    MVN_PREARNGE_YM: '202911',
    PBLANC_URL: 'https://www.applyhome.co.kr',
  };
  for (const f of opts.flags ?? []) r[f] = 'Y';
  return r;
}

function simpleRaw(
  no: number,
  name: string,
  opts: {
    secdNm: string;
    dtlNm?: string;
    area: string;
    address: string;
    units: number;
    announce: number;
    receipt: number;
    receiptEnd?: number;
    winner: number;
    contract: number;
  }
): RawRecord {
  const t = todayStr();
  const d = (n: number) => addDays(t, n);
  const id = `${DEMO_PREFIX}${String(no).padStart(3, '0')}`;
  return {
    HOUSE_MANAGE_NO: id,
    PBLANC_NO: id,
    HOUSE_NM: `(예시) ${name}`,
    HOUSE_SECD_NM: opts.secdNm,
    HOUSE_DTL_SECD_NM: opts.dtlNm,
    SUBSCRPT_AREA_CODE_NM: opts.area,
    HSSPLY_ADRES: opts.address,
    TOT_SUPLY_HSHLDCO: opts.units,
    RCRIT_PBLANC_DE: d(opts.announce),
    SUBSCRPT_RCEPT_BGNDE: d(opts.receipt),
    SUBSCRPT_RCEPT_ENDDE: d(opts.receiptEnd ?? opts.receipt),
    PRZWNER_PRESNATN_DE: d(opts.winner),
    CNTRCT_CNCLS_BGNDE: d(opts.contract),
    CNTRCT_CNCLS_ENDDE: d(opts.contract),
    BSNS_MBY_NM: '예시개발(주)',
    MDHS_TELNO: '0000000000',
    MVN_PREARNGE_YM: '202808',
    PBLANC_URL: 'https://www.applyhome.co.kr',
  };
}

function rawNotices(): [Category, RawRecord][] {
  return [
    [
      'APT',
      aptRaw(1, '한강 리버파크', {
        area: '서울',
        address: '서울특별시 성동구 예시로 101',
        dtl: '01',
        units: 842,
        announce: -5,
        special: 1,
        rank1: 2,
        rank2: 3,
        winner: 9,
        contract: 20,
        flags: ['SPECLT_RDN_EARTH_AT', 'PARCPRC_ULS_AT', 'MDAT_TRGET_AREA_SECD'],
      }),
    ],
    [
      'APT',
      aptRaw(2, '광교 센트럴 스퀘어', {
        area: '경기',
        address: '경기도 수원시 영통구 예시대로 22',
        dtl: '03',
        units: 1130,
        announce: -8,
        special: -1,
        rank1: 0,
        rank1Etc: 1,
        rank2: 2,
        winner: 8,
        contract: 19,
        flags: ['PUBLIC_HOUSE_EARTH_AT'],
      }),
    ],
    [
      'APT',
      aptRaw(3, '동탄 호수마을', {
        area: '경기',
        address: '경기도 화성시 예시동 3',
        dtl: '03',
        secd: '10',
        units: 520,
        announce: -1,
        special: 8,
        rank1: 9,
        rank2: 10,
        winner: 17,
        contract: 30,
      }),
    ],
    [
      'REMNDR',
      simpleRaw(4, '성수 더 퍼스트', {
        secdNm: '무순위',
        area: '서울',
        address: '서울특별시 성동구 예시길 4',
        units: 3,
        announce: -2,
        receipt: 4,
        winner: 7,
        contract: 12,
      }),
    ],
    [
      'REMNDR',
      simpleRaw(5, '판교 그린힐', {
        secdNm: '무순위',
        area: '경기',
        address: '경기도 성남시 분당구 예시로 5',
        units: 12,
        announce: -18,
        receipt: -10,
        winner: -5,
        contract: 2,
      }),
    ],
    [
      'APT',
      aptRaw(6, '송도 오션뷰', {
        area: '인천',
        address: '인천광역시 연수구 예시동 6',
        dtl: '01',
        units: 690,
        announce: -12,
        special: -5,
        rank1: -4,
        rank2: -3,
        winner: 3,
        contract: 14,
      }),
    ],
    [
      'URBTY',
      simpleRaw(7, '마포 스테이 오피스텔', {
        secdNm: '도시형/오피스텔/민간임대',
        dtlNm: '오피스텔',
        area: '서울',
        address: '서울특별시 마포구 예시로 7',
        units: 288,
        announce: -3,
        receipt: 5,
        receiptEnd: 6,
        winner: 9,
        contract: 15,
      }),
    ],
    [
      'APT',
      aptRaw(8, '해운대 마린시티', {
        area: '부산',
        address: '부산광역시 해운대구 예시로 8',
        dtl: '01',
        units: 410,
        announce: -4,
        special: 3,
        rank1: 4,
        rank2: 5,
        winner: 11,
        contract: 22,
      }),
    ],
  ];
}

export function sampleNotices(): Notice[] {
  return rawNotices().map(([c, r]) => normalizeNotice(c, r));
}

export function isDemoKey(key: string) {
  return key.includes(`_${DEMO_PREFIX}`);
}

export function sampleModels(notice: Notice): HouseModel[] {
  if (notice.category === 'URBTY') {
    return [
      { GP: '1군', TP: '24A', EXCLUSE_AR: '24.12', SUPLY_HSHLDCO: 180, SUPLY_AMOUNT: '31800', SUBSCRPT_REQST_AMOUNT: '100' },
      { GP: '1군', TP: '39B', EXCLUSE_AR: '39.50', SUPLY_HSHLDCO: 108, SUPLY_AMOUNT: '49900', SUBSCRPT_REQST_AMOUNT: '100' },
    ].map((r) => normalizeModel('URBTY', r));
  }
  const base = notice.region === '서울' ? 1 : notice.region === '부산' ? 0.6 : 0.7;
  const rows: RawRecord[] = [
    { MODEL_NO: '01', HOUSE_TY: '059.9700A', SUPLY_AR: '84.21', SUPLY_HSHLDCO: 120, SPSPLY_HSHLDCO: 96, MNYCH_HSHLDCO: 12, NWWDS_HSHLDCO: 22, LFE_FRST_HSHLDCO: 12, OLD_PARNTS_SUPORT_HSHLDCO: 4, INSTT_RECOMEND_HSHLDCO: 12, NWBB_HSHLDCO: 20, YGMN_HSHLDCO: 14, LTTOT_TOP_AMOUNT: String(Math.round(98000 * base)) },
    { MODEL_NO: '02', HOUSE_TY: '084.9800A', SUPLY_AR: '112.40', SUPLY_HSHLDCO: 210, SPSPLY_HSHLDCO: 140, MNYCH_HSHLDCO: 20, NWWDS_HSHLDCO: 36, LFE_FRST_HSHLDCO: 18, OLD_PARNTS_SUPORT_HSHLDCO: 6, INSTT_RECOMEND_HSHLDCO: 20, NWBB_HSHLDCO: 40, YGMN_HSHLDCO: 0, LTTOT_TOP_AMOUNT: String(Math.round(132000 * base)) },
    { MODEL_NO: '03', HOUSE_TY: '084.9500B', SUPLY_AR: '111.90', SUPLY_HSHLDCO: 88, SPSPLY_HSHLDCO: 52, MNYCH_HSHLDCO: 8, NWWDS_HSHLDCO: 14, LFE_FRST_HSHLDCO: 6, OLD_PARNTS_SUPORT_HSHLDCO: 2, INSTT_RECOMEND_HSHLDCO: 8, NWBB_HSHLDCO: 14, YGMN_HSHLDCO: 0, LTTOT_TOP_AMOUNT: String(Math.round(129500 * base)) },
  ];
  if (notice.category === 'REMNDR') return rows.slice(1, 2).map((r) => normalizeModel('REMNDR', { ...r, SUPLY_HSHLDCO: notice.totalUnits, SPSPLY_HSHLDCO: 0 }));
  return rows.map((r) => normalizeModel(notice.category, r));
}

export function sampleCompetition(notice: Notice): CompetitionRow[] {
  if (notice.category === 'REMNDR') {
    return [{ HOUSE_TY: '084.9800A', SUPLY_HSHLDCO: notice.totalUnits, REQ_CNT: '48213', CMPET_RATE: '4017.75', REMNDR_HSHLD_PBLANC_TYCD: '01' }].map(
      (r) => normalizeCompetition('REMNDR', r)
    );
  }
  const rows: RawRecord[] = [
    { HOUSE_TY: '059.9700A', SUPLY_HSHLDCO: 120, SUBSCRPT_RANK_CODE: 1, RESIDE_SENM: '해당지역', REQ_CNT: '5412', CMPET_RATE: '45.10' },
    { HOUSE_TY: '059.9700A', SUPLY_HSHLDCO: 120, SUBSCRPT_RANK_CODE: 1, RESIDE_SENM: '기타지역', REQ_CNT: '9230', CMPET_RATE: '-' },
    { HOUSE_TY: '084.9800A', SUPLY_HSHLDCO: 210, SUBSCRPT_RANK_CODE: 1, RESIDE_SENM: '해당지역', REQ_CNT: '3901', CMPET_RATE: '18.58' },
    { HOUSE_TY: '084.9500B', SUPLY_HSHLDCO: 88, SUBSCRPT_RANK_CODE: 1, RESIDE_SENM: '해당지역', REQ_CNT: '1022', CMPET_RATE: '11.61' },
  ];
  return rows.map((r) => normalizeCompetition('APT', r));
}

export function sampleScores(notice: Notice): ScoreRow[] {
  if (notice.category !== 'APT') return [];
  return [
    { HOUSE_TY: '059.9700A', RESIDE_SENM: '해당지역', LWET_SCORE: '62', TOP_SCORE: '79', AVRG_SCORE: '66.4' },
    { HOUSE_TY: '084.9800A', RESIDE_SENM: '해당지역', LWET_SCORE: '57', TOP_SCORE: '74', AVRG_SCORE: '61.2' },
    { HOUSE_TY: '084.9500B', RESIDE_SENM: '해당지역', LWET_SCORE: '55', TOP_SCORE: '69', AVRG_SCORE: '58.9' },
  ].map(normalizeScore);
}
