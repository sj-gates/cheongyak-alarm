// 목록(index)과 공고 상세(n/*.html)가 같이 쓰는 도구 모음.
// 앱(src/lib)의 dates·filters 와 같은 규칙을 브라우저용으로 옮긴 것.

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

// ── 날짜 ──────────────────────────────────────────────────────
export function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function todayStr() {
  return toDateStr(new Date());
}
export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}
export function diffDays(a, b) {
  return Math.round((parseDate(a) - parseDate(b)) / 86400000);
}
export function dDayLabel(target, today = todayStr()) {
  const diff = diffDays(target, today);
  if (diff === 0) return 'D-day';
  return diff > 0 ? `D-${diff}` : `D+${-diff}`;
}
export function shortDate(s) {
  if (!s) return '-';
  const d = parseDate(s);
  return `${d.getMonth() + 1}.${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
}
export function longDate(s) {
  const d = parseDate(s);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAYS[d.getDay()]}요일`;
}
export function rangeLabel(start, end) {
  if (!start) return '-';
  if (!end || end === start) return shortDate(start);
  return `${shortDate(start)} ~ ${shortDate(end)}`;
}
export function timeAgo(ts) {
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const hour = Math.round(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  return `${Math.round(hour / 24)}일 전`;
}

// ── 공고 상태 ─────────────────────────────────────────────────
export const STATUS_LABEL = { open: '접수중', upcoming: '접수예정', waiting: '발표대기', closed: '마감' };
export const STATUS_COLOR = { open: '#12A150', upcoming: '#2F6BFF', waiting: '#8E4EC6', closed: '#8A94A6' };
export const CATEGORY_COLOR = {
  APT: '#2F6BFF',
  REMNDR: '#E5484D',
  RESUPPLY: '#E8590C',
  URBTY: '#8E4EC6',
  PBLPVT: '#0E9F8E',
  OPT: '#B7791F',
};

export function noticeStatus(n, today = todayStr()) {
  if (n.receiptStart && today < n.receiptStart) return 'upcoming';
  if (n.receiptEnd && today <= n.receiptEnd) return 'open';
  if (!n.receiptStart && n.announceDate && today < n.announceDate) return 'upcoming';
  if (n.winnerDate && today <= n.winnerDate) return 'waiting';
  return 'closed';
}

export function nextEvent(n, today = todayStr()) {
  return n.events.find((e) => e.kind !== 'announce' && (e.end ?? e.start) >= today);
}

/** 청약 접수 일정 (특별공급·1순위·2순위·접수). D-day 는 이것만 센다 */
export const isReceipt = (e) => ['special', 'rank1', 'rank2', 'general', 'receipt'].includes(e.kind);

/** 아직 남은 첫 청약 접수 일정 */
export function nextReceipt(n, today = todayStr()) {
  return n.events.find((e) => isReceipt(e) && (e.end ?? e.start) >= today);
}

const STATUS_RANK = { open: 0, upcoming: 1, waiting: 2, closed: 3 };

/** 접수중(마감 임박순) → 접수예정(시작 임박순) → 발표대기 → 마감(최근 공고순) */
export function sortNotices(list, today = todayStr()) {
  return list
    .map((n) => ({ n, s: noticeStatus(n, today) }))
    .sort((a, b) => {
      const r = STATUS_RANK[a.s] - STATUS_RANK[b.s];
      if (r) return r;
      const key = {
        open: (x) => x.receiptEnd ?? '',
        upcoming: (x) => x.receiptStart ?? x.announceDate ?? '',
        waiting: (x) => x.winnerDate ?? '',
      }[a.s];
      if (key) return key(a.n).localeCompare(key(b.n));
      return (b.n.announceDate ?? '').localeCompare(a.n.announceDate ?? '');
    })
    .map((x) => x.n);
}

export function typeLabel(n, sep = ' · ') {
  return n.category === 'APT' ? `APT${sep}${n.typeName}` : n.typeName;
}

// ── 찜 (이 브라우저에만 저장) ──────────────────────────────────
const FAV_KEY = 'cy.favorites';

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 저장 못 해도 화면은 동작 */
  }
}

