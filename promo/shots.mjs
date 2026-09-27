// 광고에 넣을 실제 화면 찍기: 배포된 사이트를 휴대폰 크기(390×844, 3배 해상도)로 열어 캡처한다.
// node shots.mjs  →  shots/*.png
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const SITE = 'https://sj-gates.github.io/cheongyak-alarm';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const DETAIL = 'APT_2026000374_2026000374'; // 잔금대출·주변 실거래가·경쟁률이 다 있는 공고
fs.mkdirSync('shots', { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
// 위쪽 제목줄(sticky)이 요소 캡처에 겹치지 않게 고정을 푼다
const settle = () =>
  page
    .addStyleTag({ content: '.topbar { position: static !important; }' })
    .then(() => page.evaluate(() => document.fonts.ready))
    .then(() => new Promise((r) => setTimeout(r, 800)));

// 1) 공고 목록: 폰 화면 안에서 살짝 스크롤하는 장면용으로 길게
await page.goto(`${SITE}/`, { waitUntil: 'networkidle0' });
await settle();
await (await page.$('.tabbar')).screenshot({ path: 'shots/tabbar.png' });
// 하단 메뉴(고정)는 긴 캡처 중간에 찍히므로 숨기고, 광고에서 폰 아래에 따로 붙인다
await page.addStyleTag({ content: '.tabbar { display: none !important; }' });
await page.screenshot({ path: 'shots/list.png', clip: { x: 0, y: 0, width: 390, height: 1500 }, captureBeyondViewport: true });
// 광고(premium.html)에서 손가락이 누를 첫 공고의 찜(☆) 자리
const star = await page.evaluate(() => { const r = document.querySelector('.star-btn').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 + scrollY }; });
fs.writeFileSync('shots/meta.json', JSON.stringify({ star, width: 390 }));

// 2) 공고 상세의 카드들
await page.goto(`${SITE}/n/${DETAIL}.html`, { waitUntil: 'networkidle0' });
await settle();
async function cardAfter(title, file) {
  const handle = await page.evaluateHandle((t) => {
    const h = [...document.querySelectorAll('.section-title')].find((e) => e.textContent.trim().startsWith(t));
    return h?.nextElementSibling ?? null;
  }, title);
  const el = handle.asElement();
  if (!el) throw new Error(`카드를 못 찾음: ${title}`);
  await el.screenshot({ path: `shots/${file}.png` });
}
await cardAfter('잔금대출 예상', 'loan');
await cardAfter('주변 실거래가', 'trades');
await cardAfter('주변 청약 경쟁률', 'rates');

// 3) 찜 분석 탭: 이 공고를 찜한 상태로 열기
await page.evaluate(async (key) => {
  const d = await fetch('../data/notices.json').then((r) => r.json());
  const n = d.notices.find((x) => x.key === key);
  localStorage.setItem('cy.favorites', JSON.stringify({ [key]: n }));
}, DETAIL);
await page.goto(`${SITE}/#/analysis`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.an-sec', { timeout: 15000 });
await settle();
const card = await page.$('.an-card');
await card.screenshot({ path: 'shots/analysis.png' });

await browser.close();
for (const f of fs.readdirSync('shots')) console.log(f, fs.statSync(`shots/${f}`).size);
