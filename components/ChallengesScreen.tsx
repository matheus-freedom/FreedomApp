import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Swords, Shuffle, Search, Loader2, X, Coins, Trophy, Flame, Crown, Zap, CalendarDays, Users, ChevronRight, HelpCircle, Lock, Target } from 'lucide-react';
import { showToast } from './Toast';
import { UserSession } from '../types';
import { Duel, DuelApiError, DuelMe, DuelSearchPlayer, duelApi, duelsNeedingMe } from '../services/duelApi';
import { CATEGORIES, CAT_META, LEAGUES, LEVEL_OPTIONS, MAX_TURNS, STAKES } from '../duelConfig';
import DuelGame, { DuelStyles } from './challenges/DuelGame';
import LeagueSection from './challenges/LeagueSection';
import { CatDot, CrownRow, LeagueBadge, PlayerAvatar, fr, timeAgoLabel, timeLeftLabel } from './challenges/ui';

// ════════════════════════════════════════════════════════════════
// ABA DESAFIOS — hub dos modos de jogo
// ────────────────────────────────────────────────────────────────
// • Duelo da Roleta (estilo Perguntados): o modo principal.
// • Liga em Grupo: a corrida de XP que já existia.
// • Duelo Relâmpago e Desafio do Dia: próximos modos (aparecem como
//   "em breve" para criar expectativa).
//
// Os dados vêm da function "duel" (services/duelApi.ts). A lista
// recarrega sozinha a cada 20s enquanto a aba está aberta — é assim
// que um convite ou "sua vez" aparece sem o aluno recarregar.
// ════════════════════════════════════════════════════════════════

interface ChallengesScreenProps {
  user: UserSession;
  onHome: () => void;
  onUserUpdate: (user: UserSession) => void;
  onBadgeChange?: (n: number) => void;
}

type View = { kind: 'hub' } | { kind: 'duel'; id: string } | { kind: 'league' };

