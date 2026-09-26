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

/** 웹 사이트 주소. 앱의 지도 미리보기도 이 사이트의 map.html 을 띄운다 (도메인을 바꾸면 같이 바꾼다). */
export const WEB_BASE = 'https://sj-gates.github.io/cheongyak-alarm';

/**
 * 지도: 미리보기 페이지(web/map.html — 카카오맵, 키가 없으면 구글 지도)와 누르면 여는 카카오맵 주소.
 * mapPage 는 사이트 루트 기준 상대 경로라, 웹은 앞에 "../", 앱은 WEB_BASE 를 붙여 쓴다.
 */
export function mapLinks(address: string, name = '') {
  const { query, approximate } = mapQuery(address);
  const q = encodeURIComponent(query);
  return {
    query,
    approximate,
    mapPage: `map.html?q=${q}&name=${encodeURIComponent(name)}${approximate ? '&approx=1' : ''}`,
    kakao: `https://map.kakao.com/link/search/${q}`,
  };
}
