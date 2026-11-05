// ============================================================
// Som da aba Games: trilha de fundo e efeitos.
// ------------------------------------------------------------
// Nada de arquivo de música: tudo é SINTETIZADO na hora pelo próprio
// navegador (Web Audio API), no estilo dos videogames de 8 bits.
// Por que assim?
//   • Direitos autorais: a música é nossa, gerada por código.
//   • Peso zero: não há MP3 para baixar no 4G do aluno.
//   • Controle fino: o efeito de acerto sai no milissegundo certo.
//
// Os navegadores só deixam tocar som depois que a pessoa toca na
// tela (regra contra sites que gritam sozinhos). Por isso o motor
// "destrava" no primeiro toque e, até lá, fica em silêncio.
//
// A escolha de música/efeitos ligados fica salva no aparelho.
// ============================================================

type TrackName = 'lobby' | 'quiz' | 'draw';
type Sfx =
  | 'click' | 'pop' | 'join' | 'tick' | 'tock' | 'correct' | 'wrong' | 'whoosh' | 'countdown' | 'go'
  | 'fanfare' | 'coin' | 'reveal' | 'guess' | 'close' | 'timeup' | 'start' | 'react';

const PREFS_KEY = 'freedom_games_audio_v1';
const loadPrefs = (): { music: boolean; sfx: boolean } => {
  try { const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); return { music: p.music !== false, sfx: p.sfx !== false }; }
  catch { return { music: true, sfx: true }; }
};

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

// ── Trilhas ──────────────────────────────────────────────────
// Cada trilha: andamento (bpm) e 4 compassos de 16 passos (semicolcheias).
// Números são notas MIDI (60 = Dó central); null = pausa.
interface Track {
  bpm: number; lead: (number | null)[]; bass: (number | null)[];
  kick: number[]; snare: number[]; hat: number[]; leadWave: OscillatorType; leadVol: number; swing?: number;
}
const _ = null;
const bars = (...b: (number | null)[][]) => b.flat();
const TRACKS: Record<TrackName, Track> = {
  // Saguão: alegre e saltitante (Dó maior: C – Am – F – G).
  lobby: {
    bpm: 112, leadWave: 'square', leadVol: 0.05, swing: 0.08,
    lead: bars(
      [72, _, 76, _, 79, _, 76, _, 74, _, 72, _, 76, _, _, _],
      [69, _, 72, _, 76, _, 72, _, 74, _, 76, _, 72, _, _, _],
      [65, _, 69, _, 72, _, 77, _, 76, _, 74, _, 72, _, 69, _],
      [67, _, 71, _, 74, _, 79, _, 77, _, 74, _, 71, _, 74, _],
    ),
    bass: bars(
      [48, _, _, _, _, _, 48, _, 55, _, 60, _, _, _, 55, _],
      [45, _, _, _, _, _, 45, _, 52, _, 57, _, _, _, 52, _],
      [41, _, _, _, _, _, 41, _, 48, _, 53, _, _, _, 48, _],
      [43, _, _, _, _, _, 43, _, 50, _, 55, _, _, _, 50, _],
    ),
    kick: [0, 8], snare: [4, 12], hat: [2, 6, 10, 14],
  },
  // Quiz: energético, dá sensação de "valendo!" (Lá menor: Am – F – C – G).
  quiz: {
    bpm: 132, leadWave: 'square', leadVol: 0.04,
    lead: bars(
      [69, 72, 76, 72, 69, 72, 76, 79, 77, 76, 72, 76, 74, 72, 71, 72],
      [65, 69, 72, 69, 65, 69, 72, 77, 76, 72, 69, 72, 74, 72, 69, 72],
      [72, 76, 79, 76, 72, 76, 79, 84, 83, 79, 76, 79, 77, 76, 74, 76],
      [67, 71, 74, 71, 67, 71, 74, 79, 77, 74, 71, 74, 76, 74, 72, 71],
    ),
    bass: bars(
      [45, _, 45, _, 57, _, 45, _, 45, _, 45, _, 57, _, 52, _],
      [41, _, 41, _, 53, _, 41, _, 41, _, 41, _, 53, _, 48, _],
      [48, _, 48, _, 60, _, 48, _, 48, _, 48, _, 60, _, 55, _],
      [43, _, 43, _, 55, _, 43, _, 43, _, 43, _, 55, _, 50, _],
    ),
    kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14, 15],
  },
  // Draw It!: tranquilo, para concentrar no desenho (Fá maior).
  draw: {
    bpm: 94, leadWave: 'triangle', leadVol: 0.07, swing: 0.12,
    lead: bars(
      [77, _, _, 76, 74, _, 72, _, 74, _, _, _, 69, _, _, _],
      [70, _, _, 72, 74, _, 77, _, 76, _, _, _, 72, _, _, _],
      [77, _, _, 79, 81, _, 79, _, 77, _, _, 76, 74, _, _, _],
      [72, _, 74, _, 76, _, 79, _, 77, _, _, _, _, _, _, _],
    ),
    bass: bars(
      [41, _, _, _, 48, _, _, _, 53, _, _, _, 48, _, _, _],
      [46, _, _, _, 53, _, _, _, 58, _, _, _, 53, _, _, _],
      [38, _, _, _, 45, _, _, _, 50, _, _, _, 45, _, _, _],
      [36, _, _, _, 43, _, _, _, 48, _, _, _, 43, _, _, _],
    ),
    kick: [0, 10], snare: [8], hat: [4, 12],
  },
};

