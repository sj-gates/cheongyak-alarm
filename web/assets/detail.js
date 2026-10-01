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
  const html = placesHtml(notice, '../#/settings');
  if (html) document.getElementById('places-slot').innerHTML = `<div class="section-title">내 장소까지</div><div class="card tight">${html}</div>`;
}

// 접힌 일정 옆에 다음 접수 일정 (예: "1순위 D-18")
{
  const hint = document.querySelector('.tl-more .tl-next');
  const next = [...document.querySelectorAll('.tl-more .tl-row')].find((r) => isReceipt({ kind: r.dataset.kind }) && r.dataset.end >= today);
  if (hint && next) hint.textContent = `${next.querySelector('.tl-title span').textContent} ${next.querySelector('.tl-dday').textContent}`;
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

