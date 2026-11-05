import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Music, Music2, Volume2, VolumeX } from 'lucide-react';
import { gameAudio } from '../../services/gameAudio';

// ════════════════════════════════════════════════════════════════
// TEMA DA ABA GAMES
// ────────────────────────────────────────────────────────────────
// Identidade própria, diferente do resto do app (que é cinza-escuro
// com laranja): aqui é uma "caixa de brinquedos de fliperama".
//   • Fundo uva profundo com pontinhos; painéis lilás.
//   • Peças com contorno escuro grosso e sombra DURA deslocada (sem
//     esfumaçado), como adesivos ou blocos de brinquedo. Botões
//     "afundam" ao toque.
//   • Fredoka (arredondada) para títulos, botões e placar; Nunito
//     para o texto das perguntas, que precisa ser muito legível.
// O laranja da Freedom continua sendo a cor da ação principal.
// As classes ficam todas com o prefixo "gz-" (game zone) para não
// colidir com o resto do app.
// ════════════════════════════════════════════════════════════════

export const GZ = {
  grape: '#21183f',
  grapeDeep: '#170f2e',
  panel: '#33285f',
  panelHi: '#43357a',
  ink: '#0f0a1f',
  cream: '#fff7e8',
  muted: '#b9aee0',
  orange: '#f7931e',
  cyan: '#3fd0ff',
  pink: '#ff5fa2',
  lime: '#b6f24a',
  coral: '#ff5a5f',
};

// As 4 alternativas do quiz: cor + forma (a forma ajuda quem não
// distingue bem cores, e o professor pode dizer "o triângulo").
export const ANSWER_STYLES = [
  { color: '#ff5a5f', shape: '▲', name: 'triângulo' },
  { color: '#3f8cff', shape: '◆', name: 'losango' },
  { color: '#ffc93c', shape: '●', name: 'círculo' },
  { color: '#38d39f', shape: '■', name: 'quadrado' },
];

let fontsInjected = false;
const injectFonts = () => {
  if (fontsInjected || typeof document === 'undefined') return;
  fontsInjected = true;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Nunito:wght@500;700;800&display=swap';
  document.head.appendChild(l);
};

