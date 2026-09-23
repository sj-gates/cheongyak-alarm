export type Category = 'APT' | 'REMNDR' | 'RESUPPLY' | 'URBTY' | 'PBLPVT' | 'OPT';

/** 설정에서 골라 받는 세부 공고 종류 */
export type Kind =
  | 'APT_PRIVATE'
  | 'APT_PUBLIC'
  | 'APT_NEWLYWED'
  | 'APT_PRESALE'
  | 'REMNDR'
  | 'RESUPPLY'
  | 'URBTY_OFFICETEL'
  | 'URBTY_CITY'
  | 'URBTY_RENTAL'
  | 'URBTY_LODGING'
  | 'PBLPVT'
  | 'OPT';

export type EventKind =
  | 'announce'
  | 'special'
  | 'rank1'
  | 'rank2'
  | 'general'
  | 'receipt'
  | 'winner'
  | 'contract';

/** 청약 일정 한 칸 (예: 1순위 접수 2026-10-02 ~ 2026-10-02) */
export interface ScheduleEvent {
  id: string;
  kind: EventKind;
  label: string;
  start: string; // YYYY-MM-DD
  end?: string; // YYYY-MM-DD, 하루짜리면 없음
}

export type NoticeStatus = 'upcoming' | 'open' | 'waiting' | 'closed';

/** 여러 조회 기능의 응답을 하나로 합친 공고 */
export interface Notice {
  key: string; // `${category}_${houseManageNo}_${pblancNo}`
  category: Category;
  kind: Kind;
  houseManageNo: string;
  pblancNo: string;
  name: string;
  typeName: string; // 민영 / 국민 / 무순위 / 오피스텔 ...
  area: string; // 공급지역명
  region: string; // 17개 시·도 짧은 이름 (서울, 경기 ...)
  address: string;
  totalUnits?: number;
  announceDate?: string;
  receiptStart?: string;
  receiptEnd?: string;
  winnerDate?: string;
  contractStart?: string;
  contractEnd?: string;
  moveIn?: string;
  url?: string;
  homepage?: string;
  phone?: string;
  builder?: string;
  developer?: string;
  tags: string[]; // 투기과열지구, 분양가상한제 ...
  events: ScheduleEvent[];
}

export type SpecialKind =
  | '신혼부부'
  | '생애최초'
  | '신생아'
  | '청년'
  | '다자녀'
  | '노부모'
  | '기관추천'
  | '고령자';

/** 주택형별 정보 */
export interface HouseModel {
  label: string; // 84A
  rawType: string;
  exclusiveArea?: number; // 전용 ㎡
  supplyArea?: number; // 공급 ㎡
  generalUnits?: number;
  specialUnits?: number;
  special: Partial<Record<SpecialKind, number>>;
  price?: number; // 최고 분양가 (만원)
  deposit?: number; // 청약신청금 (만원)
}

export interface CompetitionRow {
  houseType: string;
  group: string; // 1순위 해당지역, 일반공급 ...
  units?: number;
  requests?: string;
  rate?: string;
}

export interface ScoreRow {
  houseType: string;
  reside: string;
  min?: string;
  max?: string;
  avg?: string;
}

export interface Settings {
  kinds: Kind[];
  regions: string[];
  maxPrice: number | null; // 만원
  minArea: number | null; // 전용 ㎡
  maxArea: number | null;
  specialKinds: SpecialKind[];
  newNoticeAlert: boolean;
  checkIntervalHours: number;
  dayBeforeAlert: boolean;
  dayBeforeHour: number;
  dayOfAlert: boolean;
  dayOfHour: number;
  lookbackDays: number;
}

export interface AlertLogEntry {
  id: string;
  at: number;
  title: string;
  body: string;
  noticeKey?: string;
}

export interface CheckResult {
  ok: boolean;
  at: number;
  message: string;
  total?: number;
  newCount?: number;
  notified?: number;
}
