// premium.html(공스코어 톤) → out/청약알림_광고_15초.mp4 + out/청약알림_광고_표지.png
//   node render-premium.mjs            전체
//   node render-premium.mjs --stills   확인용 장면 모음 out/premium-stills.jpg
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

import ffmpeg from 'ffmpeg-static';
import puppeteer from 'puppeteer-core';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FPS = 30;
const DUR = 15;
const stillsOnly = process.argv.includes('--stills');

// 캔버스에 캡처 그림을 그린 뒤 toDataURL 하려면 같은 출처여야 해서 promo/ 를 잠깐 로컬 서버로 연다
const TYPES = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.json': 'application/json', '.js': 'text/javascript' };
const server = http.createServer((req, res) => {
  const file = path.join(process.cwd(), decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(process.cwd()) || !fs.existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.setViewport({ width: 540, height: 960 });
await page.goto(`${base}/premium.html`, { waitUntil: 'networkidle0' });
fs.mkdirSync('out', { recursive: true });
const save = (file, b64) => fs.writeFileSync(file, Buffer.from(b64, 'base64'));

if (stillsOnly) {
  const times = [1.2, 2.8, 4.6, 5.9, 7.2, 7.75, 8.7, 9.45, 10.6, 11.2, 12.3, 13.2, 14.0, 14.9, 3.0];
  save('out/premium-stills.jpg', await page.evaluate((ts) => window.STILLS(ts), times));
  console.log('out/premium-stills.jpg');
} else {
  fs.rmSync('frames2', { recursive: true, force: true });
  fs.mkdirSync('frames2', { recursive: true });
  const started = Date.now();
  const total = FPS * DUR;
  for (let i = 0; i < total; i++) {
    save(`frames2/f${String(i).padStart(4, '0')}.jpg`, await page.evaluate((t) => window.FRAME_JPG(t), i / FPS));
    if (i % 90 === 0) console.log(`프레임 ${i}/${total}`);
  }
  console.log(`프레임 완료 ${((Date.now() - started) / 1000).toFixed(0)}초`);
  save('out/premium-audio.wav', await page.evaluate(() => window.AUDIO_WAV()));
  save('out/청약알림_광고_표지.png', await page.evaluate(() => window.FRAME_PNG(14.9)));

  const outFile = 'out/청약알림_광고_15초.mp4';
  execFileSync(ffmpeg, [
    '-y', '-loglevel', 'error',
    '-framerate', String(FPS), '-i', 'frames2/f%04d.jpg',
    '-i', 'out/premium-audio.wav',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
    '-c:a', 'aac', '-b:a', '192k',
    '-t', String(DUR), '-movflags', '+faststart',
    outFile,
  ], { stdio: 'inherit' });
  console.log(`완료: ${outFile} (${(fs.statSync(outFile).size / 1024 / 1024).toFixed(1)}MB)`);
}
await browser.close();
server.close();
