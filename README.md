# 청약알림 (휴대폰 앱 · 웹)

한국부동산원 청약홈 공공데이터로 **새 모집공고**와 **찜한 공고의 청약 일정**을 휴대폰 알림으로 받는 앱.
Expo(React Native)로 만들어 안드로이드·아이폰 공용이다.

## 기능

| 화면 | 내용 |
|---|---|
| 공고 | 모집공고 목록 (접수중 → 접수예정 → 발표대기 → 마감 순), 지역 탭(전체·서울·경기·부산·전국), 종류·상태 필터, 검색, 당겨서 새로고침, NEW 표시 |
| 공고 상세 | 청약 일정표(특별공급 → 1순위 → 2순위 → 당첨자 발표 → 계약, D-day), 주택형별 분양가·세대수·특별공급 세부, 경쟁률(접수 시작 후), 당첨가점(발표 후, APT), 청약홈 모집공고 링크 |
| 찜 | 찜한 공고의 다가오는 일정, 예약된 알림 목록 |
| 통계 | 지역별·유형별 공고 수, 알림내역 |
| 설정 | 인증키, 받아볼 공고 종류(APT 민영·국민·신혼희망타운, 무순위, 불법행위 재공급, 오피스텔 등), 관심 지역, 알림 조건(분양가·전용면적·특별공급), 확인 주기, 전날/당일 알림 시각, 🔔 알림 테스트 |

**알림 종류**
- 새 공고 알림: 백그라운드에서 설정한 주기(1·3·6·12시간)로 조회 → 처음 보는 공고 중 조건에 맞는 것만. 같은 공고는 다시 알리지 않는다.
  공급유형을 처음 켰을 때는 기존 공고를 알림 없이 '본 공고'로만 채운다.
- 일정 알림: 찜한 공고의 각 일정마다 전날(기본 20시) · 당일(기본 8시) · 접수 마감일. 휴대폰에 미리 예약해 두므로 인터넷이 없어도 울린다.
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
web/index.html          목록 · 찜 · 통계 · 설정 (앱과 같은 4개 탭)
web/assets/             style.css, app.js(목록), detail.js(상세), common.js(공용)
scripts/build-web.ts    공고 받아서 web/data/*.json, web/n/<공고>.html·.ics, sitemap·feed 생성
.github/workflows/web.yml  3시간마다 위 스크립트 실행 → GitHub Pages 배포
```

- 공고 상세는 공고마다 미리 만든 정적 페이지(`web/n/…html`)라 검색에 잡힌다. `sitemap.xml`, `feed.xml`(RSS)도 같이 만든다.
- 찜·설정(받아볼 종류, 관심 지역)은 방문자 브라우저에만 저장된다.
- 웹은 휴대폰 알림을 보낼 수 없어서, 상세·찜 탭의 **캘린더에 추가**(.ics)로 전날 20시·당일 8시 알림을 대신한다.

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

**예약 실행 유지** — 공개 저장소는 60일 동안 커밋이 없으면 GitHub 이 예약 실행을 끈다.
`.github/workflows/keepalive.yml` 이 매주 확인해서 마지막 커밋이 40일 넘었을 때만 빈 커밋을 남긴다.
그런 커밋이 생긴 뒤 PC 에서 올릴 땐 `git pull` 을 먼저 한다.

## 알아둘 점

- 백그라운드 확인 주기는 최소 간격일 뿐, 실제 실행 시각은 휴대폰(배터리·네트워크)이 정한다. 아이폰은 특히 불규칙하다.
- 아이폰은 앱당 예약 알림이 64개까지라 가까운 일정부터 60개만 잡고, 조회할 때마다 다음 일정으로 채운다.
- 조회 범위는 최근 60일 모집공고. 하루 호출 한도(개발계정 4만 건)에 비해 훨씬 적게 쓴다.
- 응답 항목은 공공데이터포털 명세(swagger) 기준으로 맞췄다. 실제 응답과 다른 항목이 있으면 `src/lib/normalize.ts` 만 고치면 된다.

## 구조

```
index.ts                 진입점 (백그라운드 작업을 먼저 등록)
src/app/                 화면 (Expo Router)
  (tabs)/index.tsx       공고 목록
  (tabs)/favorites.tsx   찜 · 다가오는 일정
  (tabs)/stats.tsx       통계 · 알림내역
  (tabs)/settings.tsx    설정 · 알림 테스트
  notice/[key].tsx       공고 상세
src/lib/
  api.ts                 청약홈 API 호출 (분양정보 · 주택형 · 경쟁률 · 당첨가점)
  normalize.ts           5가지 공고 응답 → 하나의 Notice 형식, 일정표 만들기
  filters.ts             상태 판정, 지역·분양가·면적·특별공급 조건
  check.ts               새 공고 확인 (백그라운드·새로고침 공용), 중복 알림 방지
  alertPlan.ts           찜한 공고 → 전날/당일/마감 알림 계획
  notifications.ts       알림 권한 · 채널 · 즉시/예약 알림
  background.ts          주기적 백그라운드 확인 등록
  storage.ts             설정 · 찜 · 본 공고 · 알림내역 저장, 인증키 보안 저장
  store.tsx              화면 공용 상태
  sample.ts              예시 데이터
```

검사: `npm run typecheck`, `npm run lint`, `npx expo-doctor`