export const GameStyles: React.FC = () => {
  useEffect(() => { injectFonts(); gameAudio.init(); }, []);
  return (
    <style>{`
      .gz { font-family: 'Fredoka', 'Nunito', system-ui, sans-serif; color: ${GZ.cream}; }
      .gz-bg {
        background-color: ${GZ.grape};
        background-image: radial-gradient(rgba(255,255,255,.06) 1.2px, transparent 1.2px);
        background-size: 22px 22px;
      }
      .gz-read { font-family: 'Nunito', system-ui, sans-serif; }
      .gz-num { font-variant-numeric: tabular-nums; }
      .gz-card {
        background: ${GZ.panel}; border: 3px solid ${GZ.ink}; border-radius: 22px;
        box-shadow: 0 6px 0 ${GZ.ink};
      }
      .gz-inset { background: ${GZ.grapeDeep}; border: 2px solid ${GZ.ink}; border-radius: 16px; }
      .gz-btn {
        position: relative; display: inline-flex; align-items: center; justify-content: center; gap: .5rem;
        font-family: 'Fredoka', system-ui, sans-serif; font-weight: 600; letter-spacing: .01em;
        border: 3px solid ${GZ.ink}; border-radius: 16px; padding: .7rem 1.15rem;
        box-shadow: 0 5px 0 ${GZ.ink}; transition: transform .08s ease, box-shadow .08s ease, filter .15s;
        cursor: pointer; user-select: none; -webkit-tap-highlight-color: transparent;
      }
      .gz-btn:hover:not(:disabled) { filter: brightness(1.07); }
      .gz-btn:active:not(:disabled) { transform: translateY(4px); box-shadow: 0 1px 0 ${GZ.ink}; }
      .gz-btn:disabled { opacity: .45; cursor: default; }
      .gz-btn:focus-visible, .gz-tile:focus-visible, .gz-focus:focus-visible { outline: 3px solid ${GZ.cyan}; outline-offset: 3px; }
      .gz-btn-orange { background: ${GZ.orange}; color: ${GZ.ink}; }
      .gz-btn-cyan { background: ${GZ.cyan}; color: ${GZ.ink}; }
      .gz-btn-pink { background: ${GZ.pink}; color: ${GZ.ink}; }
      .gz-btn-lime { background: ${GZ.lime}; color: ${GZ.ink}; }
      .gz-btn-ghost { background: ${GZ.panelHi}; color: ${GZ.cream}; }
      .gz-btn-sm { padding: .45rem .8rem; border-radius: 12px; font-size: .85rem; box-shadow: 0 3px 0 ${GZ.ink}; }
      .gz-btn-sm:active:not(:disabled) { transform: translateY(2px); box-shadow: 0 1px 0 ${GZ.ink}; }
      .gz-tile {
        border: 3px solid ${GZ.ink}; border-radius: 20px; box-shadow: 0 6px 0 ${GZ.ink};
        transition: transform .08s ease, box-shadow .08s ease, opacity .25s, filter .25s;
        -webkit-tap-highlight-color: transparent;
      }
      .gz-tile:active:not(:disabled) { transform: translateY(5px); box-shadow: 0 1px 0 ${GZ.ink}; }
      .gz-chip { border: 2px solid ${GZ.ink}; border-radius: 999px; padding: .2rem .65rem; font-weight: 600; font-size: .78rem; }
      .gz-input {
        background: ${GZ.grapeDeep}; border: 3px solid ${GZ.ink}; border-radius: 14px; color: ${GZ.cream};
        padding: .7rem .95rem; outline: none; font-family: 'Nunito', system-ui, sans-serif; font-weight: 700;
      }
      .gz-input:focus { border-color: ${GZ.cyan}; }
      .gz-input::placeholder { color: ${GZ.muted}; opacity: .7; }

      @keyframes gzHop { 0% { transform: translateY(18px) scale(.8); opacity: 0; } 60% { transform: translateY(-6px) scale(1.05); opacity: 1; } 100% { transform: none; opacity: 1; } }
      .gz-hop { display: inline-block; animation: gzHop .5s cubic-bezier(.2,1.5,.4,1) both; }
      @keyframes gzPop { 0% { transform: scale(.6); opacity: 0; } 70% { transform: scale(1.06); opacity: 1; } 100% { transform: scale(1); } }
      .gz-pop { animation: gzPop .35s cubic-bezier(.2,1.4,.4,1) both; }
      @keyframes gzShake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-6px); } 75% { transform: translateX(6px); } }
      .gz-shake { animation: gzShake .3s ease 2; }
      @keyframes gzFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
      .gz-float { animation: gzFloat 2.4s ease-in-out infinite; }
      @keyframes gzFall { to { transform: translateY(110vh) rotate(720deg); } }
      @keyframes gzRise { 0% { transform: translateY(0) scale(.6); opacity: 0; } 15% { opacity: 1; transform: translateY(-10px) scale(1.15); } 100% { transform: translateY(-140px) scale(1); opacity: 0; } }
      .gz-rise { animation: gzRise 1.6s ease-out forwards; }
      @keyframes gzBar { from { transform: scaleX(1); } to { transform: scaleX(0); } }
      @media (prefers-reduced-motion: reduce) {
        .gz-hop, .gz-pop, .gz-shake, .gz-float, .gz-rise { animation: none !important; opacity: 1; }
      }
      .gz-scroll::-webkit-scrollbar { width: 8px; } .gz-scroll::-webkit-scrollbar-thumb { background: ${GZ.panelHi}; border-radius: 8px; }
    `}</style>
  );
};

// Estado do som reativo (os botões mudam quando liga/desliga).
export const useAudioPrefs = () => {
  const snap = useSyncExternalStore(
    (cb) => gameAudio.subscribe(cb),
    () => `${gameAudio.music}|${gameAudio.sfx}`,
  );
  const [music, sfx] = snap.split('|').map((v) => v === 'true');
  return { music, sfx };
};

