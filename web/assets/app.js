import {
  STATUS_LABEL,
  esc,
  getFavorites,
  icon,
  noticeCard,
  noticeStatus,
  refreshFavorites,
  settingsStore,
  sortNotices,
  timeAgo,
  todayApplyCard,
  toggleFavorite,
  todayStr,
} from './common.js';

const DEFAULT_SETTINGS = {
  kinds: ['APT_PRIVATE', 'APT_PUBLIC', 'APT_NEWLYWED', 'APT_PRESALE', 'REMNDR', 'RESUPPLY'],
  regions: ['서울', '경기', '부산'],
};
const NEW_WINDOW_MS = 48 * 60 * 60 * 1000;
const STATUS_FILTERS = ['all', 'open', 'upcoming', 'waiting', 'closed'];
const TITLES = { list: '청약 공고', fav: '찜한 공고', settings: '설정' };

const view = document.getElementById('view');
const titleEl = document.getElementById('title');

let data = null; // { updatedAt, kinds, groups, regions, notices }
let settings = settingsStore.read(DEFAULT_SETTINGS);
// 목록 필터는 상세 페이지에 다녀와도 남도록 세션에 둔다
const listState = Object.assign(
  { query: '', region: 'mine', kind: 'all', status: 'all' },
  JSON.parse(sessionStorage.getItem('cy.list') || '{}')
);
const saveListState = () => sessionStorage.setItem('cy.list', JSON.stringify(listState));

const href = (n) => `n/${encodeURIComponent(n.key)}.html`;
const isNew = (n) => n.firstSeen > Date.now() - NEW_WINDOW_MS;
const kindShort = (id) => data.kinds.find((k) => k.id === id)?.short ?? id;
const myPool = () => data.notices.filter((n) => settings.kinds.includes(n.kind));

function inRegion(n, tab) {
  if (tab === 'nation') return true;
  if (tab === 'mine') return settings.regions.length === 0 || settings.regions.includes(n.region);
  return n.region === tab;
}

