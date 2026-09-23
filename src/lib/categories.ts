import type { Category, Kind, Notice } from './types';

export interface CategoryMeta {
  label: string;
  short: string;
  detailOp: string;
  modelOp: string;
  competitionOp: string;
  /** 모집공고일이 20260921 형식으로 오는 조회 (날짜 필터도 같은 형식으로 보내야 정확하다) */
  compactDate?: boolean;
  /** 같은 조회 기능을 주택구분코드로 나눠 쓰는 경우 */
  houseSecd?: string;
}

/** 청약홈 분양정보 조회 서비스의 공고 종류 (잔여세대 조회는 무순위 / 불법행위 재공급으로 나눈다) */
export const CATEGORIES: Record<Category, CategoryMeta> = {
  APT: {
    label: 'APT 분양',
    short: 'APT',
    detailOp: 'getAPTLttotPblancDetail',
    modelOp: 'getAPTLttotPblancMdl',
    competitionOp: 'getAPTLttotPblancCmpet',
  },
  REMNDR: {
    label: '무순위·잔여세대',
    short: '무순위',
    detailOp: 'getRemndrLttotPblancDetail',
    modelOp: 'getRemndrLttotPblancMdl',
    competitionOp: 'getRemndrLttotPblancCmpet',
    houseSecd: '04',
  },
  RESUPPLY: {
    label: '불법행위 재공급',
    short: '불법행위 재공급',
    detailOp: 'getRemndrLttotPblancDetail',
    modelOp: 'getRemndrLttotPblancMdl',
    competitionOp: 'getRemndrLttotPblancCmpet',
    houseSecd: '06',
  },
  URBTY: {
    label: '오피스텔·도시형·민간임대',
    short: '오피스텔',
    detailOp: 'getUrbtyOfctlLttotPblancDetail',
    modelOp: 'getUrbtyOfctlLttotPblancMdl',
    competitionOp: 'getUrbtyOfctlLttotPblancCmpet',
  },
  PBLPVT: {
    label: '공공지원 민간임대',
    short: '공공임대',
    detailOp: 'getPblPvtRentLttotPblancDetail',
    modelOp: 'getPblPvtRentLttotPblancMdl',
    competitionOp: 'getPblPvtRentLttotPblancCmpet',
    compactDate: true,
  },
  OPT: {
    label: '임의공급',
    short: '임의공급',
    detailOp: 'getOPTLttotPblancDetail',
    modelOp: 'getOPTLttotPblancMdl',
    competitionOp: 'getOPTLttotPblancCmpet',
    compactDate: true,
  },
};

export const CATEGORY_ORDER: Category[] = ['APT', 'REMNDR', 'RESUPPLY', 'URBTY', 'PBLPVT', 'OPT'];

export interface KindMeta {
  id: Kind;
  category: Category;
  label: string;
  /** 목록 위 칩에 쓰는 짧은 이름 */
  short: string;
}

/** 설정 화면에 보이는 세부 종류. 묶음(group)별로 나눠 보여준다. */
export const KINDS: KindMeta[] = [
  { id: 'APT_PRIVATE', category: 'APT', label: '민영', short: 'APT 민영' },
  { id: 'APT_PUBLIC', category: 'APT', label: '국민', short: 'APT 국민' },
  { id: 'APT_NEWLYWED', category: 'APT', label: '신혼희망타운', short: '신혼희망타운' },
  { id: 'APT_PRESALE', category: 'APT', label: '민간사전청약', short: '사전청약' },
  { id: 'REMNDR', category: 'REMNDR', label: '무순위·잔여세대', short: '무순위' },
  { id: 'RESUPPLY', category: 'RESUPPLY', label: '불법행위 재공급', short: '불법행위 재공급' },
  { id: 'URBTY_OFFICETEL', category: 'URBTY', label: '오피스텔', short: '오피스텔' },
  { id: 'URBTY_CITY', category: 'URBTY', label: '도시형생활주택', short: '도시형' },
  { id: 'URBTY_RENTAL', category: 'URBTY', label: '민간임대', short: '민간임대' },
  { id: 'URBTY_LODGING', category: 'URBTY', label: '생활숙박시설', short: '생활숙박' },
  { id: 'PBLPVT', category: 'PBLPVT', label: '공공지원 민간임대', short: '공공지원임대' },
  { id: 'OPT', category: 'OPT', label: '임의공급', short: '임의공급' },
];

export const KIND_GROUPS: { title: string; kinds: Kind[] }[] = [
  { title: 'APT 분양', kinds: ['APT_PRIVATE', 'APT_PUBLIC', 'APT_NEWLYWED', 'APT_PRESALE'] },
  { title: '무순위 · 재공급', kinds: ['REMNDR', 'RESUPPLY'] },
  { title: '오피스텔 · 도시형 · 민간임대', kinds: ['URBTY_OFFICETEL', 'URBTY_CITY', 'URBTY_RENTAL', 'URBTY_LODGING'] },
  { title: '임대 · 기타', kinds: ['PBLPVT', 'OPT'] },
];

export const ALL_KINDS: Kind[] = KINDS.map((k) => k.id);

export function kindMeta(kind: Kind): KindMeta {
  return KINDS.find((k) => k.id === kind) ?? KINDS[0];
}

/** 고른 세부 종류를 받으려면 어떤 조회 기능을 불러야 하는지 */
export function categoriesForKinds(kinds: Kind[]): Category[] {
  return CATEGORY_ORDER.filter((c) => kinds.some((k) => kindMeta(k).category === c));
}

/** 카드·통계에 보여줄 유형 이름. APT만 "APT · 민영"처럼 앞에 붙이고, 나머지는 세부 유형명만. */
export function typeLabel(n: Pick<Notice, 'category' | 'typeName'>, sep = ' · '): string {
  if (n.category === 'APT') return `APT${sep}${n.typeName}`;
  return n.typeName || CATEGORIES[n.category].short;
}