export const SoundToggles: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const { music, sfx } = useAudioPrefs();
  return (
    <div className="flex items-center gap-2">
      <button className="gz-btn gz-btn-ghost gz-btn-sm" onClick={() => gameAudio.setMusic(!music)}
        aria-label={music ? 'Desligar música' : 'Ligar música'} title={music ? 'Desligar música' : 'Ligar música'}>
        {music ? <Music className="w-4 h-4" /> : <Music2 className="w-4 h-4 opacity-50" />}{!compact && <span>{music ? 'Música' : 'Sem música'}</span>}
      </button>
      <button className="gz-btn gz-btn-ghost gz-btn-sm" onClick={() => { gameAudio.setSfx(!sfx); if (!sfx) setTimeout(() => gameAudio.fx('pop'), 30); }}
        aria-label={sfx ? 'Desligar efeitos sonoros' : 'Ligar efeitos sonoros'} title={sfx ? 'Desligar efeitos' : 'Ligar efeitos'}>
        {sfx ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 opacity-50" />}{!compact && <span>{sfx ? 'Efeitos' : 'Mudo'}</span>}
      </button>
    </div>
  );
};

// Relógio que "anda" (re-renderiza a cada `ms`). Usado nos cronômetros.
export const useNow = (ms = 200) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
};

// Cronômetro redondo: o anel esvazia e fica vermelho no fim.
export const TimerRing: React.FC<{ leftMs: number; totalMs: number; size?: number }> = ({ leftMs, totalMs, size = 64 }) => {
  const frac = Math.max(0, Math.min(1, leftMs / totalMs));
  const r = size / 2 - 6, c = 2 * Math.PI * r;
  const secs = Math.ceil(Math.max(0, leftMs) / 1000);
  const color = frac < 0.25 ? GZ.coral : frac < 0.5 ? '#ffc93c' : GZ.lime;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="timer" aria-label={`${secs} segundos`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill={GZ.grapeDeep} stroke={GZ.ink} strokeWidth={6} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - frac)} style={{ transition: 'stroke-dashoffset .2s linear, stroke .3s' }} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-semibold gz-num" style={{ fontSize: size * 0.34 }}>{secs}</span>
    </div>
  );
};

// Confete (pódio e acertos importantes). Respeita "reduzir movimento".
export const Confetti: React.FC<{ count?: number }> = ({ count = 70 }) => {
  const [pieces] = useState(() => Array.from({ length: count }, (_, i) => ({
    left: Math.random() * 100, delay: Math.random() * 0.8, dur: 2.4 + Math.random() * 2, size: 6 + Math.random() * 8,
    color: [GZ.orange, GZ.cyan, GZ.pink, GZ.lime, '#ffc93c'][i % 5], round: i % 3 === 0,
  })));
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return null;
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-[700]" aria-hidden>
      {pieces.map((p, i) => (
        <span key={i} style={{
          position: 'absolute', top: -20, left: `${p.left}%`, width: p.size, height: p.round ? p.size : p.size * 0.5,
          background: p.color, borderRadius: p.round ? '50%' : 2, border: `1.5px solid ${GZ.ink}`,
          animation: `gzFall ${p.dur}s linear ${p.delay}s forwards`,
        }} />
      ))}
    </div>
  );
};

export const Avatar: React.FC<{ photo?: string | null; name: string; size?: number; ring?: string }> = ({ photo, name, size = 44, ring }) => {
  const letter = (name || '?').replace('@', '').charAt(0).toUpperCase();
  const hues = [GZ.orange, GZ.cyan, GZ.pink, GZ.lime, '#ffc93c', '#a78bfa'];
  const bg = hues[(letter.charCodeAt(0) || 0) % hues.length];
  return (
    <div className="rounded-full flex items-center justify-center shrink-0 overflow-hidden font-semibold relative"
      style={{ width: size, height: size, fontSize: size * 0.42, background: bg, color: GZ.ink, border: `3px solid ${GZ.ink}`, boxShadow: ring ? `0 0 0 3px ${ring}` : undefined }}>
      {letter}
      {photo && <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
    </div>
  );
};

export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'] as const;
