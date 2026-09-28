// ad.html → out/cheongyak-ad-12s.mp4 (1080×1920, 30fps, 약 12초, 효과음 포함). 길이는 ad.html 의 AD_SECONDS
//   node render.mjs            전체 렌더
//   node render.mjs --stills   확인용 장면 몇 장만 out/still-*.png 로
//   node render.mjs --audio    화면(frames/)은 그대로 두고 배경음만 다시 만들어 입힌다
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import ffmpeg from 'ffmpeg-static';
import puppeteer from 'puppeteer-core';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FPS = 30;
const stillsOnly = process.argv.includes('--stills');
const audioOnly = process.argv.includes('--audio');

fs.mkdirSync('out', { recursive: true });
if (!audioOnly && !stillsOnly) fs.rmSync('frames', { recursive: true, force: true });
fs.mkdirSync('frames', { recursive: true });

// ── 화면 ────────────────────────────────────────────────────
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--force-color-profile=srgb'] });
const page = await browser.newPage();
await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(path.resolve('ad.html')).href, { waitUntil: 'networkidle0' });
await page.evaluate(() => window.adReady);
// 기능 카드 장면을 늘린 만큼(E) 끝 화면과 효과음이 뒤로 밀린다
const { SECONDS, E } = await page.evaluate(() => ({ SECONDS: window.AD_SECONDS, E: window.AD_EXT }));

if (stillsOnly) {
  for (const t of [0.95, 2.3, 5.3, 7.2, 8.2, 9.3, 10.0, 11.6]) {
    await page.evaluate((x) => window.render(x), t);
    await page.screenshot({ path: `out/still-${t.toFixed(2)}.png` });
  }
  await browser.close();
  console.log('stills 완료');
  process.exit(0);
}

const total = Math.round(FPS * SECONDS);
const started = Date.now();
for (let i = 0; i < (audioOnly ? 0 : total); i++) {
  await page.evaluate((x) => window.render(x), i / FPS);
  await page.screenshot({ path: `frames/f${String(i).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 95 });
  if (i % 60 === 0) console.log(`프레임 ${i}/${total}`);
}

// ── 소리: 브라우저 WebAudio 로 만든 배경음 (music-bright.js) ──────────────────
await page.addScriptTag({ path: 'music-bright.js' });
const wav = await page.evaluate((o) => window.renderBrightMusic(o), { seconds: SECONDS, ext: E });
fs.writeFileSync('out/audio.wav', Buffer.from(wav, 'base64'));
await browser.close();
if (!audioOnly) console.log(`프레임 완료 ${((Date.now() - started) / 1000).toFixed(0)}초`);

// ── 묶기 ────────────────────────────────────────────────────
const outFile = 'out/cheongyak-ad-12s.mp4';
execFileSync(
  ffmpeg,
  [
    '-y', '-loglevel', 'error',
    '-framerate', String(FPS), '-i', 'frames/f%04d.jpg',
    '-i', 'out/audio.wav',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
    '-c:a', 'aac', '-b:a', '192k',
    '-shortest', '-movflags', '+faststart',
    outFile,
  ],
  { stdio: 'inherit' }
);
console.log(`완료: ${outFile} (${(fs.statSync(outFile).size / 1024 / 1024).toFixed(1)}MB)`);