/** 찜 목록: 공고 key → 공고 요약 (목록 데이터에서 빠져도 일정은 남도록 통째로 저장) */
export function getFavorites() {
  return readJson(FAV_KEY, {});
}
export function isFavorite(key) {
  return !!getFavorites()[key];
}
export function toggleFavorite(notice) {
  const favs = getFavorites();
  const on = !favs[notice.key];
  if (on) favs[notice.key] = snapshot(notice);
  else delete favs[notice.key];
  writeJson(FAV_KEY, favs);
  return on;
}
/** 목록 데이터가 새로 오면 찜한 공고 일정도 새 내용으로 */
export function refreshFavorites(notices) {
  const favs = getFavorites();
  let changed = false;
  for (const n of notices) {
    if (favs[n.key]) {
      favs[n.key] = snapshot(n);
      changed = true;
    }
  }
  if (changed) writeJson(FAV_KEY, favs);
}
function snapshot(n) {
  const { key, category, kind, name, typeName, region, address, totalUnits, announceDate, receiptStart, receiptEnd, winnerDate, events } = n;
  return { key, category, kind, name, typeName, region, address, totalUnits, announceDate, receiptStart, receiptEnd, winnerDate, events };
}

export const settingsStore = {
  read(defaults) {
    return { ...defaults, ...readJson('cy.settings', {}) };
  },
  write(value) {
    writeJson('cy.settings', value);
  },
};

/**
 * 설정 기본값. 공고 종류·지역은 목록 필터이자 새 공고 알림 조건이고,
 * 알림을 켜면 알림 조건(종류·지역·최대 분양가·면적)이 알림 서버(Firebase)에도 저장된다.
 */
export const DEFAULT_SETTINGS = {
  kinds: ['APT_PRIVATE', 'APT_PUBLIC', 'APT_NEWLYWED', 'APT_PRESALE', 'REMNDR', 'RESUPPLY'],
  regions: ['서울', '경기', '부산'],
  newNotice: true, // 조건에 맞는 새 공고 알림
  maxPrice: 0, // 만원, 0 = 제한 없음
  area: 'all', // all · small(60㎡ 이하) · mid(60~85㎡) · large(85㎡ 초과)
};
export const readSettings = () => settingsStore.read(DEFAULT_SETTINGS);

export const PRICE_OPTIONS = [
  [0, '제한 없음'],
  [50000, '5억 이하'],
  [70000, '7억 이하'],
  [100000, '10억 이하'],
  [150000, '15억 이하'],
];
export const AREA_OPTIONS = [
  ['all', '전체'],
  ['small', '60㎡ 이하'],
  ['mid', '60~85㎡'],
  ['large', '85㎡ 초과'],
];

// ── 청약 접수일 ───────────────────────────────────────────────
const RECEIPT_KINDS = new Set(['special', 'rank1', 'rank2', 'general', 'receipt']);

/** 오늘 진행 중인 청약 접수 일정 */
export function activeReceipt(n, today = todayStr()) {
  return n.events.find((e) => RECEIPT_KINDS.has(e.kind) && e.start <= today && today <= (e.end ?? e.start));
}

export const APPLY_HOURS = '09:00~17:30';
const APPLYHOME = 'https://www.applyhome.co.kr';

/** 청약홈 청약신청 화면 (앱 src/lib/applyhome.ts 와 같은 규칙) */
export function applyUrl(category, kind) {
  const apt = `${APPLYHOME}/ap/aph/reqst/selectSubscrtReqstAptMainView.do`;
  switch (category) {
    case 'APT':
      return kind === 'special' ? apt : `${apt}?se=01&ty=10`;
    case 'REMNDR':
      return `${apt}?se=04&ty=10`;
    case 'RESUPPLY':
      return `${apt}?se=06&ty=20`;
    case 'OPT':
      return `${apt}?se=11&ty=10`;
    case 'URBTY':
      return `${APPLYHOME}/ap/apb/reqst/selectSubscrtReqstUOMainView.do`;
    default:
      return `${APPLYHOME}/ap/apc/reqst/selectSubscrtReqstPRMainView.do`;
  }
}

