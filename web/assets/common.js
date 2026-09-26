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

// ── 캘린더 (.ics) ─────────────────────────────────────────────
// 청약 접수일(특별공급 · 1순위 · 2순위 · 일반 접수)만 넣는다. 발표·계약은 넣지 않는다.
// 하루 종일 일정 + 전날 20시 · 당일 8시 알림. 아이폰 캘린더·구글 캘린더에서 열린다.
const RECEIPT_KINDS = new Set(['special', 'rank1', 'rank2', 'general', 'receipt']);

/** 아직 지나지 않은 청약 접수일 */
export function receiptEvents(n, today = todayStr()) {
  return n.events.filter((e) => RECEIPT_KINDS.has(e.kind) && (e.end ?? e.start) >= today);
}

function icsEscape(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => `\\${m}`);
}
function icsDate(s) {
  return s.replace(/-/g, '');
}

export function buildIcs(notices, pageUrl) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//cheongyak//ko', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  for (const n of notices) {
    for (const ev of receiptEvents(n)) {
      const title = `${ev.label} 접수`;
      lines.push(
        'BEGIN:VEVENT',
        `UID:${n.key}-${ev.id}@cheongyak`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${icsDate(ev.start)}`,
        `DTEND;VALUE=DATE:${icsDate(addDays(ev.end ?? ev.start, 1))}`,
        `SUMMARY:${icsEscape(`[청약] ${n.name} ${title}`)}`,
        `DESCRIPTION:${icsEscape(`${typeLabel(n)} · ${n.region}\n${pageUrl ? pageUrl(n) : ''}`)}`,
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${icsEscape(`내일 ${title} · ${n.name}`)}`,
        'TRIGGER:-PT4H',
        'END:VALARM',
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${icsEscape(`오늘 ${title} · ${n.name}`)}`,
        'TRIGGER:PT8H',
        'END:VALARM',
        'END:VEVENT'
      );
    }
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/** 구글 캘린더 '일정 만들기' 화면을 내용이 채워진 채로 연다 (하루 종일 일정) */
export function googleCalendarUrl(n, ev, pageUrl) {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `[청약] ${n.name} ${ev.label} 접수`,
    dates: `${icsDate(ev.start)}/${icsDate(addDays(ev.end ?? ev.start, 1))}`,
    details: `${typeLabel(n)} · ${n.region}${pageUrl ? `\n${pageUrl(n)}` : ''}`,
    ctz: 'Asia/Seoul',
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

/**
 * 캘린더 고르기 창. 구글은 일정마다 링크, 네이버·아이폰·삼성은 .ics 파일.
 * icsHref(정적 파일 주소)나 onDownload(파일 만들어 내려받기) 중 하나를 준다.
 */
export function openCalendarSheet({ notices, icsHref, onDownload, pageUrl }) {
  const rows = notices.flatMap((n) => receiptEvents(n).map((ev) => ({ n, ev })));
  const multi = notices.length > 1;
  const fileButton = icsHref
    ? `<a class="btn secondary" href="${esc(icsHref)}" download>${icon.calendar()}캘린더 파일 받기</a>`
    : `<button class="btn secondary" data-ics-download>${icon.calendar()}캘린더 파일 받기</button>`;

  const dlg = document.createElement('dialog');
  dlg.className = 'sheet';
  dlg.innerHTML = `
    <div class="sheet-head">
      <b>어느 캘린더에 넣을까요?</b>
      <button class="icon-btn" data-close aria-label="닫기">${icon.close()}</button>
    </div>
    <p class="hint" style="margin-top:0">남은 청약 접수일(특별공급 · 1순위 · 2순위 등)만 넣어요. 발표·계약일은 넣지 않아요.</p>
    ${
      rows.length === 0
        ? '<p class="sheet-empty">남은 청약 접수일이 없어요.</p>'
        : `
    <section class="sheet-sec">
      <h3>구글 캘린더</h3>
      <p class="hint">일정마다 눌러서 저장해 주세요. 알림은 구글 캘린더의 기본 알림 설정을 따라요.</p>
      <div class="cal-links">
        ${rows
          .map(
            ({ n, ev }) => `<a class="cal-link" href="${esc(googleCalendarUrl(n, ev, pageUrl))}" target="_blank" rel="noopener">
              <span class="cal-what">${multi ? `${esc(n.name)} · ` : ''}${esc(ev.label)}</span>
              <span class="cal-date">${esc(rangeLabel(ev.start, ev.end))} 추가</span>
            </a>`
          )
          .join('')}
      </div>
    </section>
    <section class="sheet-sec">
      <h3>네이버 캘린더</h3>
      <p class="hint">캘린더 파일을 받은 뒤, PC에서 네이버 캘린더 → 환경설정 → 알림설정 → 외부일정 <b>가져오기</b>로 올리면 들어가요.</p>
      ${fileButton}
    </section>
    <section class="sheet-sec">
      <h3>아이폰 · 삼성 캘린더</h3>
      <p class="hint">파일을 열면 일정이 한 번에 들어가요. 접수 전날 20시, 당일 8시 알림도 같이 들어가요.</p>
      ${fileButton}
    </section>`
    }`;

  dlg.addEventListener('click', (e) => {
    if (e.target === dlg || e.target.closest('[data-close]')) dlg.close();
    else if (e.target.closest('[data-ics-download]')) onDownload?.();
  });
  dlg.addEventListener('close', () => dlg.remove());
  document.body.appendChild(dlg);
  dlg.showModal();
}

export function downloadFile(filename, text, type = 'text/calendar;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  close: () => `<svg viewBox="0 0 24 24" class="ic" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>`,
  search: () => `<svg viewBox="0 0 24 24" class="ic" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>`,
  calendar: () =>
    `<svg viewBox="0 0 24 24" class="ic" aria-hidden="true"><rect x="4" y="5.5" width="16" height="14.5" rx="2.5" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></svg>`,
  doc: () =>
    `<svg viewBox="0 0 24 24" class="ic" aria-hidden="true"><path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10.5a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5z" /><path d="M14 3.5V8h4M9 12.5h6M9 16h6" /></svg>`,
  globe: () =>
    `<svg viewBox="0 0 24 24" class="ic" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z" /></svg>`,
  home: () =>
    `<svg viewBox="0 0 24 24" class="ic" aria-hidden="true"><path d="M4 10.5L12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" /></svg>`,
  sliders: () =>
    `<svg viewBox="0 0 24 24" class="ic" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2.2" /><circle cx="9" cy="17" r="2.2" /></svg>`,
  inbox: () =>
    `<svg viewBox="0 0 24 24" class="ic" aria-hidden="true"><path d="M4 13.5l2.3-7.2A1.5 1.5 0 0 1 7.7 5.3h8.6a1.5 1.5 0 0 1 1.4 1l2.3 7.2V18a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18z" /><path d="M4 13.5h4.5l1.2 2h4.6l1.2-2H20" /></svg>`,
};

/** 공고 카드 (목록·찜 공용). href 는 상세 페이지 경로 */
export function noticeCard(n, { favorite, isNew, href }) {
  const today = todayStr();
  const status = noticeStatus(n, today);
  const next = nextEvent(n, today);
  const days = next ? diffDays(next.start, today) : null;
  const ongoing = next && next.start <= today;
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
      ${next ? `<span class="dday${urgent ? ' urgent' : ''}">${ongoing ? '진행중' : dDayLabel(next.start, today)}</span>` : ''}
    </div>
  </a>`;
}
