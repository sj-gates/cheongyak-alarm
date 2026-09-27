// 링크 공유 미리보기 이미지(og:image) 만들기 → ../web/og.png (1200×630)
import puppeteer from 'puppeteer-core';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" rel="stylesheet">
<style>
  * { margin: 0; box-sizing: border-box; }
  body { width: 1200px; height: 630px; overflow: hidden; font-family: 'Pretendard', sans-serif; color: #fff;
    background: radial-gradient(120% 90% at 15% 10%, #5A8CFF 0%, #2F6BFF 45%, #1C4ACF 100%); display: flex; align-items: center; padding: 0 90px; gap: 64px; }
  .icon { flex: none; width: 240px; height: 240px; border-radius: 64px; background: #fff; display: flex; align-items: center; justify-content: center; box-shadow: 0 30px 70px rgba(0, 20, 80, 0.35); }
  h1 { font-size: 118px; font-weight: 900; letter-spacing: -4px; }
  p { font-size: 44px; font-weight: 700; margin-top: 14px; letter-spacing: -1px; opacity: 0.95; line-height: 1.3; }
  .tags { display: flex; gap: 12px; margin-top: 30px; }
  .tags span { font-size: 30px; font-weight: 800; padding: 10px 22px; border-radius: 999px; background: rgba(255, 255, 255, 0.18); }
</style></head><body>
  <div class="icon"><svg width="170" height="170" viewBox="0 0 64 64"><path d="M16 30L32 17l16 13v16a2 2 0 0 1-2 2h-9V37h-10v11h-9a2 2 0 0 1-2-2z" fill="#2F6BFF"/></svg></div>
  <div>
    <h1>청약알림</h1>
    <p>청약 공고 · 일정 · 분양가를 한눈에,<br>조건만 걸어두면 알아서 알림</p>
    <div class="tags"><span>실거래가</span><span>대출 예상</span><span>경쟁률</span><span>무료</span></div>
  </div>
</body></html>`;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle0' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: '../web/og.png' });
await browser.close();
console.log('web/og.png');