class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private prefs = loadPrefs();
  private track: TrackName | null = null;
  private step = 0;
  private nextTime = 0;
  private timer: number | null = null;
  private listeners = new Set<() => void>();
  private unlockBound = false;
  private ducked = false;

  get music() { return this.prefs.music; }
  get sfx() { return this.prefs.sfx; }

  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit() { this.listeners.forEach((f) => f()); }
  private save() { try { localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs)); } catch { /* aba anônima */ } }

  // Prepara o motor e destrava no primeiro toque na tela.
  init() {
    if (this.unlockBound || typeof window === 'undefined') return;
    this.unlockBound = true;
    const unlock = () => { this.ensure(); this.ctx?.resume().catch(() => {}); };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
  }

  private ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(ctx.destination);
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = this.prefs.music ? 0.55 : 0; this.musicBus.connect(this.master);
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = this.prefs.sfx ? 0.8 : 0; this.sfxBus.connect(this.master);
    // Ruído branco (base de chimbal, caixa e "whoosh").
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    if (this.track) this.startScheduler();
    return ctx;
  }

  setMusic(on: boolean) {
    this.prefs.music = on; this.save();
    if (this.musicBus && this.ctx) this.musicBus.gain.setTargetAtTime(on ? (this.ducked ? 0.15 : 0.55) : 0, this.ctx.currentTime, 0.15);
    this.emit();
  }
  setSfx(on: boolean) {
    this.prefs.sfx = on; this.save();
    if (this.sfxBus && this.ctx) this.sfxBus.gain.setTargetAtTime(on ? 0.8 : 0, this.ctx.currentTime, 0.05);
    this.emit();
  }
  // Abaixa a música (ex.: enquanto o Listening fala a frase).
  duck(on: boolean) {
    this.ducked = on;
    if (this.musicBus && this.ctx && this.prefs.music) this.musicBus.gain.setTargetAtTime(on ? 0.15 : 0.55, this.ctx.currentTime, 0.2);
  }

  // ── Trilha ─────────────────────────────────────────────────
  play(name: TrackName | null) {
    if (this.track === name) return;
    this.track = name;
    if (!name) { this.stopScheduler(); return; }
    this.step = 0;
    if (this.ctx) this.startScheduler();
  }
  private startScheduler() {
    if (!this.ctx || this.timer !== null) return;
    this.nextTime = this.ctx.currentTime + 0.1;
    // Agenda as notas com 150 ms de antecedência a cada 25 ms: assim a
    // batida não "tropeça" mesmo se a tela estiver ocupada desenhando.
    this.timer = window.setInterval(() => this.schedule(), 25);
  }
  private stopScheduler() { if (this.timer !== null) { clearInterval(this.timer); this.timer = null; } }
  private schedule() {
    const ctx = this.ctx; const tr = this.track ? TRACKS[this.track] : null;
    if (!ctx || !tr) return;
    if (ctx.state !== 'running') { this.nextTime = ctx.currentTime + 0.1; return; }
    const stepDur = 60 / tr.bpm / 4;
    while (this.nextTime < ctx.currentTime + 0.15) {
      const i = this.step % tr.lead.length;
      const inBar = i % 16;
      const t = this.nextTime + (inBar % 2 === 1 ? (tr.swing || 0) * stepDur : 0);
      const n = tr.lead[i]; if (n !== null) this.tone(midi(n), t, stepDur * 1.6, tr.leadWave, tr.leadVol, this.musicBus!);
      const b = tr.bass[i]; if (b !== null) this.tone(midi(b), t, stepDur * 1.8, 'triangle', 0.11, this.musicBus!);
      if (tr.kick.includes(inBar)) this.kick(t);
      if (tr.snare.includes(inBar)) this.snare(t);
      if (tr.hat.includes(inBar)) this.hat(t);
      this.nextTime += stepDur;
      this.step += 1;
    }
  }

  // ── Instrumentos ───────────────────────────────────────────
  private tone(freq: number, t: number, dur: number, wave: OscillatorType, vol: number, bus: GainNode, slideTo?: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = wave; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus);
    o.start(t); o.stop(t + dur + 0.02);
  }
  private kick(t: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.28, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g); g.connect(this.musicBus!); o.start(t); o.stop(t + 0.18);
  }
  private noiseHit(t: number, dur: number, vol: number, freq: number, type: BiquadFilterType, bus: GainNode) {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus); s.start(t); s.stop(t + dur + 0.02);
  }
  private snare(t: number) { this.noiseHit(t, 0.12, 0.12, 1800, 'bandpass', this.musicBus!); }
  private hat(t: number) { this.noiseHit(t, 0.04, 0.05, 8000, 'highpass', this.musicBus!); }

  // ── Efeitos ────────────────────────────────────────────────
  fx(name: Sfx) {
    const ctx = this.ensure();
    if (!ctx || !this.prefs.sfx || ctx.state !== 'running') return;
    const t = ctx.currentTime + 0.005;
    const bus = this.sfxBus!;
    const seq = (notes: number[], step: number, wave: OscillatorType, vol: number, dur = step * 1.5) =>
      notes.forEach((n, i) => this.tone(midi(n), t + i * step, dur, wave, vol, bus));
    switch (name) {
      case 'click': this.tone(1200, t, 0.04, 'square', 0.05, bus); break;
      case 'pop': this.tone(600, t, 0.09, 'sine', 0.2, bus, 1200); break;
      case 'join': seq([76, 83], 0.07, 'square', 0.07); break;
      case 'react': this.tone(900, t, 0.08, 'sine', 0.12, bus, 1500); break;
      case 'tick': this.tone(1000, t, 0.03, 'square', 0.05, bus); break;
      case 'tock': this.tone(700, t, 0.06, 'square', 0.09, bus); break;
      case 'correct': seq([72, 76, 79, 84], 0.07, 'square', 0.09); this.tone(midi(88), t + 0.28, 0.35, 'triangle', 0.12, bus); break;
      case 'wrong': this.tone(220, t, 0.18, 'sawtooth', 0.09, bus, 160); this.tone(160, t + 0.18, 0.3, 'sawtooth', 0.09, bus, 90); break;
      case 'whoosh': this.noiseHit(t, 0.35, 0.18, 1200, 'bandpass', bus); break;
      case 'countdown': this.tone(midi(72), t, 0.15, 'square', 0.1, bus); break;
      case 'go': this.tone(midi(84), t, 0.35, 'square', 0.12, bus); break;
      case 'start': seq([60, 64, 67, 72, 76, 79, 84], 0.05, 'square', 0.08); break;
      case 'reveal': seq([67, 74], 0.09, 'triangle', 0.14, 0.3); break;
      case 'guess': seq([79, 84, 88, 91], 0.06, 'triangle', 0.14); break;
      case 'close': seq([70, 72], 0.08, 'sine', 0.12); break;
      case 'coin': this.tone(midi(83), t, 0.08, 'square', 0.08, bus); this.tone(midi(88), t + 0.08, 0.3, 'square', 0.08, bus); break;
      case 'timeup': this.tone(330, t, 0.5, 'sawtooth', 0.08, bus, 110); break;
      case 'fanfare':
        seq([67, 67, 67, 72], 0.12, 'square', 0.09, 0.14);
        this.tone(midi(76), t + 0.5, 0.25, 'square', 0.09, bus);
        this.tone(midi(79), t + 0.75, 0.6, 'square', 0.1, bus);
        this.tone(midi(84), t + 0.75, 0.6, 'triangle', 0.1, bus);
        break;
    }
  }
}

export const gameAudio = new GameAudio();
export type { TrackName, Sfx };
