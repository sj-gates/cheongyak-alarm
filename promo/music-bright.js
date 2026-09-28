// 밝은 광고(ad.html)의 배경음. 브라우저 WebAudio 로 오프라인 렌더한다 (render.mjs 가 불러 씀).
//
// 120BPM · 트로피컬 하우스/팝 느낌
//   0 ~ 2초      빌드업: 필터가 닫힌 화음 → 열림, 글자마다 올라가는 플럭, 스네어 롤, 상승음, 드롭 직전 잠깐 멈춤
//   2초 ~ 끝화면  드롭: Fmaj7 → G6 → Em7 → Am7 (IV–V–iii–vi), 네 박 킥, 사이드체인 펌핑, 3-3-2 플럭 리프
//   끝 화면       Cmaj9 로 착지 + 반짝이는 아르페지오, 리버브 잔향으로 마무리
// 믹싱: 스테레오, 리버브·핑퐁 딜레이, 글루 컴프레서 → 리미터, 마지막에 -1dBFS 로 맞춘다.
(() => {
  const BPM = 120;
  const BEAT = 60 / BPM;
  const BAR = BEAT * 4;
  const S16 = BEAT / 4;
  const hz = (n) => 440 * 2 ** ((n - 69) / 12);

  // 코드 보이싱 (MIDI): 패드 · 베이스 뿌리음 · 플럭 리프(3-3-2 리듬 16분 위치별 음)
  const PAD = {
    Fmaj7: [53, 60, 64, 69],
    G6: [55, 59, 62, 64],
    Em7: [52, 59, 62, 67],
    Am7: [57, 60, 64, 67],
    Cmaj9: [48, 55, 59, 62, 64],
  };
  const ROOT = { Fmaj7: 29, G6: 31, Em7: 28, Am7: 33, Cmaj9: 36 };
  const RIFF_STEPS = [0, 3, 6, 8, 11, 14];
  const RIFF = {
    Fmaj7: [76, 72, 69, 72, 76, 79],
    G6: [74, 71, 67, 71, 74, 76],
    Em7: [71, 67, 64, 67, 71, 74],
    Am7: [76, 72, 69, 72, 76, 79],
  };

  function impulse(ac, dur, decay) {
    const len = Math.floor(ac.sampleRate * dur);
    const b = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let seed = c ? 7919 : 104729;
      for (let i = 0; i < len; i++) {
        seed = (seed * 16807) % 2147483647;
        d[i] = (seed / 2147483647 * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return b;
  }

  window.renderBrightMusic = async ({ seconds, ext }) => {
    const sr = 48000;
    const ac = new OfflineAudioContext(2, Math.ceil(sr * seconds), sr);
    const endAt = 8.4 + ext; // 끝 화면 시작

    // ── 마스터: 에어(고음 살짝) → 글루 컴프 → 리미터 ──
    const master = ac.createGain();
    master.gain.setValueAtTime(0.85, 0);
    master.gain.setValueAtTime(0.85, seconds - 0.35);
    master.gain.linearRampToValueAtTime(0, seconds);
    const air = new BiquadFilterNode(ac, { type: 'highshelf', frequency: 9000, gain: 2.5 });
    const lowcut = new BiquadFilterNode(ac, { type: 'highpass', frequency: 28 });
    const glue = new DynamicsCompressorNode(ac, { threshold: -16, ratio: 3, attack: 0.008, release: 0.16, knee: 8 });
    const limiter = new DynamicsCompressorNode(ac, { threshold: -3, ratio: 20, attack: 0.001, release: 0.08, knee: 0 });
    master.connect(lowcut).connect(air).connect(glue).connect(limiter).connect(ac.destination);

    const drums = new GainNode(ac, { gain: 0.95 });
    drums.connect(master);
    const music = new GainNode(ac, { gain: 1 }); // 사이드체인 펌핑이 걸리는 버스
    const pump = new GainNode(ac, { gain: 1 });
    music.connect(pump).connect(master);
    const fx = new GainNode(ac, { gain: 0.9 });
    fx.connect(master);

    // 리버브
    const reverb = new ConvolverNode(ac, { buffer: impulse(ac, 2.4, 3.2) });
    const revSend = new GainNode(ac, { gain: 1 });
    revSend.connect(reverb).connect(new BiquadFilterNode(ac, { type: 'highpass', frequency: 280 })).connect(new GainNode(ac, { gain: 0.5 })).connect(master);
    // 핑퐁 딜레이 (점8분)
    const delaySend = new GainNode(ac, { gain: 1 });
    const dl = new DelayNode(ac, { maxDelayTime: 2, delayTime: BEAT * 0.75 });
    const dr = new DelayNode(ac, { maxDelayTime: 2, delayTime: BEAT * 0.75 });
    const dtone = new BiquadFilterNode(ac, { type: 'lowpass', frequency: 4200 });
    const fb = new GainNode(ac, { gain: 0.36 });
    const delayOut = new GainNode(ac, { gain: 0.32 });
    delaySend.connect(dl).connect(dtone);
    dtone.connect(new StereoPannerNode(ac, { pan: -0.75 })).connect(delayOut);
    dtone.connect(dr);
    dr.connect(new StereoPannerNode(ac, { pan: 0.75 })).connect(delayOut);
    dr.connect(fb).connect(dl);
    delayOut.connect(pump);

    // 노이즈
    const nb = ac.createBuffer(1, sr * 2, sr);
    {
      const d = nb.getChannelData(0);
      let seed = 12345;
      for (let i = 0; i < d.length; i++) {
        seed = (seed * 16807) % 2147483647;
        d[i] = seed / 2147483647 * 2 - 1;
      }
    }
    const noise = (t, dur) => {
      const n = new AudioBufferSourceNode(ac, { buffer: nb, loop: true });
      n.start(t, (t * 0.37) % 1.5);
      n.stop(t + dur);
      return n;
    };
    const sat = new Float32Array(1024).map((_, i) => Math.tanh(((i / 1023) * 2 - 1) * 2.2));

    // ── 드럼 ──
    function kick(t, v = 1, duck = true) {
      const o = new OscillatorNode(ac, { type: 'sine' });
      o.frequency.setValueAtTime(170, t);
      o.frequency.exponentialRampToValueAtTime(54, t + 0.07);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.35);
      const g = new GainNode(ac, { gain: 0.0001 });
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
      o.connect(new WaveShaperNode(ac, { curve: sat })).connect(g).connect(drums);
      o.start(t);
      o.stop(t + 0.45);
      const c = new GainNode(ac, { gain: 0 });
      c.gain.setValueAtTime(v * 0.28, t);
      c.gain.exponentialRampToValueAtTime(0.0001, t + 0.014);
      noise(t, 0.02).connect(new BiquadFilterNode(ac, { type: 'highpass', frequency: 2500 })).connect(c).connect(drums);
      if (duck) {
        pump.gain.setValueAtTime(0.32, t);
        pump.gain.setTargetAtTime(1, t + 0.02, 0.075);
      }
    }
    function clap(t, v = 0.5) {
      const bp = new BiquadFilterNode(ac, { type: 'bandpass', frequency: 1450, Q: 0.9 });
      const g = new GainNode(ac, { gain: 0 });
      [0, 0.011, 0.022].forEach((o) => {
        g.gain.setValueAtTime(v, t + o);
        g.gain.exponentialRampToValueAtTime(v * 0.08, t + o + 0.009);
      });
      g.gain.setValueAtTime(v * 0.7, t + 0.033);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      noise(t, 0.22).connect(bp).connect(g);
      g.connect(drums);
      g.connect(new GainNode(ac, { gain: 0.35 })).connect(revSend);
    }
    function snare(t, v = 0.4) {
      const g = new GainNode(ac, { gain: 0 });
      g.gain.setValueAtTime(v, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      noise(t, 0.13).connect(new BiquadFilterNode(ac, { type: 'bandpass', frequency: 2200, Q: 0.7 })).connect(g);
      const o = new OscillatorNode(ac, { type: 'triangle', frequency: 200 });
      o.frequency.exponentialRampToValueAtTime(165, t + 0.06);
      const og = new GainNode(ac, { gain: 0 });
      og.gain.setValueAtTime(v * 0.6, t);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + 0.1);
      g.connect(drums);
      g.connect(new GainNode(ac, { gain: 0.3 })).connect(revSend);
    }
    function hat(t, v = 0.12, open = false, pan = 0) {
      const g = new GainNode(ac, { gain: 0 });
      g.gain.setValueAtTime(v, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (open ? 0.2 : 0.04));
      noise(t, open ? 0.22 : 0.05)
        .connect(new BiquadFilterNode(ac, { type: 'highpass', frequency: open ? 6500 : 8000 }))
        .connect(g)
        .connect(new StereoPannerNode(ac, { pan }))
        .connect(drums);
    }
    function crash(t, v = 0.3) {
      const g = new GainNode(ac, { gain: 0 });
      g.gain.setValueAtTime(v, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
      noise(t, 2.3).connect(new BiquadFilterNode(ac, { type: 'highpass', frequency: 4200 })).connect(g);
      g.connect(fx);
      g.connect(new GainNode(ac, { gain: 0.4 })).connect(revSend);
    }
    function subDrop(t, v = 0.7) {
      const o = new OscillatorNode(ac, { type: 'sine', frequency: 110 });
      o.frequency.exponentialRampToValueAtTime(30, t + 1.0);
      const g = new GainNode(ac, { gain: 0 });
      g.gain.setValueAtTime(v, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
      o.connect(g).connect(fx);
      o.start(t);
      o.stop(t + 1.35);
    }
    function riser(t0, t1, v = 0.22) {
      const bp = new BiquadFilterNode(ac, { type: 'bandpass', Q: 1.6, frequency: 300 });
      bp.frequency.setValueAtTime(300, t0);
      bp.frequency.exponentialRampToValueAtTime(7500, t1);
      const g = new GainNode(ac, { gain: 0 });
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(v, t1);
      g.gain.linearRampToValueAtTime(0, t1 + 0.03);
      noise(t0, t1 - t0 + 0.05).connect(bp).connect(g).connect(fx);
      g.connect(new GainNode(ac, { gain: 0.3 })).connect(revSend);
    }
    function whoosh(t, dur, v = 0.14) {
      const bp = new BiquadFilterNode(ac, { type: 'bandpass', Q: 1.2, frequency: 500 });
      bp.frequency.setValueAtTime(500, t);
      bp.frequency.exponentialRampToValueAtTime(3500, t + dur * 0.6);
      bp.frequency.exponentialRampToValueAtTime(900, t + dur);
      const g = new GainNode(ac, { gain: 0 });
      g.gain.linearRampToValueAtTime(v, t + dur * 0.55);
      g.gain.linearRampToValueAtTime(0, t + dur);
      const p = new StereoPannerNode(ac, { pan: -0.5 });
      p.pan.linearRampToValueAtTime(0.5, t + dur);
      noise(t, dur + 0.02).connect(bp).connect(g).connect(p).connect(fx);
    }

    // ── 악기 ──
    /** 넓은 신스 화음(슈퍼소우): 음마다 톱니파 5겹을 조금씩 어긋나게 쌓고 좌우로 펼친다 */
    function pad(t0, dur, name, v = 0.03, cutoff = [2600, 2600], ring = false) {
      const lp = new BiquadFilterNode(ac, { type: 'lowpass', Q: 0.6, frequency: cutoff[0] });
      lp.frequency.setValueAtTime(cutoff[0], t0);
      lp.frequency.exponentialRampToValueAtTime(cutoff[1], t0 + dur);
      const g = new GainNode(ac, { gain: 0 });
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(v, t0 + 0.03);
      if (ring) {
        g.gain.setTargetAtTime(0, t0 + 0.08, dur / 4); // 쳐 놓고 자연스럽게 잦아든다
      } else {
        g.gain.setValueAtTime(v, t0 + dur - 0.06);
        g.gain.linearRampToValueAtTime(0, t0 + dur);
      }
      lp.connect(g);
      g.connect(music);
      g.connect(new GainNode(ac, { gain: 0.35 })).connect(revSend);
      for (const n of PAD[name]) {
        for (const d of [-18, -9, 0, 9, 18]) {
          const o = new OscillatorNode(ac, { type: 'sawtooth', frequency: hz(n), detune: d });
          o.connect(new StereoPannerNode(ac, { pan: d / 26 })).connect(lp);
          o.start(t0);
          o.stop(t0 + dur + 0.02);
        }
      }
    }
    /** 필터로 다듬은 플럭 (리프·반짝이 공용) */
    function pluck(t, n, v = 0.1, pan = 0, send = 0.4) {
      const lp = new BiquadFilterNode(ac, { type: 'lowpass', Q: 2.2, frequency: 5200 });
      lp.frequency.setValueAtTime(5200, t);
      lp.frequency.exponentialRampToValueAtTime(900, t + 0.18);
      const g = new GainNode(ac, { gain: 0 });
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
      [['square', 0, 0.55], ['sawtooth', 7, 0.45], ['triangle', 1200, 0.35]].forEach(([type, detune, a]) => {
        const o = new OscillatorNode(ac, { type, frequency: hz(n), detune });
        o.connect(new GainNode(ac, { gain: a })).connect(lp);
        o.start(t);
        o.stop(t + 0.36);
      });
      const p = new StereoPannerNode(ac, { pan });
      lp.connect(g).connect(p);
      p.connect(music);
      p.connect(new GainNode(ac, { gain: send })).connect(delaySend);
      p.connect(new GainNode(ac, { gain: 0.3 })).connect(revSend);
    }
    /** 서브(사인) + 중저음(톱니파, 필터) 베이스 */
    function bass(t, dur, n, v = 0.32) {
      const g = new GainNode(ac, { gain: 0 });
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + 0.006);
      g.gain.setValueAtTime(v, t + dur - 0.03);
      g.gain.linearRampToValueAtTime(0, t + dur);
      const sub = new OscillatorNode(ac, { type: 'sine', frequency: hz(n + 12) });
      const mid = new OscillatorNode(ac, { type: 'sawtooth', frequency: hz(n + 24) });
      const lp = new BiquadFilterNode(ac, { type: 'lowpass', frequency: 520, Q: 1.1 });
      sub.connect(g);
      mid.connect(new GainNode(ac, { gain: 0.35 })).connect(lp).connect(g);
      g.connect(music);
      [sub, mid].forEach((o) => {
        o.start(t);
        o.stop(t + dur + 0.02);
      });
    }
    /** 부드러운 마림바 느낌 (알림음·끝 반짝이) */
    function mallet(t, n, v = 0.1) {
      [[1, 1, 0.9], [4, 0.22, 0.25], [9.9, 0.06, 0.08]].forEach(([m, a, dec]) => {
        const o = new OscillatorNode(ac, { type: 'sine', frequency: hz(n) * m });
        const g = new GainNode(ac, { gain: 0 });
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(v * a, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
        o.connect(g);
        g.connect(fx);
        g.connect(new GainNode(ac, { gain: 0.4 })).connect(revSend);
        o.start(t);
        o.stop(t + dec + 0.02);
      });
    }

    // ── 1. 빌드업 (0 ~ 2초) ──
    subDrop(0, 0.35);
    pad(0, 1.94, 'Fmaj7', 0.022, [320, 2800]); // 필터가 천천히 열린다
    for (let i = 0; i < 16; i++) {
      const t = i * S16 * 2;
      if (RIFF_STEPS.includes(i % 16)) pluck(t, RIFF.Fmaj7[RIFF_STEPS.indexOf(i % 16)] - 12, 0.05, (i % 2 ? 0.3 : -0.3), 0.5);
    }
    // 글자가 뜰 때마다 한 음씩 올라간다 (C6 E6 G6 C7)
    [[0.08, 84], [0.42, 88], [0.76, 91], [1.02, 96]].forEach(([t, n]) => pluck(t, n, 0.07, 0, 0.6));
    // 스네어 롤: 8분 → 16분 → 32분, 점점 크게
    const roll = [];
    for (let t = 1.0; t < 1.5; t += BEAT / 2) roll.push(t);
    for (let t = 1.5; t < 1.75; t += S16) roll.push(t);
    for (let t = 1.75; t < 1.94; t += S16 / 2) roll.push(t);
    roll.forEach((t, i) => snare(t, 0.08 + (i / roll.length) * 0.3));
    riser(0.7, 1.94, 0.2);
    whoosh(1.45, 0.5, 0.1);

    // ── 2. 드롭 (2초 ~ 끝 화면) ──
    kick(2.0, 1.1);
    crash(2.0, 0.28);
    subDrop(2.0, 0.55);
    const order = ['Fmaj7', 'G6', 'Em7', 'Am7'];
    for (let b = 0; 2.0 + (b + 1) * BAR <= endAt + 0.01; b++) {
      const t0 = 2.0 + b * BAR;
      const name = order[b % 4];
      pad(t0, BAR, name, 0.03);
      for (let s = 0; s < 16; s++) {
        const t = t0 + s * S16;
        if (s % 4 === 0 && !(b === 0 && s === 0)) kick(t, 1);
        if (s % 8 === 4) clap(t, 0.42);
        if (s % 4 === 2) hat(t, 0.1, true, 0.25);
        else hat(t, s % 2 ? 0.05 : 0.07, false, -0.2);
        const ri = RIFF_STEPS.indexOf(s);
        if (ri >= 0) pluck(t, RIFF[name][ri], 0.085, ri % 2 ? 0.35 : -0.35);
        if (s % 4 === 2) bass(t, S16 * 1.8, ROOT[name]); // 뒷박 베이스 (펌핑과 맞물려 통통 튄다)
      }
      bass(t0 + 15 * S16, S16 * 0.9, ROOT[order[(b + 1) % 4]] + 12, 0.18); // 다음 마디로 넘어가는 한 음
      // 마디 끝 필: 스네어 16분 네 번
      if (b % 2 === 1) [12, 13, 14, 15].forEach((s, i) => snare(t0 + s * S16, 0.1 + i * 0.05));
    }
    // 알림 띵동: 작게, 공간감 있게
    mallet(4.5, 88, 0.09);
    mallet(4.78, 84, 0.09);
    // 카드 장면 전환과 카드 들어올 때
    whoosh(6.4, 0.35, 0.1);
    [6.72, 6.72 + 0.96, 6.72 + 1.92].forEach((t) => whoosh(t - 0.1, 0.32, 0.07));
    // 끝 화면 앞: 상승음 + 드롭 직전 잠깐 멈춤
    riser(endAt - 1.3, endAt, 0.18);
    pump.gain.setValueAtTime(1, endAt - 0.08);
    pump.gain.linearRampToValueAtTime(0.15, endAt - 0.02);

    // ── 3. 끝: Cmaj9 착지 ──
    const hit = endAt + 0.06;
    pump.gain.setValueAtTime(1, hit);
    kick(hit, 1.15, false);
    crash(hit, 0.3);
    subDrop(hit, 0.5);
    bass(hit, 0.45, ROOT.Cmaj9, 0.3);
    const endPad = seconds - hit - 0.1;
    pad(hit, endPad, 'Cmaj9', 0.036, [5500, 700], true);
    [72, 76, 79, 83, 86, 91].forEach((n, i) => pluck(hit + 0.12 + i * S16, n, 0.07, i % 2 ? 0.4 : -0.4, 0.55));
    mallet(hit + 0.12, 96, 0.05);

    const buf = await ac.startRendering();
    // -1dBFS 로 맞추고 16bit 스테레오 WAV 로
    const ch = [buf.getChannelData(0), buf.getChannelData(1)];
    let peak = 0;
    for (const c of ch) for (let i = 0; i < c.length; i++) peak = Math.max(peak, Math.abs(c[i]));
    const k = peak ? 0.89 / peak : 1;
    const n = buf.length;
    const out = new DataView(new ArrayBuffer(44 + n * 4));
    const w = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF');
    out.setUint32(4, 36 + n * 4, true);
    w(8, 'WAVEfmt ');
    out.setUint32(16, 16, true);
    out.setUint16(20, 1, true);
    out.setUint16(22, 2, true);
    out.setUint32(24, sr, true);
    out.setUint32(28, sr * 4, true);
    out.setUint16(32, 4, true);
    out.setUint16(34, 16, true);
    w(36, 'data');
    out.setUint32(40, n * 4, true);
    for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) out.setInt16(44 + i * 4 + c * 2, Math.max(-1, Math.min(1, ch[c][i] * k)) * 32767, true);
    const u = new Uint8Array(out.buffer);
    let s = '';
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  };
})();
