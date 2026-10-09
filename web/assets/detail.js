// 공고 상세 페이지: 날짜에 따라 바뀌는 부분(D-day, 상태)과 찜 버튼만 브라우저에서 채운다.
import {
  APPLY_HOURS,
  STATUS_COLOR,
  STATUS_LABEL,
  activeReceipt,
  applyUrl,
  badge,
  dDayLabel,
  esc,
  icon,
  isFavorite,
  isReceipt,
  noticeStatus,
  placesHtml,
  fillRoutes,
  adHtml,
  fillAds,
  loadAnalytics,
  shortDate,
  todayStr,
  toggleFavorite,
} from './common.js';
import { registerServiceWorker, syncSubscription } from './push.js';

const notice = JSON.parse(document.getElementById('notice-data').textContent);
const today = todayStr();

for (const i of document.querySelectorAll('[data-icon]')) i.outerHTML = icon[i.dataset.icon](false);

const status = noticeStatus(notice, today);
document.getElementById('status-badge').outerHTML = badge(STATUS_LABEL[status], STATUS_COLOR[status]);

// D-day 는 청약 접수 일정에만. 모집공고·발표·계약은 참고로 흐리게
for (const row of document.querySelectorAll('.tl-row')) {
  const { start, end, kind } = row.dataset;
  const receipt = isReceipt({ kind });
  const past = end < today;
  const active = receipt && start <= today && today <= end;
  row.classList.toggle('past', past);
  row.classList.toggle('active', active);
  row.classList.toggle('ref', !receipt && !past);
  row.querySelector('.tl-dday').textContent = past ? '' : !receipt ? '참고' : active ? '진행중' : dDayLabel(start, today);
}

// 내 장소(직장·본가)까지: 등록돼 있으면 거리·시간, 없으면 등록 안내
{
  const html = placesHtml(notice, '../#/settings', { commute: false });
  const slot = document.getElementById('places-slot');
  if (html) {
    slot.innerHTML = `<div class="section-title">내 장소까지</div><div class="card tight">${html}</div>`;
    fillRoutes(slot, notice);
  }
}

// 접힌 일정 머리줄: 지금 챙길 일정 (다음 청약 접수 → 없으면 다음 일정 → 다 끝났으면 안내)
{
  const now = document.querySelector('.tl-more .tl-now');
  const tag = document.querySelector('.tl-more .tl-next');
  const rows = [...document.querySelectorAll('.tl-more .tl-row')];
  if (now && rows.length) {
    const upcoming = (r) => r.dataset.end >= today;
    const receipt = rows.find((r) => isReceipt({ kind: r.dataset.kind }) && upcoming(r));
    const pick = receipt ?? rows.find(upcoming);
    const titleOf = (r) => r.querySelector('.tl-title span').textContent;
    const dateOf = (r) => r.querySelector('.tl-date').textContent;
    const set = (title, date) => {
      now.innerHTML = '<b></b><small></small>';
      now.querySelector('b').textContent = title;
      now.querySelector('small').textContent = date;
    };
    if (pick) {
      set(titleOf(pick), dateOf(pick));
      tag.textContent = receipt ? receipt.querySelector('.tl-dday').textContent : '접수 끝 · 참고';
      tag.classList.toggle('ref', !receipt);
    } else {
      const last = rows[rows.length - 1];
      set('모든 일정이 끝났어요', `마지막 ${titleOf(last)} ${dateOf(last)}`);
    }
  }
}

// 방문 통계 · 광고 (config.js 에 값이 있을 때만)
loadAnalytics();
{
  const slot = document.getElementById('ad-slot');
  const ad = adHtml('detail');
  if (slot && ad) {
    slot.innerHTML = ad;
    fillAds(slot);
  }
}

// 오늘이 청약 접수일이면 청약홈으로 가는 버튼
const receipt = activeReceipt(notice, today);
if (receipt) {
  document.getElementById('apply-slot').innerHTML = `
    <a class="btn apply" href="${applyUrl(notice.category, receipt.kind)}" target="_blank" rel="noopener">청약 접수하러 가기</a>
    <p class="note">오늘 ${esc(receipt.label)} 접수${receipt.end ? ` (${shortDate(receipt.end)}까지)` : ''} · 청약홈 ${APPLY_HOURS}</p>`;
}

const favTop = document.getElementById('fav-top');
const favMain = document.getElementById('fav-main');
function paintFavorite() {
  const on = isFavorite(notice.key);
  favTop.innerHTML = icon.star(on);
  favTop.setAttribute('aria-label', on ? '찜 해제' : '찜하기');
  favMain.innerHTML = `${icon.star(on)}${on ? '찜한 공고' : '찜하기'}`;
  favMain.className = `btn ${on ? 'secondary' : 'primary'}`;
}
for (const b of [favTop, favMain]) {
  b.addEventListener('click', () => {
    toggleFavorite(notice);
    paintFavorite();
    syncSubscription().catch(() => {});
  });
}
paintFavorite();
registerServiceWorker();