const ChallengesScreen: React.FC<ChallengesScreenProps> = ({ user, onHome, onUserUpdate, onBadgeChange }) => {
  const [view, setView] = useState<View>({ kind: 'hub' });
  const [me, setMe] = useState<DuelMe | null>(null);
  const [duels, setDuels] = useState<Duel[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState<{ opponent?: DuelSearchPlayer } | null>(null);
  const [showLevel, setShowLevel] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const uid = user.userId;

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await duelApi.hub();
      setMe(data.me);
      setDuels(data.duels);
      setLoadError(null);
      onBadgeChange?.(duelsNeedingMe(data.duels, uid));
      // Saldo e XP podem ter mudado (prêmio, aposta): atualiza o app todo.
      const g = user.gamification;
      if (g.frBalance !== data.me.balance || g.xp !== data.me.xp) {
        onUserUpdate({ ...user, gamification: { ...g, frBalance: data.me.balance, xp: data.me.xp } });
      }
    } catch (e) {
      if (!silent) setLoadError(e instanceof Error ? e.message : 'Não foi possível carregar os desafios.');
    } finally { if (!silent) setLoading(false); }
  }, [uid, user, onUserUpdate, onBadgeChange]);

  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Aluno sem nível que recebeu convite: pergunta o nível logo de cara
  // (senão ele clicaria em "Aceitar" e só receberia um aviso).
  const askedLevel = React.useRef(false);
  useEffect(() => {
    if (askedLevel.current || !me?.needLevel) return;
    if (duels.some(d => d.status === 'invited' && d.players[1] === uid)) { askedLevel.current = true; setShowLevel(true); }
  }, [me, duels, uid]);
  useEffect(() => {
    if (view.kind !== 'hub') return;
    const t = setInterval(() => { if (!document.hidden) refresh(true); }, 20000);
    return () => clearInterval(t);
  }, [view.kind, refresh]);

  const openNew = (opponent?: DuelSearchPlayer) => {
    if (me?.needLevel) { setShowLevel(true); return; }
    setShowNew({ opponent });
  };

  const rematch = async (opponentId: string, stake: number) => {
    try {
      const { duel } = await duelApi.create({ opponentId, stake: stake <= (me?.balance ?? 0) ? stake : 0 });
      showToast('Revanche enviada! ⚔️', 'success');
      setView({ kind: 'duel', id: duel.id });
      refresh(true);
    } catch (e) {
      if (e instanceof DuelApiError && e.duelId) { setView({ kind: 'duel', id: e.duelId }); return; }
      showToast(e instanceof Error ? e.message : 'Não deu para criar a revanche.', 'error');
    }
  };

  // ── Sub-telas ─────────────────────────────────────────────────
  if (view.kind === 'duel') {
    return (
      <DuelGame
        key={view.id}
        duelId={view.id}
        initial={duels.find(d => d.id === view.id) || null}
        uid={uid}
        onBack={() => { setView({ kind: 'hub' }); refresh(true); }}
        onChanged={() => refresh(true)}
        onRematch={rematch}
      />
    );
  }
  if (view.kind === 'league') {
    return <LeagueSection user={user} onHome={() => setView({ kind: 'hub' })} />;
  }

  // ── Separação das listas ─────────────────────────────────────
  const invitesForMe = duels.filter(d => d.status === 'invited' && d.players[1] === uid);
  const myTurn = duels.filter(d => d.status === 'active' && d.turn === uid);
  const waiting = duels.filter(d => (d.status === 'active' && d.turn !== uid) || (d.status === 'invited' && d.players[0] === uid));
  const finished = duels.filter(d => d.status === 'finished').slice(0, 8);

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 pb-24 animate-fade-in space-y-6">
      <DuelStyles />

      {/* ── Cabeçalho ───────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button onClick={onHome} className="p-3 bg-[#333333] text-gray-400 rounded-2xl border border-white/5 hover:text-white hover:border-[#f7931e]/50 transition-all">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Desafios</h2>
            <p className="text-gray-400 text-sm font-medium">Desafie os colegas e prove seu inglês.</p>
          </div>
        </div>
        {me && (
          <div className="flex flex-wrap items-center gap-2">
            <LeagueBadge leagueId={me.league.id} trophies={me.trophies} />
            <button onClick={() => me.levelSource !== 'placement' && setShowLevel(true)}
              className={`px-3 py-1.5 rounded-xl border border-white/10 bg-[#2a2a2a] text-xs font-black text-white ${me.levelSource === 'placement' ? 'cursor-default' : 'hover:border-[#f7931e]/50'}`}
              title={me.levelSource === 'placement' ? 'Nível do seu nivelamento' : 'Nível escolhido por você — toque para mudar'}>
              Nível {me.level || '?'}
            </button>
            <div className="px-3 py-1.5 rounded-xl border border-white/10 bg-[#2a2a2a] text-xs font-black text-[#f7931e] flex items-center gap-1.5"><Coins className="w-3.5 h-3.5" /> {fr(me.balance)}</div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24"><Loader2 className="w-12 h-12 text-[#f7931e] animate-spin" /></div>
      ) : loadError ? (
        <div className="bg-[#2a2a2a] p-10 rounded-[2rem] text-center border border-white/5">
          <p className="text-white font-black mb-2">Não conseguimos abrir os desafios.</p>
          <p className="text-gray-400 text-sm mb-6">{loadError}</p>
          <button onClick={() => refresh()} className="px-6 py-3 bg-[#f7931e] text-[#222222] rounded-2xl font-black uppercase text-xs tracking-widest">Tentar de novo</button>
        </div>
      ) : (
        <>
          {/* ── Destaque: Duelo da Roleta ─────────────────────── */}
          <div className="relative overflow-hidden rounded-[2.5rem] p-6 md:p-8 border border-[#f7931e]/30 shadow-2xl"
            style={{ background: 'radial-gradient(circle at 85% 20%, rgba(247,147,30,.28), transparent 55%), linear-gradient(135deg,#2d2d2d,#222)' }}>
            <MiniWheelDecor />
            <div className="relative z-10 max-w-md">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#f7931e] text-[#222222] text-[10px] font-black uppercase tracking-widest mb-3"><Swords className="w-3 h-3" /> Modo principal</span>
              <h3 className="text-3xl md:text-4xl font-black text-white uppercase tracking-tighter leading-none">Duelo da Roleta</h3>
              <p className="text-gray-300 text-sm mt-3 leading-relaxed">Gire a roleta, acerte 3 seguidas e dispute as coroas. Quem juntar as <b className="text-white">6 coroas</b> primeiro vence. Cada um joga na sua hora.</p>
              <div className="flex flex-wrap gap-3 mt-6">
                <button onClick={() => openNew()} className="px-6 py-4 bg-[#f7931e] text-[#222222] rounded-2xl font-black uppercase tracking-widest flex items-center gap-2 hover:bg-[#e08215] hover:scale-[1.03] transition-all shadow-xl shadow-[#f7931e]/30">
                  <Swords className="w-5 h-5" /> Novo duelo
                </button>
                <button onClick={() => setShowRules(true)} className="px-5 py-4 bg-white/5 text-white rounded-2xl font-black uppercase tracking-widest text-xs flex items-center gap-2 border border-white/10 hover:bg-white/10">
                  <HelpCircle className="w-4 h-4" /> Como jogar
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* ── Coluna das partidas ───────────────────────── */}
            <div className="lg:col-span-2 space-y-6">
              {(invitesForMe.length > 0 || myTurn.length > 0) && (
                <Section title="Sua vez" count={invitesForMe.length + myTurn.length} accent>
                  {invitesForMe.map(d => <DuelRow key={d.id} duel={d} uid={uid} onOpen={() => setView({ kind: 'duel', id: d.id })} />)}
                  {myTurn.map(d => <DuelRow key={d.id} duel={d} uid={uid} onOpen={() => setView({ kind: 'duel', id: d.id })} />)}
                </Section>
              )}

              {waiting.length > 0 && (
                <Section title="Aguardando o adversário" count={waiting.length}>
                  {waiting.map(d => <DuelRow key={d.id} duel={d} uid={uid} onOpen={() => setView({ kind: 'duel', id: d.id })} />)}
                </Section>
              )}

              {invitesForMe.length + myTurn.length + waiting.length === 0 && (
                <div className="bg-[#2a2a2a] rounded-[2rem] p-10 text-center border border-white/5">
                  <div className="text-5xl mb-3">🎯</div>
                  <h4 className="text-lg font-black text-white uppercase tracking-tight">Nenhum duelo rolando</h4>
                  <p className="text-gray-500 text-sm max-w-xs mx-auto mt-1">Chame um colega pelo @ ou deixe a gente sortear um adversário.</p>
                  <button onClick={() => openNew()} className="mt-6 px-6 py-3 bg-[#f7931e] text-[#222222] rounded-2xl font-black uppercase text-xs tracking-widest">Desafiar alguém</button>
                </div>
              )}

              {/* Outros modos */}
              <div>
                <h4 className="text-xs font-black text-gray-500 uppercase tracking-[0.2em] mb-3">Outros modos</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <ModeCard icon={<Users className="w-6 h-6" />} color="#3b82f6" title="Liga em Grupo" desc="Corrida de XP entre amigos por alguns dias." onClick={() => setView({ kind: 'league' })} />
                  <ModeCard icon={<Zap className="w-6 h-6" />} color="#eab308" title="Duelo Relâmpago" desc="10 perguntas iguais, contra o relógio." soon />
                  <ModeCard icon={<CalendarDays className="w-6 h-6" />} color="#22c55e" title="Desafio do Dia" desc="As mesmas 10 perguntas para a escola toda." soon />
                </div>
              </div>

              {finished.length > 0 && (
                <Section title="Últimos duelos">
                  {finished.map(d => <DuelRow key={d.id} duel={d} uid={uid} onOpen={() => setView({ kind: 'duel', id: d.id })} />)}
                </Section>
              )}
            </div>

            {/* ── Coluna do jogador ─────────────────────────── */}
            {me && <PlayerPanel me={me} />}
          </div>
        </>
      )}

      {showNew && me && (
        <NewDuelModal me={me} preset={showNew.opponent} onClose={() => setShowNew(null)}
          onCreated={(d) => { setShowNew(null); setView({ kind: 'duel', id: d.id }); refresh(true); }}
          onOpenExisting={(id) => { setShowNew(null); setView({ kind: 'duel', id }); }}
          onNeedLevel={() => { setShowNew(null); setShowLevel(true); }} />
      )}
      {showLevel && (
        <LevelModal current={me?.level || null} onClose={() => setShowLevel(false)}
          onSaved={(m) => { setMe(m); setShowLevel(false); showToast(`Nível ${m.level} salvo! Bora duelar ⚔️`, 'success'); }} />
      )}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </div>
  );
};

