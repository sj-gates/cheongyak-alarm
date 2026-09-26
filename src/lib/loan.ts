/**
 * 당첨 뒤 잔금대출(주택담보대출) 예상 한도. 분양가 × LTV 에 주택가격별 최대한도를 씌운 참고값이다.
 * 실제 한도는 소득(DSR 40%)·신용·입주 때 감정가에 따라 달라진다.
 *
 * 기준 (바뀌면 여기만 고친다)
 *   - 2025.6.27 가계부채 관리 강화: 수도권·규제지역 주담대 최대 6억, 생애최초 LTV 70% (지방 비규제 80%),
 *     중도금대출은 한도 제외 · 잔금대출로 바꿀 때 적용
 *   - 2025.10.16 주택시장 안정화: 규제지역 LTV 40%, 수도권·규제지역 시가 15억 초과 4억 · 25억 초과 2억
 *   - 규제지역: 서울 전역 + 경기 12곳(2025.10.16) + 화성 동탄구·용인 기흥구·구리(2026.7.1)
 */
import { addressArea } from './address';
import type { Notice } from './types';

export const LOAN_RULES_AS_OF = '2026.7.1 규제 기준';

/** 투기과열지구·조정대상지역 (주소의 시·도 + 시·군·구 앞부분으로 맞춘다) */
const REGULATED = [
  '서울특별시',
  '경기도 과천시',
  '경기도 광명시',
  '경기도 구리시',
  '경기도 성남시 분당구',
  '경기도 성남시 수정구',
  '경기도 성남시 중원구',
  '경기도 수원시 영통구',
  '경기도 수원시 장안구',
  '경기도 수원시 팔달구',
  '경기도 안양시 동안구',
  '경기도 용인시 기흥구',
  '경기도 용인시 수지구',
  '경기도 의왕시',
  '경기도 하남시',
  '경기도 화성시 동탄구',
];
const CAPITAL = new Set(['서울', '경기', '인천']);

export interface LoanArea {
  regulated: boolean; // 투기과열지구·조정대상지역
  capital: boolean; // 수도권
}

export function loanArea(n: Pick<Notice, 'region' | 'address' | 'tags'>): LoanArea {
  const area = addressArea(n.address)?.area ?? '';
  const regulated =
    n.tags.includes('투기과열지구') ||
    n.tags.includes('조정대상지역') ||
    REGULATED.some((r) => area === r || area.startsWith(`${r} `));
  return { regulated, capital: CAPITAL.has(n.region) };
}

export interface LoanEstimate {
  ltv: number; // %
  amount: number; // 만원
  capped: boolean; // 최대한도에 걸렸는지
}

/** 분양가(만원) 기준 잔금대출 예상. firstTime: 생애최초 주택구입 */
export function estimateLoan(price: number, where: LoanArea, firstTime: boolean): LoanEstimate {
  const strict = where.capital || where.regulated;
  const ltv = firstTime ? (strict ? 70 : 80) : where.regulated ? 40 : 70;
  const byLtv = Math.floor((price * ltv) / 100 / 100) * 100; // 100만원 단위로 내림
  const cap = strict ? (price <= 150000 ? 60000 : price <= 250000 ? 40000 : 20000) : Infinity;
  return { ltv, amount: Math.min(byLtv, cap), capped: byLtv > cap };
}

/** 표 아래 설명: 어떤 기준으로 계산했는지 */
export function loanNote(where: LoanArea): string {
  const place = where.regulated ? '규제지역' : where.capital ? '수도권 비규제지역' : '지방 비규제지역';
  const cap = where.capital || where.regulated ? ' · 시가 15억 이하 최대 6억(15억 초과 4억, 25억 초과 2억)' : '';
  return `${place} 기준 · 분양가 × LTV${cap} · 소득(DSR 40%)에 따라 줄 수 있고 입주 때 감정가로 다시 계산돼요 · ${LOAN_RULES_AS_OF}`;
}
