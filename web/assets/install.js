// 홈 화면에 앱으로 설치.
//   안드로이드 크롬·삼성 인터넷: 브라우저가 주는 설치 창을 버튼으로 띄운다
//   아이폰 사파리: 설치 창이 없어서 '공유 → 홈 화면에 추가' 를 안내한다
//   카카오톡·네이버 앱 안의 브라우저: 설치가 안 되니 바깥 브라우저로 열게 한다

let deferred = null;
const listeners = new Set();
const notify = () => listeners.forEach((f) => f());

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // 크롬의 작은 설치 띠 대신 우리 버튼으로
  deferred = e;
  notify();
});
window.addEventListener('appinstalled', () => {
  deferred = null;
  notify();
});

const ua = navigator.userAgent;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isKakao = () => /KAKAOTALK/i.test(ua);
const isInApp = () => isKakao() || /NAVER\(inapp|Instagram|FBAN|FBAV|Line\//i.test(ua);
const isMobile = () => isIOS() || /Android/i.test(ua);

/** installed | prompt | ios | inapp | manual */
export function installState() {
  if (isStandalone()) return 'installed';
  if (deferred) return 'prompt';
  if (isInApp()) return 'inapp';
  if (isIOS()) return 'ios';
  return 'manual';
}

export function onInstallChange(f) {
  listeners.add(f);
}

/** 설치 창 띄우기 (설치했으면 true) */
export async function promptInstall() {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  e.prompt();
  const choice = await e.userChoice.catch(() => null);
  notify();
  return choice?.outcome === 'accepted';
}

const HIDE_KEY = 'cy.installHide';
function bannerHidden() {
  try {
    return localStorage.getItem(HIDE_KEY) === '1';
  } catch {
    return false;
  }
}
export function hideBanner() {
  try {
    localStorage.setItem(HIDE_KEY, '1');
  } catch {
    // 저장이 막혀 있으면 이번에만 숨긴다
  }
}

const openOutside = () =>
  isKakao()
    ? `<a class="btn small" href="kakaotalk://web/openExternal?url=${encodeURIComponent(location.href)}">브라우저로 열기</a>`
    : '';

/** 공고 목록 위 띠: 폰에서 아직 설치 안 했을 때만, 닫으면 다시 안 보인다 */
export function installBannerHtml() {
  const state = installState();
  if (bannerHidden() || !isMobile() || state === 'installed' || state === 'manual') return '';
  const body = {
    prompt: '<b>청약알림을 앱으로 설치하세요</b><span>홈 화면에서 바로 열고, 찜한 공고 알림도 받을 수 있어요.</span>',
    ios: '<b>홈 화면에 청약알림 추가하기</b><span>사파리 아래쪽 <b>공유 버튼</b> → <b>홈 화면에 추가</b>를 누르면 앱처럼 쓰고 알림도 받을 수 있어요.</span>',
    inapp: '<b>앱으로 설치하려면 브라우저로 열어 주세요</b><span>카카오톡·네이버 앱 안에서는 설치가 안 돼요. 크롬이나 사파리로 열어 주세요.</span>',
  }[state];
  const action = state === 'prompt' ? '<button class="btn small primary" data-install>설치</button>' : state === 'inapp' ? openOutside() : '';
  return `
    <div class="install-card">
      <img src="icons/icon-192.png" alt="" width="40" height="40">
      <p>${body}</p>
      ${action}
      <button class="install-close" data-install-hide aria-label="닫기">×</button>
    </div>`;
}

/** 설정 화면 카드: 언제나 보이고, 상황에 맞는 방법을 알려 준다 */
export function installCardHtml() {
  const state = installState();
  const text = {
    installed: '홈 화면 앱으로 쓰고 있어요. 앱 아이콘을 길게 누르면 찜 · 분석으로 바로 갈 수 있어요.',
    prompt: '홈 화면에 청약알림 아이콘이 생기고, 주소창 없이 앱처럼 열려요.',
    ios: '사파리 아래쪽 <b>공유 버튼</b> → <b>홈 화면에 추가</b> → <b>추가</b>를 눌러요. 아이폰은 이렇게 설치해야 알림을 받을 수 있어요.',
    inapp: '카카오톡·네이버 앱 안의 브라우저에서는 설치가 안 돼요. 크롬이나 사파리로 이 주소를 열어 주세요.',
    manual: isMobile()
      ? '브라우저 메뉴(⋮)에서 <b>홈 화면에 추가</b> 또는 <b>앱 설치</b>를 눌러요.'
      : '폰에서 이 주소를 열면 홈 화면에 앱으로 설치할 수 있어요. PC 크롬은 주소창 오른쪽 설치 아이콘으로 설치돼요.',
  }[state];
  const action = state === 'prompt' ? '<button class="btn primary" data-install style="margin-top:10px">홈 화면에 앱으로 설치</button>' : state === 'inapp' ? openOutside() : '';
  return `<div class="card"><p class="info-line">${text}</p>${action}</div>`;
}
