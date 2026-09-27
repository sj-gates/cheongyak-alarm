/**
 * 웹 버전(web/)에 들어갈 데이터와 공고별 페이지를 만든다.
 *
 * GitHub Actions 가 12시간마다(한국 06:40·18:40) 실행한다 (.github/workflows/web.yml).
 * 인증키는 SERVICE_KEY 시크릿으로만 받으므로 사이트 코드에는 들어가지 않는다.
 *
 *   web/data/notices.json   목록 화면이 읽는 공고 목록
 *   web/data/state.json     다음 실행 때 다시 쓰는 캐시 (처음 본 시각, 주택형, 경쟁률, 주변 실거래가)
 *   web/data/nearby/<공고>.json  주변 실거래가 · 주변 청약 경쟁률 (앱 상세가 읽는다)
 *   web/data/analysis/<공고>.json  찜 분석 탭 (입지 · 가격 · 경쟁 · 자금 · 조건, 웹·앱 공용)
 *   web/n/<공고>.html        공고 상세 (검색에 잡히도록 내용을 미리 채운 정적 페이지)
 *   web/sitemap.xml, feed.xml, robots.txt
 *
 * 로컬: npx tsx scripts/build-web.ts   (.env.local 의 EXPO_PUBLIC_SERVICE_KEY, KAKAO_REST_KEY 사용)
 */
import fs from 'node:fs';
import path from 'node:path';

import {
  errorMessage,
  fetchCompetition,
  fetchModels,
  fetchNotices,
  fetchScores,
} from '../src/lib/api';
import { addressArea } from '../src/lib/address';
import { mapLinks } from '../src/lib/applyhome';
import { CATEGORY_ORDER, KINDS, KIND_GROUPS, typeLabel } from '../src/lib/categories';
import { addDays, rangeLabel, shortDate, todayStr } from '../src/lib/dates';
import { formatArea, formatManwon, formatManwonShort, formatPhone, formatUnits, formatYearMonth } from '../src/lib/format';
import { LOAN_RULES_AS_OF, estimateLoan, loanArea, loanNote } from '../src/lib/loan';
import { NEARBY_CATEGORIES, baseModel, pickNearby, rateMeta, rateText, tradeDate, tradeMeta } from '../src/lib/nearby';
import { cleanModelLabel, parseRate } from '../src/lib/normalize';
import { REGION_NAMES } from '../src/lib/regions';
import type { Category, CompetitionRow, HouseModel, NearbyInfo, NearbyRate, NearbyTrades, Notice, ScoreRow } from '../src/lib/types';
import { buildAnalysis } from './analysis';
import { KakaoAuthError, createKakao, type LocationInfo } from './kakao';
import { rateCandidates, summarizeRank1 } from './rates';
import { GatewayError, createTradeSource, recentMonths } from './rtms';

const ROOT = path.resolve(__dirname, '..');
const WEB = path.join(ROOT, 'web');
const DATA_DIR = path.join(WEB, 'data');
const PAGE_DIR = path.join(WEB, 'n');
const NEARBY_DIR = path.join(DATA_DIR, 'nearby');
const ANALYSIS_DIR = path.join(DATA_DIR, 'analysis');
const LOOKBACK_DAYS = 60;
const CONCURRENCY = 6;
// 접수·발표 뒤 며칠 동안은 경쟁률·가점을 다시 받아 본다 (늦게 올라오는 경우가 있다)
const REFRESH_AFTER_DAYS = 3;
// 주변 실거래가는 일주일마다 새로 고른다 (실거래 신고는 계약 뒤 30일 안에 올라온다)
const NEARBY_REFRESH_MS = 7 * 86400000;
// 비교 단지는 5곳까지 모은다 (상세에는 2곳, 분석의 시세 비교는 5곳 중간값). 고르는 방식을 바꾸면 올린다
const NEARBY_VERSION = 2;
const NEARBY_COUNT = 5;
// 입지(역·학교·학원)는 잘 안 바뀌므로 석 달에 한 번만 다시 찾는다
const LOCATION_REFRESH_MS = 90 * 86400000;

const SITE_NAME = '청약알림';
const SITE_URL = (process.env.SITE_URL ?? '').trim().replace(/\/+$/, '');

