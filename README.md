# 청약알림 (휴대폰 앱 · 웹)

한국부동산원 청약홈 공공데이터로 **새 모집공고**와 **찜한 공고의 청약 일정**을 휴대폰 알림으로 받는 앱.
Expo(React Native)로 만들어 안드로이드·아이폰 공용이다.

## 기능

| 화면 | 내용 |
|---|---|
| 공고 | 오늘 접수하는 찜 공고 카드(청약하러 가기), 모집공고 목록 (접수중 → 접수예정 → 발표대기 → 마감 순), 지역 탭(전체·서울·경기·부산·전국), 종류·상태 필터, 검색, 당겨서 새로고침, NEW 표시 |
| 공고 상세 | 주소 지도(카카오맵·네이버지도로 열기), 접수일엔 **청약 접수하러 가기** 버튼(청약홈 청약신청 화면), 청약 일정표(특별공급 → 1순위 → 2순위 → 당첨자 발표 → 계약, D-day), 주택형별 분양가·세대수·특별공급 세부, 경쟁률(접수 시작 후), 당첨가점(발표 후, APT), 청약홈 모집공고 링크 |
| 찜 | 오늘 청약 접수 카드, 찜한 공고 목록, 예약된 알림 목록 |
| 설정 | 인증키, 받아볼 공고 종류(APT 민영·국민·신혼희망타운, 무순위, 불법행위 재공급, 오피스텔 등), 관심 지역, 알림 조건(분양가·전용면적·특별공급), 확인 주기, 전날/당일 알림 시각, 🔔 알림 테스트, 알림내역 |

**알림 종류**
- 새 공고 알림: 백그라운드에서 설정한 주기(1·3·6·12시간)로 조회 → 처음 보는 공고 중 조건에 맞는 것만. 같은 공고는 다시 알리지 않는다.
  공급유형을 처음 켰을 때는 기존 공고를 알림 없이 '본 공고'로만 채운다.
- 일정 알림: 찜한 공고의 청약 접수일(특별공급 · 1순위 · 2순위 등)마다 전날(기본 20시) · 당일(기본 8시) · 접수 마감일. 당첨자 발표·계약일은 알리지 않는다. 휴대폰에 미리 예약해 두므로 인터넷이 없어도 울린다.
  정정공고로 날짜가 바뀌면 다음 조회 때 자동으로 다시 잡는다.

## 처음 실행

```bash
npm install
npx expo start
```

- 휴대폰에 **Expo Go** 앱(플레이스토어/앱스토어)을 설치하고, 터미널에 나온 QR 코드를 찍으면 바로 열린다 (PC와 휴대폰이 같은 와이파이).
- 인증키가 아직 반영되지 않았으면 첫 화면의 **예시 데이터로 둘러보기**로 화면을 먼저 볼 수 있다.
- `npx expo start --web` 으로 PC 브라우저에서도 화면을 볼 수 있다 (알림·백그라운드는 휴대폰에서만).

## 인증키

1. data.go.kr 로그인 → 활용신청
   - `한국부동산원_청약홈 분양정보 조회 서비스` (필수)
   - `한국부동산원_청약홈 청약접수 경쟁률 및 특별공급 신청현황 조회 서비스` (경쟁률·당첨가점)
   - `국토교통부_아파트 매매 실거래가 자료` · `행정안전부_행정표준코드_법정동코드` (공고 상세의 주변 실거래가. 웹 빌드만 쓴다, 둘 다 자동승인)
2. 마이페이지 → 데이터활용 → Open API → 활용신청 현황 → 신청한 서비스 → **일반 인증키** 복사 (Encoding·Decoding 아무거나, 계정당 하나라 두 서비스 모두 같은 키)
3. 둘 중 한 가지로 넣는다.

**앱 기본 키로 넣기 (매번 입력 안 해도 됨)**
- 로컬(`npx expo start`, PC 미리보기): 프로젝트 폴더의 `.env.local` 에 `EXPO_PUBLIC_SERVICE_KEY=인증키` 저장 → 다시 불러오기.
  `.env.local` 은 `.gitignore` 에 있어 git 에 올라가지 않는다.
- APK 빌드(클라우드): `.env.local` 은 업로드되지 않으므로 EAS 환경변수로 한 번 등록한다.
  ```bash
  npx eas-cli@latest env:set --name EXPO_PUBLIC_SERVICE_KEY --value 인증키 --environment preview --visibility sensitive
  ```
