// =====================================================================
//  music.js — 음악과 효과음을 코드로 직접 만들어요 (음악 파일 없음)
//  Web Audio API: 브라우저 안에 들어 있는 "전자 악기 세트"
//   - 오실레이터(Oscillator): 삐~ 소리를 내는 기본 음원 (사인, 세모, 네모 파형)
//   - 노이즈: 치익~ 소리. 필터를 걸면 하이햇, 박수 소리가 돼요
//   - 게인(Gain): 볼륨. 시간에 따라 줄이면 "똥~" 하고 사라지는 소리가 돼요
// =====================================================================

const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// 코드(화음) 이름 → 화음 음들 / 베이스 음 (MIDI 번호, 60 = 가운데 도)
const CHORDS = {
  C: { notes: [60, 64, 67], bass: 36 },
  G: { notes: [59, 62, 67], bass: 43 },
  Am: { notes: [57, 60, 64], bass: 45 },
  F: { notes: [57, 60, 65], bass: 41 },
  Em: { notes: [59, 64, 67], bass: 40 },
  Dm: { notes: [57, 62, 65], bass: 38 }
};

export class Music {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const comp = this.ctx.createDynamicsCompressor();
    comp.connect(this.ctx.destination);
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(comp);
    this.sfx = this.ctx.createGain(); // 효과음은 노래와 따로
    this.sfx.gain.value = 1;
    this.sfx.connect(comp);