// ════════════════════════════════════════════════════════════════

const Section: React.FC<{ title: string; count?: number; accent?: boolean; children: React.ReactNode }> = ({ title, count, accent, children }) => (
  <div>
    <h4 className={`text-xs font-black uppercase tracking-[0.2em] mb-3 flex items-center gap-2 ${accent ? 'text-[#f7931e]' : 'text-gray-500'}`}>
      {accent && <span className="w-2 h-2 rounded-full bg-[#f7931e] animate-pulse" />}
      {title} {count !== undefined && <span className="text-gray-600">({count})</span>}
    </h4>
    <div className="space-y-2.5">{children}</div>
  </div>
);

const DuelRow: React.FC<{ duel: Duel; uid: string; onOpen: () => void }> = ({ duel, uid, onOpen }) => {
  const opp = duel.players[0] === uid ? duel.players[1] : duel.players[0];
  const info = duel.info[opp] || { username: '?', name: '?', photo: null, level: null };
  const mine = duel.crowns[uid] || [], theirs = duel.crowns[opp] || [];
  let status: React.ReactNode, cta = 'Ver', hot = false;
  if (duel.status === 'invited' && duel.players[1] === uid) { status = <>te desafiou{duel.stake > 0 && <b className="text-[#f7931e]"> · aposta {fr(duel.stake)}</b>}</>; cta = 'Responder'; hot = true; }
  else if (duel.status === 'invited') { status = <>convite enviado · expira em {timeLeftLabel(duel.expiresAt)}</>; }
  else if (duel.status === 'active' && duel.turn === uid) { status = <>sua vez · {timeLeftLabel(duel.turnDeadline)} para jogar</>; cta = 'Jogar'; hot = true; }
  else if (duel.status === 'active') { status = <>vez dele(a) · {timeAgoLabel(duel.updatedAt)}</>; }
  else if (duel.status === 'finished') {
    const r = duel.winner === null ? 'Empate' : duel.winner === uid ? 'Vitória' : 'Derrota';
    status = <span className={duel.winner === uid ? 'text-green-400' : duel.winner === null ? 'text-gray-300' : 'text-red-400'}>{r}{duel.rewards?.[uid] ? ` · ${duel.rewards[uid].trophies >= 0 ? '+' : ''}${duel.rewards[uid].trophies} troféus` : ''}</span>;
  }
  return (
    <button onClick={onOpen} className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border text-left transition-all group ${hot ? 'bg-[#2f2a24] border-[#f7931e]/40 hover:border-[#f7931e]' : 'bg-[#2a2a2a] border-white/5 hover:border-white/20'}`}>
      <PlayerAvatar photo={info.photo} name={info.username || info.name} size={46} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-black text-white truncate">{info.username || info.name}</p>
          {info.level && <span className="text-[9px] font-black text-gray-400 bg-[#333333] px-1.5 py-0.5 rounded">{info.level}</span>}
        </div>
        <p className="text-[11px] text-gray-400 font-bold truncate">{status}</p>
        {duel.status !== 'invited' && (
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[10px] font-black text-white tabular-nums">{mine.length}×{theirs.length}</span>
            <CrownRow crowns={mine} size={14} />
          </div>
        )}
      </div>
      <span className={`shrink-0 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${hot ? 'bg-[#f7931e] text-[#222222]' : 'bg-[#333333] text-gray-300 group-hover:text-white'}`}>{cta}</span>
    </button>
  );
};

const ModeCard: React.FC<{ icon: React.ReactNode; color: string; title: string; desc: string; soon?: boolean; onClick?: () => void }> = ({ icon, color, title, desc, soon, onClick }) => (
  <button onClick={onClick} disabled={soon}
    className="relative p-5 rounded-[1.75rem] bg-[#2a2a2a] border border-white/5 text-left transition-all enabled:hover:border-white/20 enabled:hover:-translate-y-0.5 disabled:cursor-default">
    <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-3" style={{ background: `${color}22`, color }}>{icon}</div>
    <p className="text-sm font-black text-white uppercase tracking-tight">{title}</p>
    <p className="text-[11px] text-gray-500 mt-1 leading-snug">{desc}</p>
    {soon
      ? <span className="absolute top-4 right-4 flex items-center gap-1 text-[9px] font-black text-gray-500 uppercase tracking-widest"><Lock className="w-3 h-3" /> Em breve</span>
      : <ChevronRight className="absolute top-5 right-4 w-4 h-4 text-gray-600" />}
  </button>
);

const PlayerPanel: React.FC<{ me: DuelMe }> = ({ me }) => {
  const league = LEAGUES.find(l => l.id === me.league.id) || LEAGUES[0];
  const next = me.nextLeague;
  const progress = next ? ((me.trophies - me.league.min) / (next.min - me.league.min)) * 100 : 100;
  const cats = CATEGORIES.map(c => {
    const v = me.catStats[c];
    return { c, t: v?.t || 0, pct: v && v.t ? Math.round((v.c / v.t) * 100) : null };
  });
  const rated = cats.filter(x => x.t >= 3 && x.pct !== null) as { c: typeof CATEGORIES[number]; t: number; pct: number }[];
  const best = rated.length ? rated.reduce((a, b) => (b.pct > a.pct ? b : a)) : null;
  const worst = rated.length > 1 ? rated.reduce((a, b) => (b.pct < a.pct ? b : a)) : null;

  return (
    <div className="space-y-4">
      <div className="bg-[#2a2a2a] rounded-[2rem] p-6 border border-white/5 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: `${league.color}22` }}>
            <Trophy className="w-7 h-7" style={{ color: league.color }} />
          </div>
          <div>
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Liga</p>
            <p className="text-xl font-black" style={{ color: league.color }}>{league.name}</p>
          </div>
          <p className="ml-auto text-2xl font-black text-white tabular-nums">{me.trophies}</p>
        </div>
        <div className="h-2 bg-[#333333] rounded-full overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${Math.max(3, progress)}%`, background: league.color }} /></div>
        <p className="text-[10px] text-gray-500 font-bold mt-2">{next ? `Faltam ${next.min - me.trophies} troféus para ${next.name}` : 'Você está na liga máxima!'}</p>

        <div className="grid grid-cols-3 gap-2 mt-5">
          <Stat label="Vitórias" value={me.wins} />
          <Stat label="Derrotas" value={me.losses} />
          <Stat label="Coroas" value={me.crownsTotal} />
        </div>
        <div className="flex items-center gap-2 mt-3 p-3 rounded-xl bg-[#222222] border border-white/5">
          <Flame className={`w-5 h-5 ${me.streak > 0 ? 'text-orange-500' : 'text-gray-600'}`} />
          <p className="text-xs font-black text-white">{me.streak} vitória{me.streak === 1 ? '' : 's'} seguida{me.streak === 1 ? '' : 's'}</p>
          <p className="ml-auto text-[10px] text-gray-500 font-bold">recorde {me.bestStreak}</p>
        </div>
      </div>

      <div className="bg-[#2a2a2a] rounded-[2rem] p-6 border border-white/5 shadow-xl">
        <p className="text-xs font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2"><Target className="w-4 h-4 text-[#f7931e]" /> Acertos por categoria</p>
        <div className="space-y-2.5">
          {cats.map(({ c, t, pct }) => (
            <div key={c} className="flex items-center gap-2.5">
              <CatDot cat={c} size={22} />
              <span className="text-[11px] font-black text-gray-300 w-20 truncate">{CAT_META[c].label}</span>
              <div className="flex-1 h-2 bg-[#333333] rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct ?? 0}%`, background: CAT_META[c].color }} /></div>
              <span className="text-[10px] font-black text-gray-500 w-9 text-right tabular-nums">{pct === null ? '—' : `${pct}%`}</span>
            </div>
          ))}
        </div>
        {best && worst && best.c !== worst.c ? (
          <p className="text-[11px] text-gray-400 mt-4 leading-relaxed">Seu forte é <b style={{ color: CAT_META[best.c].color }}>{CAT_META[best.c].label}</b>. Vale reforçar <b style={{ color: CAT_META[worst.c].color }}>{CAT_META[worst.c].label}</b> nos exercícios do app.</p>
        ) : (
          <p className="text-[11px] text-gray-500 mt-4">Jogue alguns duelos para descobrir seu ponto forte.</p>
        )}
      </div>

      <div className="bg-[#2a2a2a] rounded-[2rem] p-5 border border-white/5">
        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">Prêmios de duelo hoje</p>
        <Bar label="XP" value={me.daily.xp} max={me.dailyCap.xp} fmt={v => `${v}`} />
        <Bar label="FR$" value={me.daily.fr} max={me.dailyCap.fr} fmt={v => v.toFixed(2).replace('.', ',')} />
        <p className="text-[10px] text-gray-600 mt-2">Os prêmios dos duelos não gastam sua cota de exercícios. Troféus e apostas não têm teto.</p>
      </div>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="p-3 rounded-xl bg-[#222222] border border-white/5 text-center">
    <p className="text-xl font-black text-white tabular-nums">{value}</p>
    <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">{label}</p>
  </div>
);