- 기본 키는 APK 안에 들어가므로, APK 파일을 다른 사람에게 주거나 공개하지 않는다 (키를 꺼내 내 호출 한도를 쓸 수 있다).

**앱에서 직접 넣기**
- 앱 **설정 → 공공데이터포털 인증키**에 붙여넣고 **확인 후 저장** (연결 확인에 성공해야 저장된다).
  휴대폰 보안 저장소(`expo-secure-store`)에 저장되고, 기본 키보다 먼저 쓰인다.

## 안드로이드에 설치 파일(APK)로 설치

Expo Go 없이 앱 아이콘으로 쓰려면 클라우드에서 APK를 빌드한다 (무료 Expo 계정 필요, PC에 안드로이드 SDK 불필요).

```bash
npx eas-cli@latest login
npx eas-cli@latest build -p android --profile preview
```

빌드가 끝나면 나오는 링크/QR로 휴대폰에서 APK를 받아 설치한다.
설치 후 **설정 → 애플리케이션 → 청약알림 → 배터리 → 제한 없음**으로 두면 백그라운드 확인이 안정적이다 (특히 삼성).

아이폰은 Expo Go로 쓰거나, 설치 파일을 만들려면 Apple 개발자 계정이 필요하다.

## 웹 버전 (GitHub Pages)

`web/` 은 앱과 같은 디자인의 공개 웹 사이트다. 빌드 과정 없는 HTML/CSS/JS 이고,
공고 데이터는 GitHub Actions 가 3시간마다 받아서 만든다. 인증키는 GitHub Secret 에만 두므로 사이트 코드에 드러나지 않는다.

```
web/index.html          목록 · 찜 · 설정 (앱과 같은 3개 탭)
web/assets/             style.css, app.js(목록), detail.js(상세), common.js(공용)
scripts/build-web.ts    공고 받아서 web/data/*.json, web/n/<공고>.html, sitemap·feed 생성
.github/workflows/web.yml  3시간마다 위 스크립트 실행 → GitHub Pages 배포
web/map.html            공고 위치 지도 (카카오맵, 키가 없으면 구글 지도)
web/sw.js · web/assets/push.js   웹 푸시 알림 받기 · 켜기/끄기
push/send.ts            찜한 공고 알림 보내기 (.github/workflows/push.yml)
```

- 공고 상세는 공고마다 미리 만든 정적 페이지(`web/n/…html`)라 검색에 잡힌다. `sitemap.xml`, `feed.xml`(RSS)도 같이 만든다.
- 찜·설정(받아볼 종류, 관심 지역)은 방문자 브라우저에만 저장된다.

**로컬에서 보기**
```bash
npm run build:web
```
```bash
npx serve web
```

**처음 배포할 때 (한 번만)**
1. GitHub 에 새 저장소를 만들고 이 프로젝트를 올린다 (무료 계정은 공개 저장소여야 Pages 를 쓸 수 있다. `.env.local` 은 올라가지 않는다).
2. 저장소 **Settings → Secrets and variables → Actions → New repository secret**: 이름 `SERVICE_KEY`, 값 = 인증키
3. **Settings → Pages → Source: GitHub Actions**
4. **Actions → 청약 데이터 갱신 · 웹 배포 → Run workflow** 로 첫 배포. 이후엔 3시간마다 자동.
5. (선택) 도메인: Settings → Pages → Custom domain 에 도메인을 넣고, **Variables** 에 `SITE_URL` = `https://도메인` 추가.

**지도 (카카오맵)** — `web/map.html` 이 주소를 카카오 지오코더로 찾아 보여 준다. 웹 상세와 앱 상세가 같이 쓴다.
카카오 디벨로퍼스에서 앱을 만들고 [카카오맵] 사용 설정을 켠 뒤, JavaScript 키에 `https://sj-gates.github.io` 를 등록하고
그 키를 `web/assets/config.js` 의 `KAKAO_JS_KEY` 에 넣는다. 비어 있으면 구글 지도로 보여 준다.

