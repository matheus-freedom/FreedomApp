import React from 'react';
import { Crown } from 'lucide-react';
import { CATEGORIES, CAT_META, DuelCategory, LEAGUES, WheelSlot } from '../../duelConfig';

// ════════════════════════════════════════════════════════════════
// Peças visuais reaproveitadas nas telas de Desafios.
// ════════════════════════════════════════════════════════════════

export const PlayerAvatar: React.FC<{ photo?: string | null; name: string; size?: number; ring?: string }> = ({ photo, name, size = 44, ring }) => (
  <div
    className="rounded-full bg-[#222222] flex items-center justify-center shrink-0 overflow-hidden text-[#f7931e] font-black relative"
    style={{ width: size, height: size, fontSize: size * 0.4, boxShadow: ring ? `0 0 0 3px ${ring}` : undefined }}
  >
    {(name || '?').replace('@', '').charAt(0).toUpperCase()}
    {photo && <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
  </div>
);

// Ícone redondo da categoria (emoji sobre a cor dela).
export const CatDot: React.FC<{ cat: WheelSlot; size?: number; dim?: boolean }> = ({ cat, size = 28, dim }) => (
  <div
    className="rounded-full flex items-center justify-center shrink-0 transition-all"
    style={{
      width: size, height: size, fontSize: size * 0.5,
      background: dim ? '#333333' : CAT_META[cat].color,
      filter: dim ? 'grayscale(1)' : undefined, opacity: dim ? 0.45 : 1,
      boxShadow: dim ? undefined : `0 0 12px ${CAT_META[cat].color}55`,
    }}
    title={CAT_META[cat].label}
  >
    <span>{CAT_META[cat].emoji}</span>
  </div>
);

// As 6 coroas de um jogador: coloridas as conquistadas, cinza as que faltam.
export const CrownRow: React.FC<{ crowns: DuelCategory[]; size?: number }> = ({ crowns, size = 22 }) => (
  <div className="flex gap-1">
    {CATEGORIES.map(c => <CatDot key={c} cat={c} size={size} dim={!crowns.includes(c)} />)}
  </div>
);

export const LeagueBadge: React.FC<{ leagueId: string; trophies: number; compact?: boolean }> = ({ leagueId, trophies, compact }) => {
  const l = LEAGUES.find(x => x.id === leagueId) || LEAGUES[0];
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border" style={{ borderColor: `${l.color}55`, background: `${l.color}14` }}>
      <Crown className="w-4 h-4" style={{ color: l.color }} />
      {!compact && <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: l.color }}>{l.name}</span>}
      <span className="text-xs font-black text-white tabular-nums">{trophies}</span>
    </div>
  );
};

export const timeLeftLabel = (deadline: number | null | undefined) => {
  if (!deadline) return '';
  const ms = deadline - Date.now();
  if (ms <= 0) return 'prazo acabando';
  const h = Math.floor(ms / 3600000);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h >= 1) return `${h}h`;
  return `${Math.max(1, Math.floor(ms / 60000))} min`;
};

export const timeAgoLabel = (ts: number | null | undefined) => {
  if (!ts) return '';
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
};

export const fr = (v: number) => `FR$ ${(v || 0).toFixed(2).replace('.', ',')}`;
