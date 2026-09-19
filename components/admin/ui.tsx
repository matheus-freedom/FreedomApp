import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

// ════════════════════════════════════════════════════════════════
// PEÇAS VISUAIS DO PAINEL ADMIN
// ────────────────────────────────────────────────────────────────
// Tudo que se repete nas abas (cartão de número, seção, barras,
// mapa de calor, dica do gráfico) mora aqui — assim as abas ficam
// só com o conteúdo, e mudar o visual é mexer num lugar só.
// ════════════════════════════════════════════════════════════════

// Cores dos gráficos. A ordem das SÉRIES é fixa e foi validada para
// daltonismo sobre o fundo escuro do app: cada série tem sempre a
// mesma cor, em qualquer gráfico. As de STATUS (bom/atenção/crítico)
// são reservadas — nunca viram "cor da série 4".
export const C = {
  brand: '#f7931e',
  series: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9'],
  good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b',
  grid: 'rgba(255,255,255,0.06)', axis: '#8a8a8a', surface: '#2a2a2a',
};

export const axisProps = { stroke: C.axis, fontSize: 10, tickLine: false, axisLine: false } as const;

// ── Cartão de seção ────────────────────────────────────────────
export const Section: React.FC<{ title: string; hint?: string; icon?: React.ReactNode; right?: React.ReactNode; className?: string; children: React.ReactNode }> =
  ({ title, hint, icon, right, className = '', children }) => (
    <section className={`bg-[#2a2a2a] rounded-[2rem] border border-white/5 p-6 shadow-xl ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">{icon}{title}</h3>
          {hint && <p className="text-[11px] text-gray-500 font-medium mt-1 leading-snug max-w-xl">{hint}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );

// ── Variação contra o período anterior ─────────────────────────
// Ícone + número (nunca só a cor), para quem não distingue verde de
// vermelho. `invert` é para métricas em que cair é bom.
export const Delta: React.FC<{ value: number | null; invert?: boolean; compact?: boolean }> = ({ value, invert, compact }) => {
  if (compact && !value) return null; // em tabela, "sem variação" é só ruído
  if (value === null) return <span className="text-[10px] font-bold text-gray-600">sem base anterior</span>;
  if (value === 0) return <span className="text-[10px] font-black text-gray-500 flex items-center gap-1"><Minus className="w-3 h-3" /> igual</span>;
  const good = invert ? value < 0 : value > 0;
  const Icon = value > 0 ? TrendingUp : TrendingDown;
  return (
    <span className={`text-[10px] font-black flex items-center gap-1 ${good ? 'text-green-400' : 'text-red-400'}`}>
      <Icon className="w-3 h-3" /> {value > 0 ? '+' : ''}{value}%
    </span>
  );
};

// ── Cartão de número-chave ─────────────────────────────────────
export const KpiCard: React.FC<{ label: string; value: string; icon: React.ReactNode; delta?: number | null; sub?: string; showDelta?: boolean; invert?: boolean }> =
  ({ label, value, icon, delta = null, sub, showDelta = true, invert }) => (
    <div className="bg-[#2a2a2a] p-5 rounded-[1.75rem] border border-white/5 shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <div className="w-10 h-10 rounded-xl bg-[#f7931e]/10 flex items-center justify-center text-[#f7931e]">{icon}</div>
        {showDelta && <Delta value={delta} invert={invert} />}
      </div>
      <p className="text-3xl font-black text-white leading-none tabular-nums">{value}</p>
      <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mt-2">{label}</p>
      {sub && <p className="text-[10px] text-gray-600 font-medium mt-1 leading-snug">{sub}</p>}
    </div>
  );

// ── Dica (tooltip) dos gráficos ────────────────────────────────
export const ChartTip: React.FC<any> = ({ active, payload, label, unit }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1a1a1a] border border-white/10 rounded-xl px-3 py-2 shadow-2xl">
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="text-xs font-bold text-white flex items-center gap-2">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color || p.fill }} />
          {p.name}: <span className="tabular-nums">{p.value}{unit || ''}</span>
        </p>
      ))}
    </div>
  );
};

// ── Lista de barras horizontais ────────────────────────────────
// Para rankings com rótulo longo (nome de tela, de tema): o nome fica
// legível à esquerda e o valor à direita, sem eixo para decifrar.
export const BarList: React.FC<{ rows: { label: string; value: number; right: string; sub?: string }[]; color?: string; empty?: string }> =
  ({ rows, color = C.brand, empty = 'Sem dados no período.' }) => {
    if (!rows.length) return <Empty text={empty} />;
    const max = Math.max(...rows.map(r => r.value), 1);
    return (
      <div className="space-y-3">
        {rows.map(r => (
          <div key={r.label} title={`${r.label}: ${r.right}${r.sub ? ` · ${r.sub}` : ''}`}>
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <span className="text-xs font-bold text-gray-200 truncate">{r.label}</span>
              <span className="text-[11px] font-black text-white tabular-nums shrink-0">{r.right}{r.sub && <span className="text-gray-500 font-bold"> · {r.sub}</span>}</span>
            </div>
            <div className="h-2 bg-[#222222] rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: color }} />
            </div>
          </div>
        ))}
      </div>
    );
  };

// ── Mapa de calor dia × hora ───────────────────────────────────
// Uma cor só, do apagado ao forte (quanto mais acessos, mais forte).
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const Heatmap: React.FC<{ matrix: number[][] }> = ({ matrix }) => {
  const max = Math.max(1, ...matrix.flat());
  const total = matrix.flat().reduce((a, b) => a + b, 0);
  if (!total) return <Empty text="Ainda sem acessos rastreados neste período." />;
  const hours = Array.from({ length: 18 }, (_, i) => i + 6); // 6h às 23h: de madrugada quase ninguém estuda
  return (
    <div className="overflow-x-auto custom-scrollbar">
      <div className="min-w-[560px]">
        <div className="grid gap-[3px]" style={{ gridTemplateColumns: `36px repeat(${hours.length}, 1fr)` }}>
          <span />
          {hours.map(h => <span key={h} className="text-[9px] font-bold text-gray-600 text-center">{h}h</span>)}
          {[1, 2, 3, 4, 5, 6, 0].map(wd => (
            <React.Fragment key={wd}>
              <span className="text-[10px] font-black text-gray-500 uppercase self-center">{WEEKDAYS[wd]}</span>
              {hours.map(h => {
                const v = matrix[wd][h];
                return (
                  <div key={h} title={`${WEEKDAYS[wd]} ${h}h — ${v} acesso${v === 1 ? '' : 's'}`}
                    className="h-6 rounded-[5px] flex items-center justify-center text-[9px] font-black"
                    style={{ background: v ? `rgba(247,147,30,${0.15 + 0.85 * (v / max)})` : 'rgba(255,255,255,0.03)', color: v / max > 0.55 ? '#222' : 'transparent' }}>
                    {v || ''}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
        <div className="flex items-center justify-end gap-2 mt-3 text-[9px] font-bold text-gray-600 uppercase tracking-widest">
          menos
          {[0.15, 0.4, 0.65, 1].map(o => <span key={o} className="w-4 h-3 rounded-[3px]" style={{ background: `rgba(247,147,30,${o})` }} />)}
          mais acessos
        </div>
      </div>
    </div>
  );
};

export const Empty: React.FC<{ text: string }> = ({ text }) => (
  <div className="py-10 text-center text-gray-600 text-xs font-bold italic">{text}</div>
);

// ── Etiqueta de situação do aluno ──────────────────────────────
const STATUS_STYLE: Record<string, string> = {
  ativo: 'bg-green-500/10 text-green-400 border-green-500/30',
  esfriando: 'bg-yellow-400/10 text-yellow-300 border-yellow-400/30',
  em_risco: 'bg-orange-500/10 text-orange-300 border-orange-500/30',
  inativo: 'bg-red-500/10 text-red-400 border-red-500/30',
  nunca_praticou: 'bg-white/5 text-gray-400 border-white/10',
  pending: 'bg-yellow-400/10 text-yellow-300 border-yellow-400/30',
  new: 'bg-white/5 text-gray-400 border-white/10',
  rejected: 'bg-red-500/10 text-red-400 border-red-500/30',
  blocked: 'bg-red-500/10 text-red-400 border-red-500/30',
  approved: 'bg-green-500/10 text-green-400 border-green-500/30',
};
export const Pill: React.FC<{ kind: string; children: React.ReactNode; title?: string }> = ({ kind, children, title }) => (
  <span title={title} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest whitespace-nowrap ${STATUS_STYLE[kind] || STATUS_STYLE.new}`}>{children}</span>
);

export const ACCESS_LABEL: Record<string, string> = {
  new: 'Não pediu acesso', pending: 'Aguardando', approved: 'Liberado', rejected: 'Recusado', blocked: 'Bloqueado',
};

export const Avatar: React.FC<{ photo?: string; name: string; size?: string; big?: boolean }> = ({ photo, name, size = 'w-10 h-10', big }) => (
  <div className={`${size} ${big ? 'rounded-[1.75rem] text-4xl' : 'rounded-full text-sm'} bg-[#222222] border border-white/10 flex items-center justify-center shrink-0 overflow-hidden text-[#f7931e] font-black`}>
    {/* Foto quebrada (link antigo do Storage) some e deixa a inicial à mostra. */}
    <span className="relative w-full h-full flex items-center justify-center">
      {(name || '?').charAt(0).toUpperCase()}
      {photo && <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
    </span>
  </div>
);