// ── 탭 전환 ───────────────────────────────────────────────────
function currentTab() {
  const h = location.hash.replace(/^#\/?/, '');
  return TITLES[h] ? h : 'list';
}

function render() {
  if (!data) return;
  const tab = currentTab();
  titleEl.textContent = TITLES[tab];
  document.title = tab === 'list' ? '청약알림 — 서울·경기·부산 청약 일정과 분양가 한눈에' : `${TITLES[tab]} | 청약알림`;
  for (const a of document.querySelectorAll('.tabbar a')) a.classList.toggle('on', a.dataset.tab === tab);
  updateFavCount();
  ({ list: renderList, fav: renderFav, settings: renderSettings })[tab]();
}

function updateFavCount() {
  const n = Object.keys(getFavorites()).length;
  const el = document.getElementById('fav-count');
  el.hidden = n === 0;
  el.textContent = n;
}

// ── 공고 목록 ─────────────────────────────────────────────────
function renderList() {
  view.innerHTML = `
    ${todayApplyCard(Object.values(getFavorites()), href)}
    <label class="search">${icon.search()}<input id="q" type="search" placeholder="단지명, 주소, 시공사 검색" value="${esc(listState.query)}" autocomplete="off"></label>
    <div id="list-body"></div>`;
  view.querySelector('#q').addEventListener('input', (e) => {
    listState.query = e.target.value;
    saveListState();
    renderListBody();
  });
  renderListBody();
  const y = Number(sessionStorage.getItem('cy.scroll') || 0);
  if (y) requestAnimationFrame(() => window.scrollTo(0, y));
  sessionStorage.removeItem('cy.scroll');
}

function renderListBody() {
  const today = todayStr();
  const pool = myPool();

  const tabs = [];
  if (settings.regions.length > 1) tabs.push({ id: 'mine', label: '전체' });
  for (const r of settings.regions) tabs.push({ id: r, label: r });
  tabs.push({ id: 'nation', label: '전국' });
  for (const t of tabs) t.count = pool.filter((n) => inRegion(n, t.id)).length;
  const region = tabs.some((t) => t.id === listState.region) ? listState.region : tabs[0].id;

  const regionPool = pool.filter((n) => inRegion(n, region));
  const kindChips = settings.kinds.filter((k) => regionPool.some((n) => n.kind === k));
  const kind = kindChips.includes(listState.kind) ? listState.kind : 'all';
  const kindPool = kind === 'all' ? regionPool : regionPool.filter((n) => n.kind === kind);

  const counts = { all: kindPool.length, open: 0, upcoming: 0, waiting: 0, closed: 0 };
  for (const n of kindPool) counts[noticeStatus(n, today)]++;

  const q = listState.query.trim();
  const list = sortNotices(
    kindPool.filter(
      (n) =>
        (listState.status === 'all' || noticeStatus(n, today) === listState.status) &&
        (!q || `${n.name} ${n.address} ${n.builder ?? ''}`.includes(q))
    ),
    today
  );
  const favs = getFavorites();

  document.getElementById('list-body').innerHTML = `
    <div class="region-tabs" role="tablist">
      ${tabs.map((t) => `<button role="tab" data-region="${esc(t.id)}" class="${t.id === region ? 'on' : ''}" aria-selected="${t.id === region}">${esc(t.label)} <span class="cnt">${t.count}</span></button>`).join('')}
    </div>
    ${
      kindChips.length > 1
        ? `<div class="chips">
            <button class="chip ${kind === 'all' ? 'on' : ''}" data-kind="all">전체 종류</button>
            ${kindChips.map((k) => `<button class="chip ${k === kind ? 'on' : ''}" data-kind="${k}">${esc(kindShort(k))}</button>`).join('')}
          </div>`
        : '<div style="height:12px"></div>'
    }
    <div class="segment">
      ${STATUS_FILTERS.map((s) => `<button data-status="${s}" class="${s === listState.status ? 'on' : ''}">${s === 'all' ? '전체' : STATUS_LABEL[s]} ${counts[s]}</button>`).join('')}
    </div>
    <p class="updated">${timeAgo(data.updatedAt)} 업데이트 · 3시간마다 새로 받아와요</p>
    ${
      list.length
        ? list.map((n) => noticeCard(n, { favorite: !!favs[n.key], isNew: isNew(n), href: href(n) })).join('')
        : emptyState(
            icon.inbox(),
            '조건에 맞는 공고가 없어요',
            region === 'nation' ? '설정에서 받아볼 공고 종류를 더 골라 보세요.' : '위의 "전국" 탭에서 다른 지역 공고도 볼 수 있어요.'
          )
    }`;
}

function emptyState(ic, title, body) {
  return `<div class="empty"><div class="empty-icon">${ic}</div><h2>${esc(title)}</h2>${body ? `<p>${esc(body)}</p>` : ''}</div>`;
}

// ── 찜 ───────────────────────────────────────────────────────
function renderFav() {
  const today = todayStr();
  const favs = sortNotices(Object.values(getFavorites()), today);
  if (!favs.length) {
    view.innerHTML = emptyState(
      icon.star(false),
      '찜한 공고가 없어요',
      '공고 목록에서 ☆ 를 누르면 여기에 모아 드려요.'
    );
    return;
  }

  view.innerHTML = `
    ${todayApplyCard(favs, href)}
    <div class="section-title">찜한 공고 ${favs.length}</div>
    ${favs.map((n) => noticeCard(n, { favorite: true, isNew: false, href: href(n) })).join('')}`;

}

// ── 설정 ─────────────────────────────────────────────────────
function saveSettings() {
  settingsStore.write(settings);
  renderSettings();
  updateFavCount();
}

function renderSettings() {
  const kindLabel = (id) => data.kinds.find((k) => k.id === id)?.label ?? id;
  view.innerHTML = `
    <div class="section-title" style="margin-top:4px">받아볼 공고 종류</div>
    <div class="card">
      ${data.groups
        .map((g) => {
          const allOn = g.kinds.every((k) => settings.kinds.includes(k));
          return `
          <div class="group">
            <div class="group-head"><b>${esc(g.title)}</b><button data-group="${esc(g.title)}">${allOn ? '모두 끄기' : '모두 켜기'}</button></div>
            <div class="chips wrap">
              ${g.kinds.map((k) => `<button class="chip ${settings.kinds.includes(k) ? 'on' : ''}" data-set-kind="${k}">${esc(kindLabel(k))}</button>`).join('')}
            </div>
          </div>`;
        })
        .join('')}
      <p class="hint">고른 종류만 목록에 보여요.</p>
    </div>

    <div class="section-title">관심 지역 <button class="link" data-regions-clear>전국으로</button></div>
    <div class="card">
      <div class="chips wrap">
        ${data.regions.map((r) => `<button class="chip ${settings.regions.includes(r) ? 'on' : ''}" data-set-region="${esc(r)}">${esc(r)}</button>`).join('')}
      </div>
      <p class="hint">${
        settings.regions.length
          ? `공고 목록 위에 ${settings.regions.map(esc).join(' · ')} 탭이 생겨요. 고른 순서대로 보여요.`
          : '지역을 고르지 않으면 전국 공고를 한 번에 보여요.'
      }</p>
    </div>

    <div class="section-title">알림 받기</div>
    <div class="card">
      <p class="info-line"><b>새 공고 소식</b> — RSS 리더에 <a href="feed.xml">새 공고 피드</a>를 등록하면 새로 올라온 공고를 받아볼 수 있어요.</p>
    </div>

    <div class="section-title">정보</div>
    <div class="card">
      <p class="info-line">자료: 한국부동산원 청약홈 분양정보 · 경쟁률 조회 서비스 (공공데이터포털). ${timeAgo(data.updatedAt)} 업데이트, 3시간마다 새로 받아와요.</p>
      <p class="info-line">찜과 설정은 이 브라우저에만 저장되고 어디로도 보내지 않아요.</p>
      <p class="info-line">청약 전에는 반드시 청약홈의 모집공고문 원문을 확인하세요.</p>
    </div>`;
}

// ── 이벤트 (위임) ─────────────────────────────────────────────
view.addEventListener('click', (e) => {
  const t = e.target.closest('button, a');
  if (!t) return;
  const d = t.dataset;

  if (d.fav) {
    e.preventDefault();
    e.stopPropagation();
    const n = data.notices.find((x) => x.key === d.fav) ?? getFavorites()[d.fav];
    if (!n) return;
    const on = toggleFavorite(n);
    t.outerHTML = `<button class="star-btn" data-fav="${esc(n.key)}" aria-label="${on ? '찜 해제' : '찜하기'}" aria-pressed="${on}">${icon.star(on)}</button>`;
    updateFavCount();
    if (currentTab() === 'fav') renderFav();
    return;
  }
  if (t.matches('a.notice-card')) sessionStorage.setItem('cy.scroll', String(window.scrollY));

  if (d.region !== undefined) {
    listState.region = d.region;
    listState.kind = 'all';
  } else if (d.kind !== undefined) listState.kind = d.kind;
  else if (d.status !== undefined) listState.status = d.status;
  if (d.region !== undefined || d.kind !== undefined || d.status !== undefined) {
    saveListState();
    renderListBody();
    return;
  }

  if (d.setKind) {
    settings.kinds = settings.kinds.includes(d.setKind) ? settings.kinds.filter((k) => k !== d.setKind) : [...settings.kinds, d.setKind];
    saveSettings();
  } else if (d.group) {
    const g = data.groups.find((x) => x.title === d.group);
    const allOn = g.kinds.every((k) => settings.kinds.includes(k));
    settings.kinds = allOn ? settings.kinds.filter((k) => !g.kinds.includes(k)) : [...new Set([...settings.kinds, ...g.kinds])];
    saveSettings();
  } else if (d.setRegion) {
    settings.regions = settings.regions.includes(d.setRegion) ? settings.regions.filter((r) => r !== d.setRegion) : [...settings.regions, d.setRegion];
    saveSettings();
  } else if (d.regionsClear !== undefined) {
    settings.regions = [];
    saveSettings();
  }
});

window.addEventListener('hashchange', () => {
  window.scrollTo(0, 0);
  render();
});

// ── 시작 ─────────────────────────────────────────────────────
for (const i of document.querySelectorAll('.tabbar [data-icon]')) {
  i.outerHTML = icon[i.dataset.icon](false);
}

fetch('data/notices.json', { cache: 'no-cache' })
  .then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  })
  .then((json) => {
    data = json;
    refreshFavorites(data.notices);
    render();
  })
  .catch(() => {
    view.innerHTML = emptyState(icon.inbox(), '공고를 불러오지 못했어요', '잠시 뒤 새로고침해 주세요.');
  });

