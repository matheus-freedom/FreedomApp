import React from 'react';
import { CAT_META, WHEEL } from '../../duelConfig';

// ════════════════════════════════════════════════════════════════
// A ROLETA
// ────────────────────────────────────────────────────────────────
// Desenhada em SVG (fica nítida em qualquer tela e não precisa de
// imagem). A roleta NÃO sorteia nada: quem sorteia é o servidor. A
// tela recebe o número da fatia e só anima até ela — por isso não
// dá para "girar até cair na que eu quero".
//
// Como a animação funciona: `rotation` é um ângulo que só cresce.
// Para parar na fatia i, somamos voltas inteiras + o ângulo que
// coloca o CENTRO da fatia i embaixo do ponteiro (no topo). A
// transição CSS (ease-out de ~3,6 s) faz o resto.
// ════════════════════════════════════════════════════════════════

const N = WHEEL.length;
const SLICE = 360 / N;

// Ângulo final para a fatia `slot`, partindo do ângulo atual.
export const targetRotation = (current: number, slot: number) => {
  const sliceCenter = slot * SLICE + SLICE / 2;          // posição da fatia no desenho
  const want = (360 - sliceCenter) % 360;                 // rotação que a leva ao topo
  const base = current - (current % 360);
  const jitter = (Math.random() - 0.5) * SLICE * 0.5;     // não parar sempre no centro exato
  return base + 360 * 5 + want + jitter;
};

const polar = (cx: number, cy: number, r: number, deg: number) => {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
};

const Wheel: React.FC<{ rotation: number; spinning: boolean; size?: number; onSpin?: () => void; disabled?: boolean; label?: string }> = ({ rotation, spinning, size = 300, onSpin, disabled, label = 'GIRAR' }) => {
  const c = 150, r = 140;
  return (
    <div className="relative mx-auto select-none" style={{ width: size, height: size }}>
      {/* Ponteiro */}
      <div className="absolute left-1/2 -translate-x-1/2 -top-2 z-20" style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,.5))' }}>
        <svg width="34" height="40" viewBox="0 0 34 40"><path d="M17 40 L2 8 Q17 -4 32 8 Z" fill="#ffffff" stroke="#222" strokeWidth="2" /></svg>
      </div>
      <div
        className="w-full h-full rounded-full"
        style={{
          transform: `rotate(${rotation}deg)`,
          transition: spinning ? 'transform 3.6s cubic-bezier(0.15, 0.85, 0.2, 1)' : 'none',
          boxShadow: '0 0 0 8px #1b1b1b, 0 0 0 11px #f7931e, 0 20px 60px rgba(0,0,0,.6)',
          borderRadius: '50%',
        }}
      >
        <svg viewBox="0 0 300 300" width="100%" height="100%">
          {WHEEL.map((slot, i) => {
            const a0 = i * SLICE, a1 = (i + 1) * SLICE;
            const [x0, y0] = polar(c, c, r, a0);
            const [x1, y1] = polar(c, c, r, a1);
            const mid = a0 + SLICE / 2;
            const [tx, ty] = polar(c, c, r * 0.64, mid);
            return (
              <g key={slot}>
                <path d={`M${c},${c} L${x0},${y0} A${r},${r} 0 0,1 ${x1},${y1} Z`} fill={CAT_META[slot].color} stroke="#1b1b1b" strokeWidth="3" />
                {/* Só o ícone: nome escrito na fatia não cabe em celular e
                    ficava de cabeça para baixo nas fatias de baixo. */}
                <text x={tx} y={ty} fontSize="36" textAnchor="middle" dominantBaseline="central" transform={`rotate(${mid} ${tx} ${ty})`}>{CAT_META[slot].emoji}</text>
              </g>
            );
          })}
        </svg>
      </div>
      {/* Botão central */}
      <button
        onClick={onSpin}
        disabled={disabled || spinning || !onSpin}
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 rounded-full bg-[#222222] border-4 border-[#f7931e] text-[#f7931e] font-black text-sm tracking-widest flex items-center justify-center transition-transform enabled:hover:scale-110 enabled:active:scale-95 disabled:opacity-80"
        style={{ width: size * 0.3, height: size * 0.3, boxShadow: '0 6px 20px rgba(0,0,0,.5)' }}
      >
        {spinning ? '...' : label}
      </button>
    </div>
  );
};

export default Wheel;