/** 찜한 공고 중 오늘 접수하는 것들 → "청약 접수하러 가기" 카드 */
export function todayApplyCard(favs, href) {
  const list = favs.map((n) => ({ n, ev: activeReceipt(n) })).filter((x) => x.ev);
  if (!list.length) return '';
  return `
  <div class="apply-card">
    <div class="apply-head">오늘 청약 접수 ${list.length}건 <span>청약홈 ${APPLY_HOURS}</span></div>
    ${list
      .map(
        ({ n, ev }) => `
      <div class="apply-row">
        <a class="apply-name" href="${href(n)}"><b>${esc(n.name)}</b><span>${esc(ev.label)} 접수${ev.end ? ` · ${shortDate(ev.end)}까지` : ''}</span></a>
        <a class="btn apply small" href="${applyUrl(n.category, ev.kind)}" target="_blank" rel="noopener">청약하러 가기</a>
      </div>`
      )
      .join('')}
  </div>`;
}

// ── 화면 도구 ─────────────────────────────────────────────────
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function badge(label, color, solid = false) {
  return `<span class="badge${solid ? ' solid' : ''}" style="--c:${color}">${esc(label)}</span>`;
}

export const icon = {
  star: (on) =>
    `<svg viewBox="0 0 24 24" class="ic${on ? ' star-on' : ''}" aria-hidden="true"><path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z" /></svg>`,
  back: () => `<svg viewBox="0 0 24 24" class="ic" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>`,
  search: () => `<svg viewBox="0 0 24 24" class="ic" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>`,
  doc: () =>
    `<svg viewBox="0 0 24 24" class="ic" aria-hidden="true"><path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10.5a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5z" /><path d="M14 3.5V8h4M9 12.5h6M9 16h6" /></svg>`,
  globe: () =>
    `<svg viewBox="0 0 24 24" class="ic" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z" /></svg>`,
  home: () =>
    `<svg viewBox="0 0 24 24" class="ic" aria-hidden="true"><path d="M4 10.5L12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" /></svg>`,
  sliders: () =>
    `<svg viewBox="0 0 24 24" class="ic" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2.2" /><circle cx="9" cy="17" r="2.2" /></svg>`,
  chart: () => `<svg viewBox="0 0 24 24" class="ic" aria-hidden="true"><path d="M5 19.5V11M12 19.5V5M19 19.5v-6" /></svg>`,
  train: () => `<svg viewBox="0 0 24 24" class="ic" aria-hidden="true"><rect x="6" y="3.5" width="12" height="13" rx="3" /><path d="M6 10.5h12M9 20.5l1.5-4M15 20.5l-1.5-4" /></svg>`,
  school: () => `<svg viewBox="0 0 24 24" class="ic" aria-hidden="true"><path d="M3 9.5L12 5l9 4.5-9 4.5z" /><path d="M7 11.5v4c0 1.5 2.2 3 5 3s5-1.5 5-3v-4" /></svg>`,
  book: () => `<svg viewBox="0 0 24 24" class="ic" aria-hidden="true"><path d="M4 5.5c2.5-1 5.5-1 8 .5 2.5-1.5 5.5-1.5 8-.5v13c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5z" /><path d="M12 6v13" /></svg>`,
  cart: () => `<svg viewBox="0 0 24 24" class="ic" aria-hidden="true"><path d="M3.5 4.5h2l2 10h10l2-7H7" /><circle cx="9.5" cy="18.5" r="1.3" /><circle cx="16.5" cy="18.5" r="1.3" /></svg>`,
  price: () => `<svg viewBox="0 0 24 24" class="ic" aria-hidden="true"><path d="M3.5 12.5V4.5a1 1 0 0 1 1-1h8l8 8-9 9z" /><circle cx="8.5" cy="8.5" r="1.5" /></svg>`,
  people: () => `<svg viewBox="0 0 24 24" class="ic" aria-hidden="true"><circle cx="9" cy="8.5" r="3" /><path d="M3.5 19c.5-3 2.8-5 5.5-5s5 2 5.5 5" /><circle cx="17" cy="9.5" r="2.3" /><path d="M16 14.2c2.4.2 4 2 4.5 4.8" /></svg>`,
  wallet: () => `<svg viewBox="0 0 24 24" class="ic" aria-hidden="true"><rect x="3.5" y="6" width="17" height="13" rx="2" /><path d="M3.5 9.5h17M16 14h1.5" /></svg>`,
  flag: () => `<svg viewBox="0 0 24 24" class="ic" aria-hidden="true"><path d="M5 21V4M5 4.5h11l-2 4 2 4H5" /></svg>`,
  calendar: () => `<svg viewBox="0 0 24 24" class="ic" aria-hidden="true"><rect x="4" y="5.5" width="16" height="14.5" rx="2" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></svg>`,
  news: () => `<svg viewBox="0 0 24 24" class="ic" aria-hidden="true"><rect x="3.5" y="5" width="14" height="14.5" rx="1.5" /><path d="M17.5 9h3v9a1.5 1.5 0 0 1-3 0M7 9h7M7 12.5h7M7 16h4" /></svg>`,
  inbox: () =>
    `<svg viewBox="0 0 24 24" class="ic" aria-hidden="true"><path d="M4 13.5l2.3-7.2A1.5 1.5 0 0 1 7.7 5.3h8.6a1.5 1.5 0 0 1 1.4 1l2.3 7.2V18a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18z" /><path d="M4 13.5h4.5l1.2 2h4.6l1.2-2H20" /></svg>`,
};

