// 사이트 설정. 브라우저에 그대로 보여도 되는 "공개용" 값만 넣는다 (비밀 키는 절대 넣지 않는다).

// 카카오맵: 카카오 디벨로퍼스 → 앱 → 플랫폼 키 → JavaScript 키.
// 그 키에 사이트 도메인(https://sj-gates.github.io)을 등록해야 동작한다. 비워 두면 구글 지도로 보여 준다.
export const KAKAO_JS_KEY = '27c34a572d3237beaaa1f07ff0889195';

// 내 장소 → 공고 실제 길찾기 (자동차: 카카오내비 지금 교통, 대중교통: 서울시 환승경로).
// Firebase Functions 의 route 주소 (push/route). 비워 두면 직선거리로 어림한 시간만 보여 준다.
export const ROUTE_URL = 'https://asia-northeast3-cheongyak-alarm.cloudfunctions.net/route';

// 방문 통계: Cloudflare Web Analytics (쿠키 없음). Cloudflare 대시보드 → Web Analytics → 사이트 추가 → 나오는 토큰.
// 토큰은 페이지에 그대로 보이는 공개 값이다. 비워 두면 통계를 안 쓴다.
export const ANALYTICS_TOKEN = '';

// 광고: Google 애드센스. 승인받기 전에는 비워 둔다 (비어 있으면 광고 자리도 안 생긴다).
//   client: "ca-pub-..." (애드센스 → 계정 → 게시자 ID)
//   listSlot / detailSlot: 애드센스 → 광고 → 광고 단위별 "data-ad-slot" 숫자
export const ADSENSE = { client: '', listSlot: '', detailSlot: '' };

// 찜한 공고 웹 푸시 알림 (push/send.ts 가 보낸다). Firebase 값은 Firebase 콘솔 → 프로젝트 설정 → 내 앱(웹)에서.
// 셋 중 하나라도 비어 있으면 알림 켜기 버튼이 나오지 않는다.
export const PUSH = {
  firebaseProjectId: 'cheongyak-alarm',
  firebaseApiKey: 'AIzaSyDuQgFbSrR58b_QqAUUCN-HGbTnkzEgd5M',
  // 알림 서명용 공개 키 (짝이 되는 비밀 키는 GitHub Secret VAPID_PRIVATE_KEY 에만 있다)
  vapidPublicKey: 'BBDdHoByCoSo65A4S3hd3zuZgwLPkoUHjl2b_Ju_qnq3ClwzO4B9ESHxbnbMmtAPnn_HyNzK0XpI4Ig5XasM9pY',
};
