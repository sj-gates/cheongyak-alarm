import { mapQuery } from './address';
import { todayStr } from './dates';
import type { Category, Notice, ScheduleEvent } from './types';

const APPLYHOME = 'https://www.applyhome.co.kr';
const RECEIPT_KINDS = new Set<ScheduleEvent['kind']>(['special', 'rank1', 'rank2', 'general', 'receipt']);

/** 청약홈 접수 시간 */
export const APPLY_HOURS = '09:00~17:30';

/** 오늘 진행 중인 청약 접수 일정 (없으면 undefined) */
export function activeReceipt(n: Pick<Notice, 'events'>, today = todayStr()): ScheduleEvent | undefined {
  return n.events.find((e) => RECEIPT_KINDS.has(e.kind) && e.start <= today && today <= (e.end ?? e.start));
}

/** 청약홈의 청약신청 화면. 공고 종류와 접수 단계에 맞는 메뉴로 보낸다. */
export function applyUrl(category: Category, kind: ScheduleEvent['kind']): string {
  switch (category) {
    case 'APT':
      return kind === 'special'
        ? `${APPLYHOME}/ap/aph/reqst/selectSubscrtReqstAptMainView.do`
        : `${APPLYHOME}/ap/aph/reqst/selectSubscrtReqstAptMainView.do?se=01&ty=10`;
    case 'REMNDR':
      return `${APPLYHOME}/ap/aph/reqst/selectSubscrtReqstAptMainView.do?se=04&ty=10`;
    case 'RESUPPLY':
      return `${APPLYHOME}/ap/aph/reqst/selectSubscrtReqstAptMainView.do?se=06&ty=20`;
    case 'OPT':
      return `${APPLYHOME}/ap/aph/reqst/selectSubscrtReqstAptMainView.do?se=11&ty=10`;
    case 'URBTY':
      return `${APPLYHOME}/ap/apb/reqst/selectSubscrtReqstUOMainView.do`;
    case 'PBLPVT':
      return `${APPLYHOME}/ap/apc/reqst/selectSubscrtReqstPRMainView.do`;
  }
}

/** 지도: 구글 지도 미리보기(키 없이 되는 embed)와 카카오맵·네이버지도 열기 주소 */
export function mapLinks(address: string) {
  const { query, approximate } = mapQuery(address);
  const q = encodeURIComponent(query);
  return {
    query,
    approximate,
    embed: `https://maps.google.com/maps?q=${q}&z=${approximate ? 14 : 16}&output=embed`,
    kakao: `https://map.kakao.com/link/search/${q}`,
    naver: `https://map.naver.com/p/search/${q}`,
  };
}
