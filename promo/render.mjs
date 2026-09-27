// ad.html → out/cheongyak-ad-12s.mp4 (1080×1920, 30fps, 약 12초, 효과음 포함). 길이는 ad.html 의 AD_SECONDS
//   node render.mjs            전체 렌더
//   node render.mjs --stills   확인용 장면 몇 장만 out/still-*.png 로
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import ffmpeg from 'ffmpeg-static';
import puppeteer from 'puppeteer-core';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FPS = 30;
const stillsOnly = process.argv.includes('--stills');

fs.mkdirSync('out', { recursive: true });
fs.rmSync('frames', { recursive: true, force: true });
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
for (let i = 0; i < total; i++) {
  await page.evaluate((x) => window.render(x), i / FPS);
  await page.screenshot({ path: `frames/f${String(i).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 95 });
  if (i % 60 === 0) console.log(`프레임 ${i}/${total}`);
}
await browser.close();
console.log(`프레임 완료 ${((Date.now() - started) / 1000).toFixed(0)}초`);

// ── 소리: 120BPM 비트 + 장면 효과음 (직접 합성) ──────────────────
const SR = 44100;
const buf = new Float32Array(Math.round(SR * SECONDS));
function add(start, dur, fn) {
  const s0 = Math.floor(start * SR);
  const n = Math.floor(dur * SR);
  for (let i = 0; i < n && s0 + i < buf.length; i++) buf[s0 + i] += fn(i / SR, i / n);
}
let seed = 7;
const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

const kick = (t0, amp = 0.9) =>
  add(t0, 0.4, (t) => Math.sin(2 * Math.PI * (48 * t + (90 * (1 - Math.exp(-28 * t))) / 28)) * Math.exp(-t * 8) * amp);
function hat(t0, amp = 0.12) {
  let prev = 0;
  add(t0, 0.06, (t) => {
    const x = noise();
    const y = x - prev; // 간단한 고역 통과
    prev = x;
    return y * Math.exp(-t * 70) * amp;
  });
}
const clap = (t0, amp = 0.22) => add(t0, 0.18, (t) => noise() * (Math.exp(-t * 35) + 0.6 * Math.exp(-Math.max(0, t - 0.012) * 40) * (t > 0.012 ? 1 : 0)) * amp);
const pop = (t0, f1, f2, amp = 0.35) =>
  add(t0, 0.12, (t) => Math.sin(2 * Math.PI * (f1 * t + ((f2 - f1) * t * t) / 0.24)) * Math.exp(-t * 28) * amp);
function bell(t0, f, amp = 0.4, decay = 3) {
  const partials = [[1, 1], [2.0, 0.45], [3.01, 0.22], [4.2, 0.1]];
  add(t0, 2.2, (t) =>
    partials.reduce((s, [m, a]) => s + Math.sin(2 * Math.PI * f * m * t) * a * Math.exp(-t * decay * m ** 0.6), 0) * Math.min(1, t / 0.004) * amp
  );
}
function whoosh(t0, dur, amp = 0.35) {
  let y = 0;
  add(t0, dur, (t, x) => {
    const a = 0.02 + 0.35 * Math.sin(Math.PI * x) ** 2; // 필터가 열렸다 닫힌다
    y += a * (noise() - y);
    return y * Math.sin(Math.PI * x) ** 2 * amp * 3;
  });
}
function pad(t0, dur, freqs, amp = 0.05) {
  add(t0, dur, (t, x) => {
    const env = Math.min(1, t / 0.6) * Math.min(1, (1 - x) * dur / 0.8);
    return freqs.reduce((s, f) => s + Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * f * 2 * t), 0) * env * amp * (0.85 + 0.15 * Math.sin(t * 6));
  });
}

// 1. 훅: 글자마다 뿅
pop(0.08, 520, 880);
pop(0.42, 600, 980);
pop(0.76, 680, 1100);
pop(1.02, 900, 1500, 0.25);
kick(0.0, 0.7);
kick(0.76, 0.7);
whoosh(1.45, 0.5);
// 2~4. 비트
for (let b = 2.0; b < 8.3 + E; b += 0.5) {
  if (b > 4.4 && b < 5.0) continue; // 띵동이 잘 들리게 잠깐 비움
  kick(b);
  hat(b + 0.25);
  if (Math.round((b - 2.0) / 0.5) % 2 === 1) clap(b, 0.16);
}
pad(1.8, 2.6, [130.8, 164.8, 196.0]); // C
pad(4.4, 2.2, [110.0, 130.8, 164.8]); // Am
pad(6.6, 1.8 + E, [87.3, 110.0, 130.8]); // F
bell(2.35, 1567.98, 0.08, 6); // 반짝(빛 지나갈 때)
// 3. 알림: 띵~동
bell(4.5, 1318.5, 0.5, 2.5);
bell(4.78, 1046.5, 0.5, 2.2);
// 4. 카드 착착
whoosh(6.45, 0.3, 0.3);
[6.72, 6.72 + 0.96, 6.72 + 1.92].forEach((s) => {
  whoosh(s - 0.08, 0.28, 0.22);
  pop(s + 0.22, 700, 1000, 0.18);
});
// 5. 끝: 반짝이는 화음
whoosh(8.2 + E, 0.35, 0.25);
[1046.5, 1318.5, 1568.0, 2093.0].forEach((f, i) => bell(8.46 + E + i * 0.07, f, 0.22, 1.6));
pad(8.45 + E, 1.55, [130.8, 164.8, 196.0, 261.6], 0.045);

// 정규화 + 부드러운 클리핑 → 16bit WAV
const peak = buf.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
const pcm = Buffer.alloc(44 + buf.length * 2);
pcm.write('RIFF', 0);
pcm.writeUInt32LE(36 + buf.length * 2, 4);
pcm.write('WAVEfmt ', 8);
pcm.writeUInt32LE(16, 16);
pcm.writeUInt16LE(1, 20);
pcm.writeUInt16LE(1, 22);
pcm.writeUInt32LE(SR, 24);
pcm.writeUInt32LE(SR * 2, 28);
pcm.writeUInt16LE(2, 32);
pcm.writeUInt16LE(16, 34);
pcm.write('data', 36);
pcm.writeUInt32LE(buf.length * 2, 40);
for (let i = 0; i < buf.length; i++) {
  const fadeOut = Math.min(1, (buf.length - i) / (SR * 0.3));
  pcm.writeInt16LE(Math.round(Math.tanh((buf[i] / peak) * 1.2) * 0.85 * fadeOut * 32767), 44 + i * 2);
}
fs.writeFileSync('out/audio.wav', pcm);

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