type Cached<T> = { at: number; rows: T[] };
interface State {
  firstSeen: Record<string, number>;
  models: Record<string, HouseModel[]>;
  competition: Record<string, Cached<CompetitionRow>>;
  scores: Record<string, Cached<ScoreRow>>;
  nearby: Record<string, NearbyTrades & { v?: number }>;
  /** 주소의 시·군·구 → 실거래 지역코드 */
  lawd: Record<string, string[]>;
  /** 지난 1년 APT 분양의 1순위 경쟁률 (주변 청약 경쟁률에 쓴다, 결과가 없으면 rate: null) */
  pastRates: Record<string, { at: number; rate: NearbyRate | null }>;
  /** 공고 주변 지하철역·학교·학원 (카카오 로컬) */
  location: Record<string, LocationInfo>;
}
type WebNotice = Notice & { firstSeen: number };
interface NoticesFile {
  updatedAt: number;
  notices: WebNotice[];
}

// ── 준비 ─────────────────────────────────────────────────────
/** 환경변수가 없으면 .env.local 의 같은(또는 로컬용) 이름에서 */
function readEnv(name: string, localName = name): string {
  if (process.env[name]?.trim()) return process.env[name]!.trim();
  const envFile = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envFile)) return '';
  const m = fs.readFileSync(envFile, 'utf8').match(new RegExp(`^${localName}=(.*)$`, 'm'));
  return m?.[1].trim() ?? '';
}

function readServiceKey(): string {
  const key = readEnv('SERVICE_KEY', 'EXPO_PUBLIC_SERVICE_KEY');
  if (key) return key;
  throw new Error('인증키가 없어요. SERVICE_KEY 환경변수나 .env.local 을 확인하세요.');
}