/** 공고 카드 (목록·찜 공용). href 는 상세 페이지 경로 */
export function noticeCard(n, { favorite, isNew, href }) {
  const today = todayStr();
  const status = noticeStatus(n, today);
  // D-day 는 청약 접수 일정에만. 접수가 끝났으면 발표·계약은 참고로 날짜만 보여 준다
  const receipt = nextReceipt(n, today);
  const next = receipt ?? nextEvent(n, today);
  const days = receipt ? diffDays(receipt.start, today) : null;
  const ongoing = receipt && receipt.start <= today;
  const urgent = days !== null && days <= 1;
  const nextText = next ? `${next.label} ${rangeLabel(next.start, next.end)}` : `접수 ${rangeLabel(n.receiptStart, n.receiptEnd)}`;
  return `
  <a class="notice-card" href="${href}">
    <div class="nc-top">
      <div class="badges">
        ${badge(typeLabel(n), CATEGORY_COLOR[n.category])}
        ${badge(n.region, 'var(--sub)')}
        ${isNew ? badge('NEW', 'var(--accent)', true) : ''}
      </div>
      <button class="star-btn" data-fav="${esc(n.key)}" aria-label="${favorite ? '찜 해제' : '찜하기'}" aria-pressed="${favorite}">${icon.star(favorite)}</button>
    </div>
    <h3 class="nc-name">${esc(n.name)}</h3>
    <p class="nc-meta">${esc(n.address)}${n.totalUnits ? ` · ${n.totalUnits.toLocaleString('ko-KR')}세대` : ''}</p>
    <div class="nc-bottom">
      ${badge(STATUS_LABEL[status], STATUS_COLOR[status])}
      <span class="nc-next">${esc(nextText)}</span>
      ${receipt ? `<span class="dday${urgent ? ' urgent' : ''}">${ongoing ? '진행중' : dDayLabel(receipt.start, today)}</span>` : ''}
    </div>
  </a>`;
}
