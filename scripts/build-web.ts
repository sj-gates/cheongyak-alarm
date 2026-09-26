/**
 * 웹 버전(web/)에 들어갈 데이터와 공고별 페이지를 만든다.
 *
 * GitHub Actions 가 3시간마다 실행한다 (.github/workflows/web.yml).
 * 인증키는 SERVICE_KEY 시크릿으로만 받으므로 사이트 코드에는 들어가지 않는다.
 *
 *   web/data/notices.json   목록 화면이 읽는 공고 목록
 *   web/data/state.json     다음 실행 때 다시 쓰는 캐시 (처음 본 시각, 주택형, 경쟁률)
 *   web/n/<공고>.html        공고 상세 (검색에 잡히도록 내용을 미리 채운 정적 페이지)
 *   web/n/<공고>.ics         캘린더 파일
 *   web/sitemap.xml, feed.xml, robots.txt
 *
 * 로컬: npx tsx scripts/build-web.ts   (.env.local 의 EXPO_PUBLIC_SERVICE_KEY 사용)
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
import { CATEGORY_ORDER, KINDS, KIND_GROUPS, typeLabel } from '../src/lib/categories';
import { addDays, rangeLabel, shortDate, todayStr } from '../src/lib/dates';
import { formatArea, formatManwon, formatPhone, formatUnits, formatYearMonth } from '../src/lib/format';
import { parseRate } from '../src/lib/normalize';
import { REGION_NAMES } from '../src/lib/regions';
import type { Category, CompetitionRow, HouseModel, Notice, ScoreRow } from '../src/lib/types';

const ROOT = path.resolve(__dirname, '..');
const WEB = path.join(ROOT, 'web');
const DATA_DIR = path.join(WEB, 'data');
const PAGE_DIR = path.join(WEB, 'n');
const LOOKBACK_DAYS = 60;
const CONCURRENCY = 6;
// 접수·발표 뒤 며칠 동안은 경쟁률·가점을 다시 받아 본다 (늦게 올라오는 경우가 있다)
const REFRESH_AFTER_DAYS = 3;

const SITE_NAME = '청약알림';
const SITE_URL = (process.env.SITE_URL ?? '').trim().replace(/\/+$/, '');

type Cached<T> = { at: number; rows: T[] };
interface State {
  firstSeen: Record<string, number>;
  models: Record<string, HouseModel[]>;
  competition: Record<string, Cached<CompetitionRow>>;
  scores: Record<string, Cached<ScoreRow>>;
}
type WebNotice = Notice & { firstSeen: number };
interface NoticesFile {
  updatedAt: number;
  notices: WebNotice[];
}

// ── 준비 ─────────────────────────────────────────────────────
function readServiceKey(): string {
  if (process.env.SERVICE_KEY?.trim()) return process.env.SERVICE_KEY.trim();
  const envFile = path.join(ROOT, '.env.local');
  if (fs.existsSync(envFile)) {
    const m = fs.readFileSync(envFile, 'utf8').match(/^EXPO_PUBLIC_SERVICE_KEY=(.*)$/m);
    if (m?.[1].trim()) return m[1].trim();
  }
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

function competitionHtml(rows: CompetitionRow[]): string {
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

function detailPage(n: Notice, models: HouseModel[], competition: CompetitionRow[], scores: ScoreRow[]): string {
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
<meta name="theme-color" content="#f3f5f9" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0d1016" media="(prefers-color-scheme: dark)">
<link rel="icon" href="${favicon}">
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

  ${
    hasReceipt(n)
      ? `<div class="btn-row" style="margin-top:0;grid-template-columns:1fr 1fr">
    <button class="btn primary" id="fav-main">찜하기</button>
    <button class="btn secondary" id="cal-btn" data-ics="${esc(pageFile(n).replace(/\.html$/, '.ics'))}"><i data-icon="calendar"></i>캘린더에 추가</button>
  </div>
  <p class="note">청약 접수일만 구글 · 네이버 · 아이폰 · 삼성 캘린더 중에 골라서 넣어요.</p>`
      : `<div class="btn-row" style="margin-top:0"><button class="btn primary" id="fav-main">찜하기</button></div>`
  }

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

  ${competition.length ? `<div class="section-title">청약 경쟁률</div><div class="card tight">${competitionHtml(competition)}</div>` : ''}
  ${scores.length ? `<div class="section-title">당첨 가점</div><div class="card tight">${scoresHtml(scores)}</div>` : ''}

  <div class="section-title">기본 정보</div>
  <div class="card tight">
    ${info
      .map(([k, v, link]) => `<div class="info-row"><span class="k">${esc(k)}</span>${link ? `<a class="v" href="${esc(link)}">${esc(v)}</a>` : `<span class="v">${esc(v)}</span>`}</div>`)
      .join('')}
  </div>

  <div class="btn-row">
    ${n.url ? `<a class="btn primary" href="${esc(n.url)}" target="_blank" rel="noopener"><i data-icon="doc"></i>청약홈에서 모집공고 보기</a>` : ''}
    ${homepage ? `<a class="btn ghost" href="${esc(homepage)}" target="_blank" rel="noopener nofollow"><i data-icon="globe"></i>분양 홈페이지</a>` : ''}
    <a class="btn ghost" href="../">다른 청약 공고 보기</a>
  </div>
  <p class="source">자료: 한국부동산원 청약홈 (공공데이터포털)<br>청약 전에 반드시 모집공고문 원문을 확인하세요.</p>
</main>
<script type="application/json" id="notice-data">${JSON.stringify(snapshot).replace(/</g, '\\u003c')}</script>
<script type="module" src="../assets/detail.js"></script>
</body>
</html>
`;
}

// ── 캘린더 · 사이트맵 · 피드 ──────────────────────────────────
const RECEIPT_KINDS = new Set(['special', 'rank1', 'rank2', 'general', 'receipt']);
/** 아직 지나지 않은 청약 접수일 (빌드한 날 기준) */
const receiptEvents = (n: Notice) => n.events.filter((e) => RECEIPT_KINDS.has(e.kind) && (e.end ?? e.start) >= todayStr());
const hasReceipt = (n: Notice) => receiptEvents(n).length > 0;
const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => `\\${m}`);