const Bar: React.FC<{ label: string; value: number; max: number; fmt: (v: number) => string }> = ({ label, value, max, fmt }) => (
  <div className="flex items-center gap-2 mb-2">
    <span className="text-[10px] font-black text-gray-400 w-8">{label}</span>
    <div className="flex-1 h-1.5 bg-[#333333] rounded-full overflow-hidden"><div className="h-full bg-[#f7931e] rounded-full" style={{ width: `${Math.min(100, (value / max) * 100)}%` }} /></div>
    <span className="text-[10px] font-black text-gray-500 tabular-nums">{fmt(value)}/{fmt(max)}</span>
  </div>
);

// Enfeite do destaque: a roleta em miniatura, girando devagar.
const MiniWheelDecor: React.FC = () => (
  <div className="absolute -right-16 -bottom-16 md:right-6 md:top-1/2 md:-translate-y-1/2 md:bottom-auto w-64 h-64 opacity-30 md:opacity-90 pointer-events-none">
    <div className="w-full h-full rounded-full" style={{
      background: `conic-gradient(${['grammar', 'vocabulary', 'reading', 'listening', 'travel', 'everyday', 'crown'].map((c, i) => `${CAT_META[c as keyof typeof CAT_META].color} ${(i * 100) / 7}% ${((i + 1) * 100) / 7}%`).join(',')})`,
      boxShadow: '0 0 0 6px #1b1b1b, 0 0 0 9px #f7931e', animation: 'duelSpin 24s linear infinite',
    }} />
    <div className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-[#222222] border-4 border-[#f7931e] flex items-center justify-center text-2xl">👑</div>
  </div>
);

// ── Novo duelo ──────────────────────────────────────────────────
const NewDuelModal: React.FC<{
  me: DuelMe; preset?: DuelSearchPlayer; onClose: () => void;
  onCreated: (d: Duel) => void; onOpenExisting: (id: string) => void; onNeedLevel: () => void;
}> = ({ me, preset, onClose, onCreated, onOpenExisting, onNeedLevel }) => {
  const [mode, setMode] = useState<'friend' | 'random'>(preset ? 'friend' : 'friend');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<DuelSearchPlayer[]>([]);
  const [searching, setSearching] = useState(false);
  const [target, setTarget] = useState<DuelSearchPlayer | null>(preset || null);
  const [stake, setStake] = useState(0);
  const [creating, setCreating] = useState(false);

  // Busca com "respiro" de 350 ms: não dispara uma chamada por letra.
  useEffect(() => {
    if (mode !== 'friend') return;
    let alive = true;
    setSearching(true);
    const t = setTimeout(async () => {
      try { const r = await duelApi.search(q); if (alive) setResults(r.players); }
      catch { if (alive) setResults([]); }
      finally { if (alive) setSearching(false); }
    }, q ? 350 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [q, mode]);

  const create = async () => {
    if (creating) return;
    if (mode === 'friend' && !target) { showToast('Escolha quem você quer desafiar.', 'info'); return; }
    setCreating(true);
    try {
      const { duel } = await duelApi.create(mode === 'random' ? { random: true, stake } : { opponentId: target!.uid, stake });
      showToast(mode === 'random' ? `Sorteamos ${duel.info[duel.players[1]]?.username}! Convite enviado ⚔️` : 'Convite enviado! ⚔️', 'success');
      onCreated(duel);
    } catch (e) {
      if (e instanceof DuelApiError && e.code === 'NEED_LEVEL') { onNeedLevel(); return; }
      if (e instanceof DuelApiError && e.duelId) { showToast(e.message, 'info'); onOpenExisting(e.duelId); return; }
      showToast(e instanceof Error ? e.message : 'Não deu para criar o duelo.', 'error');
    } finally { setCreating(false); }
  };

  return (
    <div className="fixed inset-0 z-[600] bg-[#111]/90 backdrop-blur-xl flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-[#2a2a2a] w-full max-w-lg rounded-t-[2.5rem] sm:rounded-[2.5rem] border border-white/10 shadow-2xl overflow-hidden animate-pop max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-6 pb-4 flex items-center justify-between">
          <h3 className="text-2xl font-black text-white uppercase tracking-tighter flex items-center gap-2"><Swords className="w-7 h-7 text-[#f7931e]" /> Novo duelo</h3>
          <button onClick={onClose} className="p-2 text-gray-500 hover:text-white"><X className="w-6 h-6" /></button>
        </div>

        <div className="px-6 overflow-y-auto custom-scrollbar space-y-5 pb-2">
          <div className="grid grid-cols-2 gap-2 p-1 bg-[#222222] rounded-2xl">
            <button onClick={() => setMode('friend')} className={`py-3 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${mode === 'friend' ? 'bg-[#f7931e] text-[#222222]' : 'text-gray-400'}`}><Search className="w-4 h-4" /> Escolher</button>
            <button onClick={() => setMode('random')} className={`py-3 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${mode === 'random' ? 'bg-[#f7931e] text-[#222222]' : 'text-gray-400'}`}><Shuffle className="w-4 h-4" /> Aleatório</button>
          </div>

          {mode === 'friend' ? (
            <div>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Digite o @ ou o nome"
                  className="w-full bg-[#222222] border border-[#333333] text-white rounded-2xl py-3.5 pl-11 pr-4 focus:border-[#f7931e] outline-none text-sm" />
              </div>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-3 mb-2">{q.trim().length >= 2 ? 'Resultados' : 'Sugestões'}</p>
              <div className="space-y-1.5 max-h-60 overflow-y-auto custom-scrollbar">
                {searching && <Loader2 className="w-5 h-5 text-[#f7931e] animate-spin mx-auto my-4" />}
                {!searching && results.length === 0 && <p className="text-gray-500 text-xs text-center py-4">Ninguém encontrado.</p>}
                {!searching && results.map(p => (
                  <button key={p.uid} onClick={() => setTarget(p)}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-xl border transition-all ${target?.uid === p.uid ? 'border-[#f7931e] bg-[#f7931e]/10' : 'border-transparent hover:bg-[#333333]'}`}>
                    <PlayerAvatar photo={p.photo} name={p.username || p.name} size={36} />
                    <div className="text-left min-w-0 flex-1">
                      <p className="text-sm font-black text-white truncate">{p.username}</p>
                      <p className="text-[10px] text-gray-500 truncate">{p.name}</p>
                    </div>
                    {p.level && <span className="text-[10px] font-black text-gray-400 bg-[#222222] px-2 py-1 rounded-lg">{p.level}</span>}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-[#222222] rounded-2xl p-5 text-center border border-white/5">
              <Shuffle className="w-10 h-10 text-[#f7931e] mx-auto mb-2" />
              <p className="text-white font-black">Adversário surpresa</p>
              <p className="text-gray-400 text-xs mt-1">Sorteamos um aluno ativo da Freedom. Cada um responde perguntas do próprio nível, então o duelo é justo.</p>
            </div>
          )}

          <div>
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-2"><Coins className="w-3.5 h-3.5 text-[#f7931e]" /> Aposta (opcional)</p>
            <div className="grid grid-cols-4 gap-2">
              {STAKES.map(s => {
                const can = s <= me.balance;
                return (
                  <button key={s} disabled={!can} onClick={() => setStake(s)}
                    className={`py-3 rounded-xl text-xs font-black transition-all border ${stake === s ? 'bg-[#f7931e] text-[#222222] border-[#f7931e]' : 'bg-[#222222] text-white border-white/10'} disabled:opacity-30`}>
                    {s === 0 ? 'Sem' : `FR$ ${s}`}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-gray-500 mt-2 leading-relaxed">
              {stake > 0 ? `Você e o adversário colocam ${fr(stake)} cada. Quem vencer leva ${fr(stake * 2)}. Empate devolve; recusa ou convite vencido também.` : `Seu saldo: ${fr(me.balance)}.`}
            </p>
          </div>
        </div>

        <div className="p-6 pt-4">
          <button onClick={create} disabled={creating || (mode === 'friend' && !target)}
            className="w-full py-4 bg-[#f7931e] text-[#222222] rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-[#e08215] transition-all disabled:opacity-40">
            {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Swords className="w-5 h-5" /> {mode === 'random' ? 'Sortear e desafiar' : target ? `Desafiar ${target.username}` : 'Escolha um adversário'}</>}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── "Qual seu nível?" ───────────────────────────────────────────
const LevelModal: React.FC<{ current: string | null; onClose: () => void; onSaved: (m: DuelMe) => void }> = ({ current, onClose, onSaved }) => {
  const [sel, setSel] = useState<string | null>(current);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!sel || saving) return;
    setSaving(true);
    try { const { me } = await duelApi.setLevel(sel); onSaved(me); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Não deu para salvar.', 'error'); }
    finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-[650] bg-[#111]/90 backdrop-blur-xl flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#2a2a2a] w-full max-w-md rounded-[2.5rem] border border-white/10 p-6 animate-pop" onClick={e => e.stopPropagation()}>
        <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Qual seu nível?</h3>
        <p className="text-gray-400 text-sm mt-1 mb-5">Assim as perguntas dos duelos ficam na medida certa para você. Quando você fizer o nivelamento, ele passa a valer no lugar desta escolha.</p>
        <div className="space-y-2">
          {LEVEL_OPTIONS.map(o => (
            <button key={o.level} onClick={() => setSel(o.level)}
              className={`w-full flex items-center gap-3 p-3 rounded-2xl border text-left transition-all ${sel === o.level ? 'border-[#f7931e] bg-[#f7931e]/10' : 'border-white/5 bg-[#222222] hover:border-white/20'}`}>
              <span className={`w-11 h-11 rounded-xl flex items-center justify-center font-black ${sel === o.level ? 'bg-[#f7931e] text-[#222222]' : 'bg-[#333333] text-white'}`}>{o.level}</span>
              <div>
                <p className="text-sm font-black text-white">{o.title}</p>
                <p className="text-[11px] text-gray-400">{o.desc}</p>
              </div>
            </button>
          ))}
        </div>
        <button onClick={save} disabled={!sel || saving} className="w-full mt-5 py-4 bg-[#f7931e] text-[#222222] rounded-2xl font-black uppercase tracking-widest disabled:opacity-40">
          {saving ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Salvar nível'}
        </button>
      </div>
    </div>
  );
};

const RulesModal: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="fixed inset-0 z-[650] bg-[#111]/90 backdrop-blur-xl flex items-center justify-center p-4" onClick={onClose}>
    <div className="bg-[#2a2a2a] w-full max-w-lg rounded-[2.5rem] border border-white/10 p-6 md:p-8 animate-pop max-h-[90vh] overflow-y-auto custom-scrollbar" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Como jogar</h3>
        <button onClick={onClose} className="p-2 text-gray-500 hover:text-white"><X className="w-6 h-6" /></button>
      </div>
      <ol className="space-y-4 text-sm text-gray-300">
        <Rule n={1} title="Gire a roleta">Ela cai em uma das 6 categorias ou na <b className="text-[#f7931e]">Coroa 👑</b>.</Rule>
        <Rule n={2} title="Responda">Você tem 25 segundos (40 em Leitura e Listening). Acertou, gira de novo. Errou, a vez passa.</Rule>
        <Rule n={3} title="3 acertos = chance de coroa">O medidor enche a cada acerto. Cheio, você escolhe uma categoria e responde a pergunta da coroa. Cair na fatia Coroa também dá essa chance.</Rule>
        <Rule n={4} title="Junte as 6 coroas">Quem conquistar todas primeiro vence. Se ninguém conseguir em {MAX_TURNS} rodadas, vence quem tiver mais coroas (desempate: mais acertos).</Rule>
        <Rule n={5} title="Ajudas">Em cada duelo você tem um <b className="text-white">50/50</b> (tira duas erradas) e uma <b className="text-white">troca de pergunta</b>.</Rule>
        <Rule n={6} title="Cada um no seu tempo">Você tem 48h para jogar a sua vez. Passou disso, é W.O.</Rule>
      </ol>
      <div className="mt-6 grid grid-cols-3 gap-2">
        {CATEGORIES.map(c => (
          <div key={c} className="flex items-center gap-2 p-2 rounded-xl bg-[#222222]"><CatDot cat={c} size={22} /><span className="text-[10px] font-black text-white uppercase">{CAT_META[c].label}</span></div>
        ))}
      </div>
      <div className="mt-6 p-4 rounded-2xl bg-[#222222] border border-white/5 text-xs text-gray-400 space-y-1">
        <p className="flex items-center gap-2"><Crown className="w-4 h-4 text-[#f7931e]" /> Vitória: +30 troféus, 50 XP (+5 por coroa) e FR$ 0,50.</p>
        <p>Derrota: −10 troféus e 15 XP pela participação. Desistir ou W.O.: −20 troféus.</p>
        <p>Suas perguntas seguem o seu nível; o do colega segue o dele.</p>
      </div>
    </div>
  </div>
);

const Rule: React.FC<{ n: number; title: string; children: React.ReactNode }> = ({ n, title, children }) => (
  <li className="flex gap-3">
    <span className="w-7 h-7 rounded-lg bg-[#f7931e] text-[#222222] font-black flex items-center justify-center shrink-0">{n}</span>
    <div><p className="font-black text-white">{title}</p><p className="text-gray-400 text-[13px] leading-relaxed">{children}</p></div>
  </li>
);

export default ChallengesScreen;
