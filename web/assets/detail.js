// 공고 상세 페이지: 날짜에 따라 바뀌는 부분(D-day, 상태)과 찜 버튼만 브라우저에서 채운다.
import { STATUS_COLOR, STATUS_LABEL, badge, dDayLabel, icon, isFavorite, noticeStatus, todayStr, toggleFavorite } from './common.js';

const notice = JSON.parse(document.getElementById('notice-data').textContent);
const today = todayStr();

for (const i of document.querySelectorAll('[data-icon]')) i.outerHTML = icon[i.dataset.icon](false);

const status = noticeStatus(notice, today);
document.getElementById('status-badge').outerHTML = badge(STATUS_LABEL[status], STATUS_COLOR[status]);

for (const row of document.querySelectorAll('.tl-row')) {
  const { start, end } = row.dataset;
  const past = end < today;
  const active = start <= today && today <= end;
  row.classList.toggle('past', past);
  row.classList.toggle('active', active);
  row.querySelector('.tl-dday').textContent = past ? '' : active ? '진행중' : dDayLabel(start, today);
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
  });
}
paintFavorite();
