// 사이트 설정. 브라우저에 그대로 보여도 되는 "공개용" 값만 넣는다 (비밀 키는 절대 넣지 않는다).

// 카카오맵: 카카오 디벨로퍼스 → 앱 → 플랫폼 키 → JavaScript 키.
// 그 키에 사이트 도메인(https://sj-gates.github.io)을 등록해야 동작한다. 비워 두면 구글 지도로 보여 준다.
export const KAKAO_JS_KEY = '';

// 찜한 공고 웹 푸시 알림 (push/send.ts 가 보낸다). Firebase 값은 Firebase 콘솔 → 프로젝트 설정 → 내 앱(웹)에서.
// 셋 중 하나라도 비어 있으면 알림 켜기 버튼이 나오지 않는다.
export const PUSH = {
  firebaseProjectId: '',
  firebaseApiKey: '',
  // 알림 서명용 공개 키 (짝이 되는 비밀 키는 GitHub Secret VAPID_PRIVATE_KEY 에만 있다)
  vapidPublicKey: 'BBDdHoByCoSo65A4S3hd3zuZgwLPkoUHjl2b_Ju_qnq3ClwzO4B9ESHxbnbMmtAPnn_HyNzK0XpI4Ig5XasM9pY',
};