**찜한 공고 웹 알림 (웹 푸시)**
- 찜 탭·설정 탭의 **알림 켜기** → 이 기기의 알림 주소와 찜한 공고 key 만 Firebase Firestore(`subscribers`)에 저장한다.
- `.github/workflows/push.yml` 이 한국 시간 07:50(오늘 접수·오늘 마감)·19:50(내일 접수)에 `push/send.ts` 를 돌려 보낸다.
- 아이폰은 사파리에서 **홈 화면에 추가**한 뒤 그 아이콘으로 열어야 알림을 켤 수 있다 (iOS 16.4+). 안드로이드 크롬·PC 는 바로 된다.
- 설정 (한 번만)
  1. Firebase 콘솔에서 프로젝트 만들기 → Firestore Database 만들기(위치 asia-northeast3) → 규칙에 `push/firestore.rules` 붙여넣기
  2. 프로젝트 설정 → 내 앱에 웹 앱 추가 → `projectId`, `apiKey` 를 `web/assets/config.js` 의 `PUSH` 에 넣기 (공개용 값)
  3. 프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성 → JSON 내용 전체를 GitHub Secret `FIREBASE_SERVICE_ACCOUNT` 에
  4. `.env.push.local` 의 `VAPID_PRIVATE_KEY` 값을 GitHub Secret `VAPID_PRIVATE_KEY` 에 (공개 키는 이미 config.js 에 있다)
- 시험: Actions → 찜한 공고 웹 알림 → Run workflow (dry_run 을 켜면 보내지 않고 누구에게 무엇을 보낼지만 출력)

**예약 실행 유지** — 공개 저장소는 60일 동안 커밋이 없으면 GitHub 이 예약 실행을 끈다.
`.github/workflows/keepalive.yml` 이 매주 확인해서 마지막 커밋이 40일 넘었을 때만 빈 커밋을 남긴다.
그런 커밋이 생긴 뒤 PC 에서 올릴 땐 `git pull` 을 먼저 한다.

## 알아둘 점

- 백그라운드 확인 주기는 최소 간격일 뿐, 실제 실행 시각은 휴대폰(배터리·네트워크)이 정한다. 아이폰은 특히 불규칙하다.
- 아이폰은 앱당 예약 알림이 64개까지라 가까운 일정부터 60개만 잡고, 조회할 때마다 다음 일정으로 채운다.
- 조회 범위는 최근 60일 모집공고. 하루 호출 한도(개발계정 4만 건)에 비해 훨씬 적게 쓴다.
- 공고 상세의 **잔금대출 예상**은 분양가 × LTV 에 주택가격별 최대한도를 씌운 참고값이다. 대출 규제나 규제지역이 바뀌면 `src/lib/loan.ts` 의 기준만 고친다.
- **주변 실거래가**(국토부 실거래)와 **주변 청약 경쟁률**(최근 1년 APT 1순위)은 웹 빌드가 만들어 `data/nearby/<공고>.json` 으로 올리고, 앱 상세도 그 파일을 읽는다. 실거래가 API 활용신청 전에는 그 칸만 빠진다.
- 응답 항목은 공공데이터포털 명세(swagger) 기준으로 맞췄다. 실제 응답과 다른 항목이 있으면 `src/lib/normalize.ts` 만 고치면 된다.

## 구조

```
index.ts                 진입점 (백그라운드 작업을 먼저 등록)
src/app/                 화면 (Expo Router)
  (tabs)/index.tsx       공고 목록
  (tabs)/favorites.tsx   찜 · 예약된 알림
  (tabs)/settings.tsx    설정 · 알림 테스트 · 알림내역
  notice/[key].tsx       공고 상세
src/lib/
  api.ts                 청약홈 API 호출 (분양정보 · 주택형 · 경쟁률 · 당첨가점)
  normalize.ts           5가지 공고 응답 → 하나의 Notice 형식, 일정표 만들기
  filters.ts             상태 판정, 지역·분양가·면적·특별공급 조건
  check.ts               새 공고 확인 (백그라운드·새로고침 공용), 중복 알림 방지
  alertPlan.ts           찜한 공고 → 전날/당일/마감 알림 계획
  applyhome.ts           오늘 접수 판정, 청약홈 청약신청 주소, 지도 주소
  address.ts             공급위치 주소 → 지도 검색용 주소 (번지·도로명만 남김)
  notifications.ts       알림 권한 · 채널 · 즉시/예약 알림
  background.ts          주기적 백그라운드 확인 등록
  storage.ts             설정 · 찜 · 본 공고 · 알림내역 저장, 인증키 보안 저장
  store.tsx              화면 공용 상태
  sample.ts              예시 데이터
```

검사: `npm run typecheck`, `npm run lint`, `npx expo-doctor`