/** 지난번 결과: 로컬 파일이 있으면 그걸, 없으면 배포된 사이트에서 받아온다 */
async function readPrevious<T>(file: string): Promise<T | null> {
  const local = path.join(DATA_DIR, file);
  if (fs.existsSync(local)) return JSON.parse(fs.readFileSync(local, 'utf8')) as T;
  if (!SITE_URL) return null;
  try {
    const res = await fetch(`${SITE_URL}/data/${file}`, { cache: 'no-store' });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

// ── HTML 조각 ────────────────────────────────────────────────
const CATEGORY_COLOR: Record<Category, string> = {
  APT: '#2F6BFF',
  REMNDR: '#E5484D',
  RESUPPLY: '#E8590C',
  URBTY: '#8E4EC6',
  PBLPVT: '#0E9F8E',
  OPT: '#B7791F',
};

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
const badge = (label: string, color: string) => `<span class="badge" style="--c:${color}">${esc(label)}</span>`;
const pageFile = (n: Notice) => `${n.key}.html`;
const pageUrl = (n: Notice) => (SITE_URL ? `${SITE_URL}/n/${pageFile(n)}` : `n/${pageFile(n)}`);
const favicon =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='16' fill='%232F6BFF'/%3E%3Cpath d='M16 30L32 17l16 13v16a2 2 0 0 1-2 2h-9V37h-10v11h-9a2 2 0 0 1-2-2z' fill='white'/%3E%3C/svg%3E";

function modelsHtml(models: HouseModel[]): string {
  if (models.length === 0) return '<p class="hint" style="margin:10px 0">주택형 정보가 아직 없어요.</p>';
  return models
    .map((m) => {
      const specials = Object.entries(m.special).filter(([, v]) => (v ?? 0) > 0);
      const units = [
        m.generalUnits !== undefined ? `일반 ${m.generalUnits}세대` : '',
        m.specialUnits ? `특별 ${m.specialUnits}세대` : '',
        m.deposit ? `청약신청금 ${formatManwon(m.deposit)}` : '',
      ].filter(Boolean);
      return `
      <div class="model-row">
        <div class="model-top">
          <span class="model-label">${esc(m.label)}</span>
          <span class="model-area">전용 ${formatArea(m.exclusiveArea)}${m.supplyArea ? ` · 공급 ${formatArea(m.supplyArea)}` : ''}</span>
          <span class="model-price">${formatManwon(m.price)}</span>
        </div>
        ${units.length ? `<p class="model-units">${esc(units.join(' · '))}</p>` : ''}
        ${specials.length ? `<p class="model-special">${esc(specials.map(([k, v]) => `${k} ${v}`).join(' · '))}</p>` : ''}
      </div>`;
    })
    .join('');
}

/** APT 경쟁률: 주택형 × 거주지역(해당지역·기타경기·기타지역) 표. rank: '1순위' | '2순위' */
function rankMatrix(rows: CompetitionRow[], rank: string): string {
  const rs = rows.filter((r) => r.group.startsWith(rank));
  const reside = (r: CompetitionRow) => r.group.slice(rank.length).trim() || '전체';
  const resides = [...new Set(rs.map(reside))];
  const types = [...new Set(rs.map((r) => r.houseType))];
  const cols = `style="--cols:${resides.length}"`;
  const head = `<div class="cmp-row cmp-head" ${cols}><span>주택형</span><span>세대</span>${resides.map((x) => `<span>${esc(x)}</span>`).join('')}</div>`;
  const body = types.map((type) => {
    const mine = rs.filter((r) => r.houseType === type);
    const units = Math.max(0, ...mine.map((r) => r.units ?? 0));
    const cells = resides.map((x) => {
      const r = mine.find((m) => reside(m) === x);
      if (!r) return '<span class="cmp-cell">-</span>';
      const rate = parseRate(r.rate);
      return `<span class="cmp-cell${rate.shortfall ? ' short' : rate.text === '-' ? ' none' : ''}"><b>${esc(rate.text)}</b><small>${esc(r.requests ?? '-')}건</small></span>`;
    });
    return `<div class="cmp-row" ${cols}><span class="cell-type">${esc(type)}</span><span class="cmp-units">${units || '-'}</span>${cells.join('')}</div>`;
  });
  return head + body.join('');
}

function competitionHtml(rows: CompetitionRow[], category: Category): string {
  // APT 는 주택형마다 순위·거주지역 줄이 4~6개라 표로 줄이고 2순위는 접어 둔다
  if (category === 'APT' && rows.some((r) => r.group.startsWith('1순위'))) {
    const second = rows.some((r) => r.group.startsWith('2순위'));
    return (
      '<p class="cmp-cap">1순위</p>' +
      rankMatrix(rows, '1순위') +
      (second ? `<details class="more"><summary>2순위 경쟁률 보기</summary>${rankMatrix(rows, '2순위')}</details>` : '') +
      '<p class="table-hint">경쟁률(:1) · 작은 숫자는 접수 건수 · 미달은 모자란 세대수</p>'
    );
  }
  return (
    rows
      .map((r) => {
        const rate = parseRate(r.rate);
        return `
      <div class="table-row">
        <span class="cell-type">${esc(r.houseType)}</span>
        <span class="cell-group">${esc(r.group)}</span>
        <span class="cell-num">${esc(r.units ?? '-')} / ${esc(r.requests ?? '-')}</span>
        <span class="cell-rate${rate.shortfall ? ' short' : ''}">${esc(rate.text)}</span>
      </div>`;
      })
      .join('') + '<p class="table-hint">세대수 / 접수건수 · 경쟁률(:1) · 미달은 접수가 모자란 세대수</p>'
  );
}

function scoresHtml(rows: ScoreRow[]): string {
  return (
    rows
      .map(
        (r) => `
      <div class="table-row">
        <span class="cell-type">${esc(r.houseType)}</span>
        <span class="cell-group">${esc(r.reside)}</span>
        <span class="cell-num">${esc(r.min ?? '-')} ~ ${esc(r.max ?? '-')}</span>
        <span class="cell-rate">${esc(r.avg ?? '-')}</span>
      </div>`
      )
      .join('') + '<p class="table-hint">최저 ~ 최고 · 평균 가점</p>'
  );
}

function nearbyHtml(nb: NearbyTrades): string {
  const rows = nb.items.length
    ? nb.items
        .slice(0, 2)
        .map(
          (t) => `
      <div class="model-row">
        <div class="model-top">
          <span class="trade-name">${esc(t.name)}</span>
          <span class="model-price">${formatManwon(t.price)}</span>
        </div>
        <p class="model-units">${esc(tradeMeta(t))}</p>
        <p class="model-special">${esc(tradeDate(t))}</p>
      </div>`
        )
        .join('')
    : '<p class="hint" style="margin:0;padding:12px 0">주변에 넓이가 비슷한 최근 1년 매매가 없어요.</p>';
  return `
    <p class="trade-base">비교 기준 ${esc(nb.model)} · 전용 ${formatArea(nb.area)}${nb.price ? ` · 최고 분양가 ${formatManwon(nb.price)}` : ''}</p>
    ${rows}
    <p class="table-hint">같은 동네 · 비슷한 넓이 · 최근 지은 단지 순으로 골랐어요. 자료: 국토교통부 실거래가</p>`;
}

function ratesHtml(rates: NearbyRate[]): string {
  return (
    rates
      .map((r) => {
        const rate = rateText(r);
        return `
      <div class="model-row">
        <div class="model-top">
          <span class="trade-name">${esc(r.name)}</span>
          <span class="cell-rate${rate.short ? ' short' : ''}">${esc(rate.text)}</span>
        </div>
        <p class="model-units">${esc(rateMeta(r))}</p>
      </div>`;
      })
      .join('') + '<p class="table-hint">가까운 곳에서 최근 1년 안에 분양한 아파트의 1순위 평균 경쟁률 (접수 건수 ÷ 일반공급 세대수)</p>'
  );
}

function loanHtml(n: Notice, models: HouseModel[]): string {
  const where = loanArea(n);
  const priced = models.filter((m): m is HouseModel & { price: number } => !!m.price);
  if (!priced.length) return '';
  const cell = (price: number, firstTime: boolean) => {
    const e = estimateLoan(price, where, firstTime);
    return `<span class="loan-cell">${formatManwonShort(e.amount)}${e.capped ? '<sup>*</sup>' : ''}</span>`;
  };
  const ltv = (firstTime: boolean) => estimateLoan(100000, where, firstTime).ltv;
  const anyCapped = priced.some((m) => estimateLoan(m.price, where, false).capped || estimateLoan(m.price, where, true).capped);
  return `
    <div class="loan-row loan-head"><span>주택형</span><span class="loan-cell">분양가</span><span class="loan-cell">무주택 ${ltv(false)}%</span><span class="loan-cell">생애최초 ${ltv(true)}%</span></div>
    ${priced
      .map((m) => `<div class="loan-row"><span class="loan-type">${esc(m.label)}</span><span class="loan-cell sub">${formatManwonShort(m.price)}</span>${cell(m.price, false)}${cell(m.price, true)}</div>`)
      .join('')}
    <p class="table-hint">${anyCapped ? '* 최대한도에 걸린 금액 · ' : ''}${esc(loanNote(where))}<br>1주택 이상이면 조건이 달라요 (수도권·규제지역은 기존 집을 6개월 안에 팔아야 받을 수 있어요).</p>`;
}

function detailPage(
  n: Notice,
  models: HouseModel[],
  competition: CompetitionRow[],
  scores: ScoreRow[],
  nearby: NearbyInfo = {}
): string {
  const prices = models.map((m) => m.price).filter((p): p is number => p !== undefined);
  const priceText = prices.length
    ? Math.min(...prices) === Math.max(...prices)
      ? formatManwon(prices[0])
      : `${formatManwon(Math.min(...prices))} ~ ${formatManwon(Math.max(...prices))}`
    : '';
  const title = `${n.name} 청약 일정·분양가 | ${SITE_NAME}`;
  const description = [
    `${n.region} ${typeLabel(n, ' ')}`,
    n.receiptStart ? `청약 접수 ${rangeLabel(n.receiptStart, n.receiptEnd)}` : '',
    n.winnerDate ? `당첨자 발표 ${shortDate(n.winnerDate)}` : '',
    n.totalUnits ? `${formatUnits(n.totalUnits)}` : '',
    priceText ? `분양가 ${priceText}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const snapshot = {
    key: n.key,
    category: n.category,
    kind: n.kind,
    name: n.name,
    typeName: n.typeName,
    region: n.region,
    address: n.address,
    totalUnits: n.totalUnits,
    announceDate: n.announceDate,
    receiptStart: n.receiptStart,
    receiptEnd: n.receiptEnd,
    winnerDate: n.winnerDate,
    events: n.events,
  };
  const info: [string, string, string?][] = [
    ['공급규모', n.totalUnits ? formatUnits(n.totalUnits) : '-'],
    ['모집공고일', shortDate(n.announceDate)],
    ['입주예정', formatYearMonth(n.moveIn)],
    ...(n.builder ? ([['시공사', n.builder]] as [string, string][]) : []),
    ['시행사', n.developer ?? '-'],
    ['문의처', n.phone ? formatPhone(n.phone) : '-', n.phone ? `tel:${n.phone}` : undefined],
  ];
  const homepage = n.homepage ? (/^https?:\/\//.test(n.homepage) ? n.homepage : `http://${n.homepage}`) : '';
  const map = mapLinks(n.address, n.name);
  const loan = NEARBY_CATEGORIES.has(n.category) ? loanHtml(n, models) : '';

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${SITE_URL ? `<link rel="canonical" href="${esc(pageUrl(n))}">\n<meta property="og:url" content="${esc(pageUrl(n))}">` : ''}
<meta property="og:type" content="article">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${esc(`${n.name} 청약 일정·분양가`)}">
<meta property="og:description" content="${esc(description)}">
${SITE_URL ? `<meta property="og:image" content="${esc(SITE_URL)}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#f3f5f9" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0d1016" media="(prefers-color-scheme: dark)">
<link rel="icon" href="${favicon}">
<link rel="manifest" href="../manifest.webmanifest">
<link rel="apple-touch-icon" href="../icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="청약알림">
<link rel="stylesheet" href="../assets/style.css">
</head>
<body>
<header class="topbar">
  <a class="icon-btn" href="../" aria-label="공고 목록으로"><i data-icon="back"></i></a>
  <span class="sub-title">공고 상세</span>
  <button class="icon-btn" id="fav-top" aria-label="찜하기"></button>
</header>
<main class="container" style="padding-bottom:40px">
  <div class="hero">
    <div class="badges">${badge(typeLabel(n), CATEGORY_COLOR[n.category])}${badge(n.region, 'var(--sub)')}<span id="status-badge"></span></div>
    <h1>${esc(n.name)}</h1>
    <p class="address">${esc(n.address)}</p>
    ${n.tags.length ? `<div class="badges tags">${n.tags.map((t) => badge(t, 'var(--accent)')).join('')}</div>` : ''}
  </div>

  <div class="map-card">
    <iframe class="map" src="../${esc(map.mapPage)}" loading="lazy" title="${esc(n.name)} 위치 지도"></iframe>
    ${map.approximate ? '<p class="map-note">공고에 정확한 번지가 없어 동네 위치로 보여 줘요.</p>' : ''}
  </div>

  <div id="apply-slot"></div>

  <div class="btn-row" style="margin-top:0"><button class="btn primary" id="fav-main">찜하기</button></div>

  <div class="section-title">청약 일정</div>
  <div class="card timeline">
    ${
      n.events.length
        ? n.events
            .map(
              (ev, i) => `
    <div class="tl-row" data-start="${ev.start}" data-end="${ev.end ?? ev.start}">
      <div class="tl-rail"><span class="tl-dot"></span>${i < n.events.length - 1 ? '<span class="tl-line"></span>' : ''}</div>
      <div class="tl-body">
        <div class="tl-title"><span>${esc(ev.label)}</span><span class="tl-dday"></span></div>
        <div class="tl-date">${esc(rangeLabel(ev.start, ev.end))}</div>
      </div>
    </div>`
            )
            .join('')
        : '<p class="hint" style="margin:0">일정 정보가 없어요.</p>'
    }
  </div>

  <div class="section-title">주택형별 공급</div>
  <div class="card tight">${modelsHtml(models)}</div>

  ${loan ? `<div class="section-title">잔금대출 예상</div><div class="card tight">${loan}</div>` : ''}

  ${competition.length ? `<div class="section-title">청약 경쟁률</div><div class="card tight">${competitionHtml(competition, n.category)}</div>` : ''}
  ${scores.length ? `<div class="section-title">당첨 가점</div><div class="card tight">${scoresHtml(scores)}</div>` : ''}

  ${nearby.trades ? `<div class="section-title">주변 실거래가</div><div class="card tight">${nearbyHtml(nearby.trades)}</div>` : ''}
  ${nearby.rates?.length ? `<div class="section-title">주변 청약 경쟁률</div><div class="card tight">${ratesHtml(nearby.rates)}</div>` : ''}

  <div class="section-title">기본 정보</div>
  <div class="card tight">
    ${info
      .map(([k, v, link]) => `<div class="info-row"><span class="k">${esc(k)}</span>${link ? `<a class="v" href="${esc(link)}">${esc(v)}</a>` : `<span class="v">${esc(v)}</span>`}</div>`)
      .join('')}
  </div>

  <div class="btn-row">
    ${n.url ? `<a class="btn primary" href="${esc(n.url)}" target="_blank" rel="noopener"><i data-icon="doc"></i>청약홈에서 모집공고 보기</a>` : ''}
    <a class="btn secondary" href="../#/analysis/${encodeURIComponent(n.key)}"><i data-icon="chart"></i>해당지역 분석하기</a>
    ${homepage ? `<a class="btn ghost" href="${esc(homepage)}" target="_blank" rel="noopener nofollow"><i data-icon="globe"></i>분양 홈페이지</a>` : ''}
    <a class="btn ghost" href="../">다른 청약 공고 보기</a>
  </div>
  <p class="source">자료: 한국부동산원 청약홈${nearby.trades ? ', 국토교통부 실거래가' : ''} (공공데이터포털)<br>청약 전에 반드시 모집공고문 원문을 확인하세요.</p>
</main>
<script type="application/json" id="notice-data">${JSON.stringify(snapshot).replace(/</g, '\\u003c')}</script>
<script type="module" src="../assets/detail.js"></script>
</body>
</html>
`;
}

// ── 사이트맵 · 피드 ──────────────────────────────────────────
function sitemap(pages: string[]): string {
  const urls = [`${SITE_URL}/`, ...pages.map((f) => `${SITE_URL}/n/${f}`)];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${esc(u)}</loc></url>`).join('\n')}
</urlset>
`;
}

function feed(notices: WebNotice[]): string {
  const items = [...notices]
    .sort((a, b) => b.firstSeen - a.firstSeen || (b.announceDate ?? '').localeCompare(a.announceDate ?? ''))
    .slice(0, 50);
  const date = (n: WebNotice) =>
    new Date(n.firstSeen || (n.announceDate ? `${n.announceDate}T09:00:00+09:00` : Date.now())).toUTCString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>${SITE_NAME} — 새 청약 공고</title>
  <link>${esc(SITE_URL || '.')}/</link>
  <description>한국부동산원 청약홈 모집공고 새 소식</description>
  <language>ko</language>
${items
  .map(
    (n) => `  <item>
    <title>${esc(`[${n.region}] ${n.name} (${typeLabel(n, ' ')})`)}</title>
    <link>${esc(pageUrl(n))}</link>
    <guid isPermaLink="false">${esc(n.key)}</guid>
    <pubDate>${date(n)}</pubDate>
    <description>${esc(`청약 접수 ${rangeLabel(n.receiptStart, n.receiptEnd)} · 당첨자 발표 ${shortDate(n.winnerDate)}`)}</description>
  </item>`
  )
  .join('\n')}
</channel>
</rss>
`;
}

// ── 실행 ─────────────────────────────────────────────────────
async function main() {
  const started = Date.now();
  const serviceKey = readServiceKey();
  const today = todayStr();
  const since = addDays(today, -LOOKBACK_DAYS);

  const prevState = (await readPrevious<State>('state.json')) ?? null;
  const prevNotices = (await readPrevious<NoticesFile>('notices.json'))?.notices ?? [];
  const state: State = prevState ?? { firstSeen: {}, models: {}, competition: {}, scores: {}, nearby: {}, lawd: {}, pastRates: {}, location: {} };
  state.nearby ??= {};
  state.lawd ??= {};
  state.pastRates ??= {};
  state.location ??= {};
  // 예전에 받아 둔 도시형·민간임대 주택형 이름 "- 84A" 정리
  for (const models of Object.values(state.models)) for (const m of models) m.label = cleanModelLabel(m.label);

  const { notices: fetched, errors } = await fetchNotices(serviceKey, CATEGORY_ORDER, since);
  // 한 종류가 실패하면 그 종류는 지난번 데이터를 그대로 쓴다 (사이트에서 공고가 사라지지 않게)
  const failed = new Set(errors.map((e) => e.category));
  for (const e of errors) console.warn(`! ${e.category} 조회 실패: ${e.message}`);
  const notices: Notice[] = [...fetched, ...prevNotices.filter((n) => failed.has(n.category))];

  let calls = 0;
  const now = Date.now();
  const recent = (date: string | undefined) => !!date && today <= addDays(date, REFRESH_AFTER_DAYS);

  await mapLimit(notices, CONCURRENCY, async (n) => {
    // 처음 실행이면 모두 '이미 본 공고'로 둔다 (NEW 표시가 한꺼번에 붙지 않게)
    if (!(n.key in state.firstSeen)) state.firstSeen[n.key] = prevState ? now : 0;

    if (!state.models[n.key]?.length) {
      calls++;
      state.models[n.key] = await fetchModels(serviceKey, n).catch(() => []);
    }
    if (n.receiptStart && n.receiptStart <= today) {
      const cached = state.competition[n.key];
      if (!cached || cached.rows.length === 0 || recent(n.winnerDate ?? n.receiptEnd)) {
        calls++;
        try {
          state.competition[n.key] = { at: now, rows: await fetchCompetition(serviceKey, n) };
        } catch (e) {
          if (!cached) console.warn(`! 경쟁률 ${n.name}: ${errorMessage(e)}`);
        }
      }
    }
    if (n.category === 'APT' && n.winnerDate && n.winnerDate <= today) {
      const cached = state.scores[n.key];
      if (!cached || recent(n.winnerDate)) {
        calls++;
        try {
          state.scores[n.key] = { at: now, rows: await fetchScores(serviceKey, n) };
        } catch {
          /* 가점은 없으면 안 보여준다 */
        }
      }
    }
  });

  // 주변 실거래가: 처음 보는 공고와 일주일 지난 것만 다시 고른다
  const trades = createTradeSource(serviceKey, state.lawd);
  const year = Number(today.slice(0, 4));
  let nearbyMade = 0;
  await mapLimit(
    notices.filter((n) => NEARBY_CATEGORIES.has(n.category)),
    CONCURRENCY,
    async (n) => {
      const cached = state.nearby[n.key];
      if ((cached && cached.v === NEARBY_VERSION && now - cached.at < NEARBY_REFRESH_MS) || trades.disabled) return;
      const model = baseModel(state.models[n.key] ?? []);
      const where = addressArea(n.address);
      if (!model?.exclusiveArea || !where) return;
      try {
        const codes = await trades.codes(where.area);
        if (!codes.length) return console.warn(`! 지역코드 못 찾음: ${where.area} (${n.name})`);
        const opts = { area: model.exclusiveArea, dong: where.dong, name: n.name, year, count: NEARBY_COUNT };
        // 최근 6개월에서 먼저 찾고, 모자라면 1년까지
        let items = pickNearby(await trades.trades(codes, recentMonths(today, 6)), opts);
        if (items.length < 2) items = pickNearby(await trades.trades(codes, recentMonths(today, 12)), opts);
        state.nearby[n.key] = { v: NEARBY_VERSION, at: now, model: model.label, area: model.exclusiveArea, price: model.price, items };
        nearbyMade++;
      } catch (e) {
        if (!(e instanceof GatewayError)) console.warn(`! 실거래가 ${n.name}: ${errorMessage(e)}`);
      }
    }
  );
  if (trades.disabled) console.warn(`! 주변 실거래가 건너뜀: ${trades.disabled} (공공데이터포털 활용신청 확인)`);

  // 주변 청약 경쟁률: 최근 1년 APT 분양(민영·국민)에서 가까운 곳부터 두 단지
  const pool = await fetchNotices(serviceKey, ['APT'], addDays(today, -365))
    .then((r) => r.notices.filter((p) => p.kind === 'APT_PRIVATE' || p.kind === 'APT_PUBLIC'))
    .catch((e) => {
      console.warn(`! 주변 청약 경쟁률 건너뜀: ${errorMessage(e)}`);
      return [] as Notice[];
    });
  const pendingRates = new Map<string, Promise<NearbyRate | null>>();
  const pastRate = (p: Notice): Promise<NearbyRate | null> => {
    const cached = state.pastRates[p.key];
    // 결과가 있으면 그대로, 없던 것은 일주일 뒤 다시 확인
    if (cached && (cached.rate || now - cached.at < NEARBY_REFRESH_MS)) return Promise.resolve(cached.rate);
    if (!pendingRates.has(p.key)) {
      calls++;
      pendingRates.set(
        p.key,
        fetchCompetition(serviceKey, p)
          .then((rows) => {
            const rate = summarizeRank1(p, rows);
            state.pastRates[p.key] = { at: now, rate };
            return rate;
          })
          .catch(() => null)
      );
    }
    return pendingRates.get(p.key)!;
  };
  const nearbyRates: Record<string, NearbyRate[]> = {};
  await mapLimit(
    notices.filter((n) => NEARBY_CATEGORIES.has(n.category)),
    CONCURRENCY,
    async (n) => {
      const found: NearbyRate[] = [];
      for (const p of rateCandidates(n, pool, today).slice(0, 6)) {
        const rate = await pastRate(p);
        if (rate) found.push(rate);
        if (found.length >= 2) break;
      }
      if (found.length) nearbyRates[n.key] = found;
    }
  );
  // 입지: 공고 주변 지하철역·학교·학원·병원·대형마트 (카카오 로컬, 석 달마다)
  const kakao = createKakao(readEnv('KAKAO_REST_KEY'));
  let located = 0;
  await mapLimit(notices, CONCURRENCY, async (n) => {
    const cached = state.location[n.key];
    if ((cached && now - cached.at < LOCATION_REFRESH_MS) || kakao.disabled) return;
    try {
      const info = await kakao.location(n.address);
      if (info) {
        state.location[n.key] = info;
        located++;
      }
    } catch (e) {
      if (!(e instanceof KakaoAuthError)) console.warn(`! 입지 ${n.name}: ${errorMessage(e)}`);
    }
  });
  if (kakao.disabled) console.warn(`! 입지 분석 건너뜀: ${kakao.disabled}`);

  const poolKeys = new Set(pool.map((p) => p.key));
  if (pool.length) for (const key of Object.keys(state.pastRates)) if (!poolKeys.has(key)) delete state.pastRates[key];

  // 목록에서 빠진 공고의 캐시는 정리 (상세 페이지 파일은 검색 유입을 위해 남긴다)
  const live = new Set(notices.map((n) => n.key));
  for (const table of [state.firstSeen, state.models, state.competition, state.scores, state.nearby, state.location] as Record<string, unknown>[]) {
    for (const key of Object.keys(table)) if (!live.has(key)) delete table[key];
  }

  const webNotices: WebNotice[] = notices.map((n) => ({ ...n, firstSeen: state.firstSeen[n.key] ?? 0 }));
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(PAGE_DIR, { recursive: true });

  const listFile = {
    updatedAt: now,
    kinds: KINDS,
    groups: KIND_GROUPS,
    regions: REGION_NAMES,
    // 목록 화면에 필요 없는 항목은 빼서 파일을 가볍게
    notices: webNotices.map(({ houseManageNo, pblancNo, area, url, homepage, phone, developer, contractStart, contractEnd, moveIn, tags, ...rest }) => rest),
  };
  fs.writeFileSync(path.join(DATA_DIR, 'notices.json'), JSON.stringify(listFile));
  fs.writeFileSync(path.join(DATA_DIR, 'state.json'), JSON.stringify(state));

  fs.mkdirSync(NEARBY_DIR, { recursive: true });
  fs.mkdirSync(ANALYSIS_DIR, { recursive: true });
  for (const n of notices) {
    const nearby: NearbyInfo = { trades: state.nearby[n.key], rates: nearbyRates[n.key] };
    const page = detailPage(n, state.models[n.key] ?? [], state.competition[n.key]?.rows ?? [], state.scores[n.key]?.rows ?? [], nearby);
    fs.writeFileSync(path.join(PAGE_DIR, pageFile(n)), page);
    if (nearby.trades || nearby.rates) fs.writeFileSync(path.join(NEARBY_DIR, `${n.key}.json`), JSON.stringify(nearby));
    const analysis = buildAnalysis({
      notice: n,
      today,
      model: baseModel(state.models[n.key] ?? []),
      location: state.location[n.key],
      trades: nearby.trades,
      rates: nearby.rates,
      own: n.category === 'APT' && state.competition[n.key] ? summarizeRank1(n, state.competition[n.key].rows) : null,
    });
    fs.writeFileSync(path.join(ANALYSIS_DIR, `${n.key}.json`), JSON.stringify(analysis));
  }

  fs.writeFileSync(path.join(WEB, 'feed.xml'), feed(webNotices));
  if (SITE_URL) {
    const pages = fs.readdirSync(PAGE_DIR).filter((f) => f.endsWith('.html')).sort();
    fs.writeFileSync(path.join(WEB, 'sitemap.xml'), sitemap(pages));
    fs.writeFileSync(path.join(WEB, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);
  }

  const byCat = CATEGORY_ORDER.map((c) => `${c} ${notices.filter((n) => n.category === c).length}`).join(', ');
  console.log(`공고 ${notices.length}건 (${byCat}) · 추가 API 호출 ${calls}회 · ${((Date.now() - started) / 1000).toFixed(1)}초`);
  console.log(`주변 청약 경쟁률 ${Object.keys(nearbyRates).length}건 (비교 대상 APT ${pool.length}건) · 대출 기준 ${LOAN_RULES_AS_OF}`);
  console.log(`입지 ${Object.keys(state.location).length}건 (이번에 ${located}건 새로, 카카오 호출 ${kakao.calls}회)`);
  console.log(`주변 실거래가 ${Object.keys(state.nearby).length}건 (이번에 ${nearbyMade}건 새로, 실거래·지역코드 호출 ${trades.calls}회)`);
  if (errors.length === CATEGORY_ORDER.length) process.exit(1);
}

main().catch((e) => {
  console.error(`실패: ${errorMessage(e)}`);
  process.exit(1);
});
