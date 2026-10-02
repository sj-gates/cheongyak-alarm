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
/** (웹 빌드가 붙이는 값) 단지 전체 세대수: 주택인허가 총세대수 */
export interface NoticeExtra {
  complexUnits?: number;
}

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

/** 주변 아파트 매매 한 건 (국토교통부 실거래가) */
export interface NearbyTrade {
  name: string; // 단지명
  dong: string; // 법정동
  buildYear?: number;
  area: number; // 전용 ㎡
  price: number; // 만원
  date: string; // 계약일 YYYY-MM-DD
  floor?: number;
}

/** 공고 상세의 "주변 실거래가": 공고의 대표 주택형과 넓이가 비슷한 주변 단지 */
export interface NearbyTrades {
  at: number; // 만든 시각
  model: string; // 비교 기준 주택형 (84A)
  area: number; // 기준 전용 ㎡
  price?: number; // 기준 주택형 최고 분양가 (만원)
  items: NearbyTrade[];
}

/** 주변에서 먼저 분양한 아파트의 1순위 청약 경쟁률 */
export interface NearbyRate {
  name: string;
  area: string; // 시·군·구 ("동작구", "수원시 권선구")
  date: string; // 모집공고일 YYYY-MM-DD
  units: number; // 일반공급 세대수
  requests: number; // 1순위 접수 건수
  top?: { type: string; rate: number }; // 경쟁률이 가장 높았던 주택형
}

/** 사이트의 data/nearby/<공고>.json (앱 상세가 읽는다) */
export interface NearbyInfo {
  trades?: NearbyTrades;
  rates?: NearbyRate[];
}

/** 분석 탭의 한 줄 (아이콘 · 제목 · 설명) */
export interface AnalysisPoint {
  icon: 'train' | 'school' | 'book' | 'cart' | 'price' | 'people' | 'wallet' | 'flag' | 'home' | 'calendar' | 'news';
  title: string;
  text: string;
  tone?: 'good' | 'bad';
  url?: string; // 출처·기사 링크
  urlLabel?: string;
}

export interface AnalysisSection {
  title: string;
  points: AnalysisPoint[];
  note?: string;
}

/** 사이트의 data/analysis/<공고>.json: 찜한 공고 분석. 문장까지 웹 빌드가 만들고 웹·앱은 그대로 보여 준다 */
export interface NoticeAnalysis {
  at: number;
  key: string;
  name: string;
  highlights: string[]; // 한눈에 보는 요약 ("역세권", "주변보다 16% 저렴" ...)
  summary?: string; // 자동 요약 문장 (문장마다 줄바꿈)
  sections: AnalysisSection[];
}