function icsFile(n: Notice): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//cheongyak//ko', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  // 남은 청약 접수일만 넣는다 (발표·계약은 넣지 않는다)
  for (const ev of receiptEvents(n)) {
    const what = `${ev.label} 접수`;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${n.key}-${ev.id}@cheongyak`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ev.start.replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${addDays(ev.end ?? ev.start, 1).replace(/-/g, '')}`,
      `SUMMARY:${icsText(`[청약] ${n.name} ${what}`)}`,
      `DESCRIPTION:${icsText(`${typeLabel(n)} · ${n.region}\n${pageUrl(n)}`)}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsText(`내일 ${what} · ${n.name}`)}`,
      'TRIGGER:-PT4H',
      'END:VALARM',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsText(`오늘 ${what} · ${n.name}`)}`,
      'TRIGGER:PT8H',
      'END:VALARM',
      'END:VEVENT'
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

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
  const state: State = prevState ?? { firstSeen: {}, models: {}, competition: {}, scores: {} };

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

  // 목록에서 빠진 공고의 캐시는 정리 (상세 페이지 파일은 검색 유입을 위해 남긴다)
  const live = new Set(notices.map((n) => n.key));
  for (const table of [state.firstSeen, state.models, state.competition, state.scores] as Record<string, unknown>[]) {
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

  for (const n of notices) {
    const page = detailPage(n, state.models[n.key] ?? [], state.competition[n.key]?.rows ?? [], state.scores[n.key]?.rows ?? []);
    fs.writeFileSync(path.join(PAGE_DIR, pageFile(n)), page);
    if (hasReceipt(n)) fs.writeFileSync(path.join(PAGE_DIR, pageFile(n).replace(/\.html$/, '.ics')), icsFile(n));
  }

  fs.writeFileSync(path.join(WEB, 'feed.xml'), feed(webNotices));
  if (SITE_URL) {
    const pages = fs.readdirSync(PAGE_DIR).filter((f) => f.endsWith('.html')).sort();
    fs.writeFileSync(path.join(WEB, 'sitemap.xml'), sitemap(pages));
    fs.writeFileSync(path.join(WEB, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);
  }

  const byCat = CATEGORY_ORDER.map((c) => `${c} ${notices.filter((n) => n.category === c).length}`).join(', ');
  console.log(`공고 ${notices.length}건 (${byCat}) · 추가 API 호출 ${calls}회 · ${((Date.now() - started) / 1000).toFixed(1)}초`);
  if (errors.length === CATEGORY_ORDER.length) process.exit(1);
}

main().catch((e) => {
  console.error(`실패: ${errorMessage(e)}`);
  process.exit(1);
});