    // 1초짜리 무작위 잡음 (박수·하이햇 재료)
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.song = null;
  }

  // 스피커에서 실제로 소리가 나는 시각 (출력 지연 보정)
  get now() {
    return this.ctx.currentTime - (this.ctx.outputLatency || 0) - (this.ctx.baseLatency || 0);
  }

  // ---------------- 악기들 ----------------
  _env(t, peak, attack, decay, dest) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(dest);
    return g;
  }
  _osc(type, freq, t, dur, dest) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }
  _noise(t, dur, dest) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.connect(dest);
    s.start(t, Math.random() * 0.5, dur + 0.05);
  }

  kick(t, dest) {
    const g = this._env(t, 0.9, 0.003, 0.22, dest);
    const o = this._osc('sine', 150, t, 0.25, g);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  }
  hat(t, v, dest) {
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    f.connect(this._env(t, 0.12 * v, 0.002, 0.05, dest));
    this._noise(t, 0.06, f);
  }
  bass(t, midi, dur, dest) {
    const g = this._env(t, 0.32, 0.01, dur, dest);
    this._osc('triangle', midiToHz(midi), t, dur, g);
  }
  stab(t, notes, dest) { // "뿅" 하는 짧은 화음 (오프비트 반주)
    for (const n of notes) {
      const g = this._env(t, 0.045, 0.005, 0.22, dest);
      this._osc('square', midiToHz(n), t, 0.25, g);
    }
  }
  bell(t, midi, dur, dest, vol = 0.16) { // 오르골 같은 멜로디 소리
    const hz = midiToHz(midi);
    const g = this._env(t, vol, 0.004, Math.max(0.35, dur * 1.4), dest);
    this._osc('sine', hz, t, dur * 1.5 + 0.3, g);
    const g2 = this._env(t, vol * 0.35, 0.002, 0.25, dest);
    this._osc('sine', hz * 2.01, t, 0.3, g2);
    const g3 = this._env(t, vol * 0.25, 0.004, dur, dest);
    this._osc('triangle', hz, t, dur, g3);
  }

  // 박수 소리: 아주 짧은 잡음 3번 + 꼬리
  clap(t, vol = 1, dest = this.sfx) {
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1400;
    f.Q.value = 1.1;
    const out = this.ctx.createGain();
    out.gain.value = vol;
    f.connect(out);
    out.connect(dest);
    for (const dt of [0, 0.011, 0.022]) {
      const g = this._env(t + dt, 0.9, 0.001, 0.012, f);
      this._noise(t + dt, 0.02, g);
    }
    this._noise(t + 0.03, 0.15, this._env(t + 0.03, 0.6, 0.001, 0.13, f));
  }
  ding(t) { // Perfect 효과음
    this.bell(t, 96, 0.15, this.sfx, 0.12);
  }
  boop(t) { // Miss 효과음
    const g = this._env(t, 0.12, 0.005, 0.18, this.sfx);
    const o = this._osc('triangle', 220, t, 0.2, g);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.18);
  }

  // 탬버린 "찰랑" (2, 4박에 넣으면 신나는 느낌)
  tamb(t, v, dest) {
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 5500;
    f.connect(this._env(t, 0.16 * v, 0.003, 0.14, dest));
    this._noise(t, 0.16, f);
  }
  // 반짝이는 칩튠 소리 (멜로디를 오르골과 겹쳐서 또랑또랑하게)
  chip(t, midi, dur, dest, vol = 0.05) {
    const g = this._env(t, vol, 0.004, Math.max(0.12, dur * 0.8), dest);
    this._osc('square', midiToHz(midi), t, dur, g);
  }

  // ---------------- 노래 만들기 ----------------
  // song: { bpm, tune(TUNES의 곡), bars(연주 마디 수), introBars, outroBars, style }
  //  - 인트로 1마디: 드럼 + 베이스 / 2마디(카운트): + 반주
  //  - 본곡: 동요 멜로디를 bars 마디 동안 반복 (두 번째 바퀴부터 아래 옥타브 화음 추가)
  play(song, startAt) {
    this.stop();
    const out = this.ctx.createGain();
    out.gain.value = 1;
    out.connect(this.master);
    this.song = out;

    const spb = 60 / song.bpm;                  // 한 박자 길이(초)
    const tune = song.tune;
    const len = tune.melody.length;             // 동요 한 바퀴 마디 수
    const totalBars = song.introBars + song.bars + song.outroBars;
    const busy = song.style !== 'easy';         // 보통 이상은 드럼을 더 촘촘하게

    for (let bar = 0; bar < totalBars; bar++) {
      const t0 = startAt + bar * 4 * spb;
      const inIntro = bar < song.introBars;
      const songBar = bar - song.introBars;
      const inOutro = songBar >= song.bars;

      if (inOutro) {
        if (songBar === song.bars) { // 마지막 "짠~"
          this.kick(t0, out);
          this.tamb(t0, 1, out);
          this.bass(t0, CHORDS.C.bass, 2.5, out);
          [60, 64, 67, 72].forEach((m, i) => this.bell(t0 + i * 0.07, m + 12, 2.0, out, 0.13));
        }
        continue;
      }

      // 이 마디의 코드 (인트로는 C → G로 기대감)
      const pair = inIntro ? (bar === 0 ? ['C', 'C'] : ['G', 'G']) : tune.chords[songBar % len];

      // 드럼: 쿵(1, 3박) + 치(8분) + 탬버린(2, 4박) / 보통 이상은 엇박 쿵 추가
      for (let b = 0; b < 4; b++) {
        if (b % 2 === 0) this.kick(t0 + b * spb, out);
        if (busy && b === 1) this.kick(t0 + (b + 0.5) * spb, out);
        if (b % 2 === 1) this.tamb(t0 + b * spb, 1, out);
        this.hat(t0 + b * spb, 0.8, out);
        this.hat(t0 + (b + 0.5) * spb, 0.55, out);
      }

      // 통통 튀는 베이스: 근음 → 한 옥타브 위 → 5도 → 한 옥타브 위
      for (let half = 0; half < 2; half++) {
        const c = CHORDS[pair[half]];
        const h0 = t0 + half * 2 * spb;
        this.bass(h0, c.bass, spb * 0.45, out);
        this.bass(h0 + spb * 0.5, c.bass + 12, spb * 0.3, out);
        this.bass(h0 + spb, c.bass + 7, spb * 0.45, out);
        this.bass(h0 + spb * 1.5, c.bass + 12, spb * 0.3, out);
      }
      if (bar === 0) continue; // 첫 마디는 드럼 + 베이스만

      // 엇박 반주 "뿅뿅" (신나는 느낌의 핵심)
      for (let b = 0; b < 4; b++) this.stab(t0 + (b + 0.5) * spb, CHORDS[pair[b < 2 ? 0 : 1]].notes, out);

      // 멜로디: 오르골 + 칩튠을 겹쳐서 또렷하게
      if (!inIntro) {
        const loop = Math.floor(songBar / len);
        for (const [beat, dur, m] of tune.melody[songBar % len]) {
          const t = t0 + beat * spb;
          this.bell(t, m, dur * spb, out, 0.15);
          this.chip(t, m, dur * spb * 0.9, out, 0.035);
          if (loop % 2 === 1) this.bell(t, m - 12, dur * spb, out, 0.07); // 두 번째 바퀴: 아래 옥타브 화음
        }
      }
    }
  }

  // ---------------- 큐티 목소리 (녹음한 음성 파일) ----------------
  // map: { perfect: './voices/perfect.mp3', ... } → 파일을 미리 불러서 소리 데이터로 바꿔 둠
  async loadVoices(map) {
    this.voices = this.voices || {};
    await Promise.all(Object.entries(map).map(async ([key, url]) => {
      try {
        const res = await fetch(url);
        const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
        // 녹음 앞부분의 조용한 구간을 찾아서 건너뛰기 (판정과 목소리가 바로 붙어 나오게)
        const d = buf.getChannelData(0);
        let i = 0;
        while (i < d.length && Math.abs(d[i]) < 0.02) i++;
        this.voices[key] = { buf, offset: Math.max(0, i / buf.sampleRate - 0.02) };
      } catch (err) {
        console.warn('음성 파일을 불러오지 못했어요:', url, err);
      }
    }));
  }

  // important = true(Miss)면 앞의 말을 끊고 바로 말함
  // 아니면, 앞의 말이 아직 끝나지 않았을 때는 건너뜀 (빠른 박자에서 말이 겹치지 않게)
  say(key, important = false) {
    const v = this.voices && this.voices[key];
    if (!v) return;
    const now = this.ctx.currentTime;
    if (this.voiceSrc && now < this.voiceEnd) {
      if (!important) return;
      try { this.voiceSrc.stop(); } catch {}
    }
    const src = this.ctx.createBufferSource();
    src.buffer = v.buf;
    const g = this.ctx.createGain();
    g.gain.value = 1.0; // 목소리 크기
    src.connect(g);
    g.connect(this.sfx);
    src.start(now, v.offset);
    this.voiceSrc = src;
    this.voiceEnd = now + (v.buf.duration - v.offset) * 0.8; // 끝부분 여운은 다음 말과 겹쳐도 괜찮게
  }

  stop() {
    if (!this.song) return;
    const g = this.song;
    g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    setTimeout(() => g.disconnect(), 400);
    this.song = null;
  }
}
