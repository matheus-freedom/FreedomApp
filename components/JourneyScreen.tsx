import React, { useEffect, useMemo, useState } from 'react';
import { UserSession, Level } from '../types';
import {
  JOURNEYS, JourneyDef, JourneyId, JourneyKind, JourneyNode, JourneyProgressDoc,
  KIND_META, SEASONS, STEP_PASS_PCT, getJourney, journeyOverview, nodeKeyOf,
  seasonsSkippedByPlacement, placementSkillsMissing, JOURNEY_KINDS,
} from '../journeys';
import { api } from '../services/api';
import {
  Home, Lock, Check, Star, Play, ChevronRight, ChevronLeft, X, Loader2,
  Trophy, Sparkles, Map as MapIcon, RefreshCw, Compass, Flag, Zap,
} from 'lucide-react';

// ══════════════════════════════════════════════════════════════
// JOURNEY TO FLUENCY — mapa da trilha
// ──────────────────────────────────────────────────────────────
// Três camadas de tela:
//   1) Escolha da jornada (4 trilhas com "pegadas" diferentes).
//   2) Mapa: Seasons (níveis CEFR) → Steps (tópicos gramaticais).
//   3) Painel do Step: os 5 exercícios, com estrelas por desempenho.
//
// O progresso vem do servidor (journey_progress/{uid}) e o cálculo
// de o-que-está-liberado mora em journeys.ts, compartilhado com o
// resto do app — a tela só desenha o que aquela função decidiu.
// ══════════════════════════════════════════════════════════════

const LS_JOURNEY_KEY = (uid: string) => `journey_active_${uid}`;

interface JourneyScreenProps {
  user: UserSession;
  onHome: () => void;
  // Abre o exercício. Devolve false se o app recusou (limite diário etc).
  onStartExercise: (journeyId: JourneyId, season: number, node: JourneyNode, kind: JourneyKind) => Promise<boolean> | void;
  // Recarrega o progresso quando o aluno volta de um exercício.
  reloadToken?: number;
}

const StarRow: React.FC<{ stars?: number; size?: string }> = ({ stars = 0, size = 'w-3 h-3' }) => (
  <div className="flex gap-0.5">
    {[1, 2, 3].map(i => (
      <Star key={i} className={`${size} ${i <= stars ? 'text-yellow-400 fill-yellow-400' : 'text-white/15'}`} />
    ))}
  </div>
);

// Anel de progresso em SVG — mais bonito que uma barra para o número
// principal da tela, e não precisa de biblioteca.
const ProgressRing: React.FC<{ pct: number; size?: number; stroke?: number; className?: string }> = ({ pct, size = 132, stroke = 12, className = 'text-[#f7931e]' }) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="-rotate-90 shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="stroke-white/10" fill="none" />
      <circle
        cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} strokeLinecap="round" fill="none"
        className={`${className} transition-all duration-1000`} stroke="currentColor"
        strokeDasharray={c} strokeDashoffset={c - (c * Math.min(100, Math.max(0, pct))) / 100}
      />
    </svg>
  );
};

const JourneyScreen: React.FC<JourneyScreenProps> = ({ user, onHome, onStartExercise, reloadToken = 0 }) => {
  const [progress, setProgress] = useState<JourneyProgressDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [journeyId, setJourneyId] = useState<JourneyId | null>(null);
  const [picking, setPicking] = useState(false);
  const [seasonIdx, setSeasonIdx] = useState(0);
  const [openNode, setOpenNode] = useState<JourneyNode | null>(null);
  const [starting, setStarting] = useState<JourneyKind | null>(null);

  // Nível liberado pelo nivelamento: MENOR nível entre as habilidades
  // já testadas (regra definida pelo Matheus). Sem nivelamento, começa
  // do zero — ninguém pula Season por engano.
  const skipped = useMemo(
    () => seasonsSkippedByPlacement(user.gamification.placementResults as any, user.gamification.lastPlacementLevel),
    [user.gamification.placementResults, user.gamification.lastPlacementLevel]
  );
  const missingSkills = useMemo(
    () => placementSkillsMissing(user.gamification.placementResults as any),
    [user.gamification.placementResults]
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.getJourneyProgress(user.userId).then(doc => {
      if (!alive) return;
      setProgress(doc);
      const saved = (localStorage.getItem(LS_JOURNEY_KEY(user.userId)) || doc?.activeJourney) as JourneyId | null;
      const valid = saved && JOURNEYS.some(j => j.id === saved) ? saved : null;
      setJourneyId(valid);
      setPicking(!valid);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [user.userId, reloadToken]);

  const overview = useMemo(
    () => (journeyId ? journeyOverview(journeyId, progress, skipped) : null),
    [journeyId, progress, skipped]
  );

  // Ao abrir, posiciona na Season onde o aluno está de fato.
  useEffect(() => {
    if (overview?.next) setSeasonIdx(overview.next.season);
    else if (journeyId) setSeasonIdx(Math.min(skipped, SEASONS.length - 1));
  }, [journeyId, overview?.next?.season]);

  const chooseJourney = (id: JourneyId) => {
    localStorage.setItem(LS_JOURNEY_KEY(user.userId), id);
    setJourneyId(id);
    setPicking(false);
  };

  // A Season vai SEMPRE explícita. Depender do seasonIdx do estado
  // dava um bug feio: o botão "Continuar jornada" chamava
  // setSeasonIdx(...) e startExercise() no mesmo clique, mas o
  // setState só vale no render seguinte — então o exercício era
  // pedido com a Season que estava na tela (a que o aluno estava
  // curiosando), e não a do próximo Step dele.
  const startExercise = async (season: number, node: JourneyNode, kind: JourneyKind) => {
    if (!journeyId || starting) return;
    setStarting(kind);
    const ok = await onStartExercise(journeyId, season, node, kind);
    if (ok === false) setStarting(null);
  };

  // ── Estado de carregamento ──────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-5xl mx-auto p-6 flex flex-col items-center justify-center min-h-[60vh]">
        <Loader2 className="w-14 h-14 text-[#f7931e] animate-spin mb-4" />
        <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Carregando sua jornada...</p>
      </div>
    );
  }

  // ── 1) Escolha da jornada ───────────────────────────────────
  if (picking || !journeyId || !overview) {
    return (
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-8 animate-fade-in">
        <div className="text-center space-y-3 pt-4">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#f7931e]/10 border border-[#f7931e]/30">
            <Compass className="w-4 h-4 text-[#f7931e]" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#f7931e]">Journey to Fluency</span>
          </div>
          <h1 className="text-3xl md:text-5xl font-black text-white uppercase tracking-tighter">Escolha sua jornada</h1>
          <p className="text-gray-400 font-medium max-w-xl mx-auto text-sm md:text-base leading-relaxed">
            Todas seguem a mesma sequência de gramática da escola. O que muda é o <span className="text-white font-bold">contexto</span> dos textos, áudios e vocabulário. Você pode trocar depois — seu progresso de cada jornada fica guardado.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {JOURNEYS.map(j => {
            const ov = journeyOverview(j.id, progress, skipped);
            const started = !!progress?.journeys?.[j.id];
            return (
              <button key={j.id} onClick={() => chooseJourney(j.id)}
                className="group relative overflow-hidden text-left rounded-[2.5rem] border border-white/10 bg-[#2a2a2a] p-7 hover:border-white/25 transition-all hover:-translate-y-1 shadow-xl">
                <div className={`absolute -right-10 -top-10 w-48 h-48 rounded-full bg-gradient-to-br ${j.gradient} opacity-20 blur-2xl group-hover:opacity-35 transition-opacity`} />
                <div className="relative space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className={`w-16 h-16 rounded-3xl bg-gradient-to-br ${j.gradient} flex items-center justify-center text-3xl shadow-lg`}>{j.emoji}</div>
                    {started && (
                      <div className="text-right">
                        <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Progresso</p>
                        <p className={`text-xl font-black ${j.accent}`}>{ov.overall}%</p>
                      </div>
                    )}
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-white uppercase tracking-tight">{j.name}</h3>
                    <p className={`text-[11px] font-black uppercase tracking-widest ${j.accent}`}>{j.tagline}</p>
                  </div>
                  <p className="text-sm text-gray-400 leading-relaxed">{j.description}</p>
                  <div className="flex items-center gap-2 pt-2 text-[10px] font-black uppercase tracking-widest text-white/70 group-hover:text-white transition-colors">
                    {started ? 'Continuar' : 'Começar'} <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex justify-center pt-2">
          <button onClick={onHome} className="px-8 py-4 bg-[#2a2a2a] text-gray-400 rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center gap-2 hover:text-white transition-all border border-white/5">
            <Home className="w-4 h-4" /> Voltar ao início
          </button>
        </div>
      </div>
    );
  }

  // ── 2) Mapa da jornada ──────────────────────────────────────
  const journey: JourneyDef = getJourney(journeyId);
  const season = SEASONS[seasonIdx];
  const seasonState = overview.seasons[seasonIdx];
  const seasonSkipped = seasonIdx < skipped;
  const next = overview.next;
  const progNodes = progress?.journeys?.[journeyId]?.nodes || {};

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6 animate-fade-in pb-24">

      {/* ── Cabeçalho da jornada ── */}
      <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#2a2a2a] p-6 md:p-8 shadow-xl">
        <div className={`absolute -right-16 -top-16 w-72 h-72 rounded-full bg-gradient-to-br ${journey.gradient} opacity-20 blur-3xl`} />
        <div className="relative flex flex-col md:flex-row items-center gap-7">
          <div className="relative flex items-center justify-center">
            <ProgressRing pct={overview.overall} className={journey.accent} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-black text-white leading-none">{overview.overall}%</span>
              <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest mt-1">Concluído</span>
            </div>
          </div>

          <div className="flex-1 w-full space-y-4 text-center md:text-left">
            <div className="flex flex-col md:flex-row md:items-center gap-3 justify-center md:justify-start">
              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-gradient-to-br ${journey.gradient} text-white font-black text-sm shadow-lg`}>
                <span className="text-lg">{journey.emoji}</span> {journey.name}
              </div>
              <button onClick={() => setPicking(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-white transition-all self-center">
                <RefreshCw className="w-3 h-3" /> Trocar jornada
              </button>
            </div>

            {next ? (
              <div className="space-y-3">
                <div>
                  <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1">Próximo exercício</p>
                  <p className="text-white font-black text-lg leading-tight">
                    {KIND_META[next.kind].icon} {KIND_META[next.kind].label}
                    <span className="text-gray-500 font-bold"> — {next.node.type === 'review' ? `Review ${next.node.stepNumber}` : `Step ${next.node.stepNumber}`}</span>
                  </p>
                  <p className="text-xs text-gray-400 font-bold mt-0.5 truncate">{SEASONS[next.season].title} · {next.node.grammarTopic}</p>
                </div>
                <button
                  onClick={() => { setSeasonIdx(next.season); startExercise(next.season, next.node, next.kind); }}
                  disabled={!!starting}
                  className="w-full md:w-auto px-8 py-4 bg-[#f7931e] text-[#222222] rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:scale-[1.03] transition-all shadow-xl shadow-[#f7931e]/25 disabled:opacity-50">
                  {starting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 fill-current" />}
                  {starting ? 'Preparando...' : 'Continuar jornada'}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 justify-center md:justify-start">
                <Trophy className="w-10 h-10 text-yellow-400" />
                <div>
                  <p className="text-white font-black text-lg uppercase tracking-tight">Jornada completa!</p>
                  <p className="text-xs text-gray-400 font-bold">Você concluiu todas as Seasons. Que tal outra jornada?</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {skipped > 0 && (
          <div className="relative mt-6 flex items-start gap-3 bg-[#222222]/80 border border-white/5 rounded-2xl p-4">
            <Zap className="w-4 h-4 text-[#f7931e] shrink-0 mt-0.5" />
            <p className="text-xs text-gray-400 leading-relaxed">
              Seu nivelamento liberou <span className="text-white font-black">{skipped} Season{skipped > 1 ? 's' : ''}</span>. Elas ficam abertas para revisar na ordem que você quiser — e valem XP normalmente.
            </p>
          </div>
        )}
        {skipped === 0 && missingSkills > 0 && (
          <div className="relative mt-6 flex items-start gap-3 bg-[#222222]/80 border border-white/5 rounded-2xl p-4">
            <Compass className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
            <p className="text-xs text-gray-400 leading-relaxed">
              Quer começar de um nível mais alto? Faça o <span className="text-white font-black">nivelamento das 4 habilidades</span> (faltam {missingSkills}) — a trilha então já abre nas Seasons que você domina. Enquanto isso, você começa pela Season 1.
            </p>
          </div>
        )}
      </div>

      {/* ── Trilho de Seasons ── */}
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide -mx-1 px-1">
        {SEASONS.map((s, i) => {
          const st = overview.seasons[i];
          const isActive = i === seasonIdx;
          const isSkipped = i < skipped;
          const locked = !st.unlocked;
          return (
            <button key={s.index} onClick={() => setSeasonIdx(i)}
              className={`shrink-0 min-w-[152px] text-left p-4 rounded-3xl border-2 transition-all ${
                isActive ? `bg-[#2a2a2a] ${journey.ring.replace('ring-', 'border-')} shadow-lg`
                : locked ? 'bg-[#222222] border-white/5 opacity-60'
                : 'bg-[#2a2a2a] border-white/5 hover:border-white/20'
              }`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-[10px] font-black uppercase tracking-widest ${isActive ? journey.accent : 'text-gray-500'}`}>{s.title}</span>
                {locked ? <Lock className="w-3.5 h-3.5 text-gray-600" />
                  : isSkipped ? <Zap className="w-3.5 h-3.5 text-[#f7931e]" />
                  : st.passed ? <Check className="w-3.5 h-3.5 text-green-400" /> : null}
              </div>
              <p className="text-white font-black text-sm leading-tight">{s.subtitle}</p>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Nível {s.level}</p>
              <div className="h-1.5 w-full bg-black/40 rounded-full overflow-hidden">
                <div className={`h-full rounded-full bg-gradient-to-r ${journey.gradient} transition-all duration-700`} style={{ width: `${isSkipped ? 100 : st.pct}%` }} />
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Cabeçalho da Season atual ── */}
      <div className="flex items-center justify-between gap-4 px-1">
        <div className="flex items-center gap-3">
          <button onClick={() => setSeasonIdx(i => Math.max(0, i - 1))} disabled={seasonIdx === 0}
            className="p-2 rounded-xl bg-[#2a2a2a] border border-white/5 text-gray-400 hover:text-white disabled:opacity-30 transition-all"><ChevronLeft className="w-4 h-4" /></button>
          <div>
            <h2 className="text-xl md:text-2xl font-black text-white uppercase tracking-tighter flex items-center gap-2">
              <MapIcon className={`w-5 h-5 ${journey.accent}`} /> {season.title} · {season.level}
            </h2>
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
              {seasonState.nodes.filter(n => n.node.type === 'step').length} steps · {seasonState.nodes.filter(n => n.node.type === 'review').length} reviews
            </p>
          </div>
        </div>
        <button onClick={() => setSeasonIdx(i => Math.min(SEASONS.length - 1, i + 1))} disabled={seasonIdx === SEASONS.length - 1}
          className="p-2 rounded-xl bg-[#2a2a2a] border border-white/5 text-gray-400 hover:text-white disabled:opacity-30 transition-all"><ChevronRight className="w-4 h-4" /></button>
      </div>

      {/* ── A trilha (caminho serpenteante) ── */}
      {!seasonState.unlocked ? (
        <div className="bg-[#2a2a2a] rounded-[2.5rem] border border-white/5 p-10 text-center space-y-4">
          <Lock className="w-12 h-12 text-gray-600 mx-auto" />
          <p className="text-white font-black uppercase tracking-tight">Season bloqueada</p>
          <p className="text-sm text-gray-400 max-w-sm mx-auto leading-relaxed">
            Conclua a {SEASONS[seasonIdx - 1]?.title} (ou faça o nivelamento e alcance o nível {season.level}) para abrir esta etapa.
          </p>
        </div>
      ) : (
        <div className="relative bg-[#2a2a2a] rounded-[2.5rem] border border-white/5 p-5 md:p-10 shadow-xl overflow-hidden">
          <div className={`absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-1 bg-gradient-to-b ${journey.gradient} opacity-15`} />
          <div className="relative space-y-1">
            {seasonState.nodes.map((ns, i) => {
              const isReview = ns.node.type === 'review';
              const side = i % 2 === 0 ? 'md:pr-[52%] md:text-right md:items-end' : 'md:pl-[52%]';
              const locked = ns.state === 'locked' && !seasonSkipped;
              const done = ns.passed;
              const current = ns.state === 'current';
              const doneCount = ns.doneKinds.length;
              return (
                <div key={ns.key} className={`relative flex flex-col ${side} py-2`}>
                  <button
                    onClick={() => !locked && setOpenNode(ns.node)}
                    disabled={locked}
                    className={`group w-full md:w-auto md:min-w-[300px] text-left flex items-center gap-4 p-4 rounded-3xl border-2 transition-all ${
                      locked ? 'bg-[#222222] border-white/5 opacity-55 cursor-not-allowed'
                      : done ? 'bg-green-500/5 border-green-500/30 hover:border-green-500/60'
                      : current ? `bg-[#222222] border-[#f7931e] shadow-[0_0_25px_rgba(247,147,30,0.18)]`
                      : 'bg-[#222222] border-white/10 hover:border-white/30'
                    }`}>
                    {/* Bolha do nó */}
                    <div className={`relative w-14 h-14 rounded-2xl flex items-center justify-center font-black text-lg shrink-0 border-2 ${
                      locked ? 'bg-[#2a2a2a] border-white/5 text-gray-600'
                      : done ? 'bg-green-500 border-green-400 text-[#222222]'
                      : isReview ? `bg-gradient-to-br ${journey.gradient} border-white/20 text-white`
                      : 'bg-[#333333] border-white/10 text-white'
                    } ${current ? 'ring-4 ring-[#f7931e]/30 animate-pulse' : ''}`}>
                      {locked ? <Lock className="w-5 h-5" />
                        : done ? <Check className="w-6 h-6" />
                        : isReview ? <Flag className="w-6 h-6" />
                        : ns.node.stepNumber}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-[9px] font-black uppercase tracking-widest ${isReview ? journey.accent : 'text-gray-500'}`}>
                          {isReview ? `Review ${ns.node.stepNumber}` : `Step ${ns.node.stepNumber}`}
                        </p>
                        {current && <span className="text-[8px] font-black uppercase tracking-widest bg-[#f7931e] text-[#222222] px-2 py-0.5 rounded">Você está aqui</span>}
                      </div>
                      {/* Tema de vocabulário em destaque (é o que fala com o
                          aluno); tópico gramatical menor, logo abaixo. Review
                          não tem tema — mostra os tópicos revisados. */}
                      {!isReview ? (
                        <>
                          <p className="text-white font-black text-sm leading-tight truncate">📚 {ns.node.vocabTheme}</p>
                          <p className="text-[10px] text-gray-500 font-bold truncate">{ns.node.grammarTopic}</p>
                        </>
                      ) : (
                        <p className="text-white font-black text-sm leading-tight truncate">{ns.node.grammarTopic}</p>
                      )}
                      {!locked && (
                        <div className="flex items-center gap-2 mt-2">
                          <div className="flex-1 h-1.5 bg-black/40 rounded-full overflow-hidden max-w-[120px]">
                            <div className={`h-full rounded-full ${done ? 'bg-green-500' : 'bg-[#f7931e]'} transition-all duration-700`} style={{ width: `${(doneCount / ns.node.kinds.length) * 100}%` }} />
                          </div>
                          <span className="text-[9px] font-black text-gray-500 uppercase">{doneCount}/{ns.node.kinds.length}</span>
                          {doneCount > 0 && <span className={`text-[9px] font-black ${ns.pct >= STEP_PASS_PCT ? 'text-green-400' : 'text-[#f7931e]'}`}>{ns.pct}%</span>}
                        </div>
                      )}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex justify-center pt-2">
        <button onClick={onHome} className="px-8 py-4 bg-[#2a2a2a] text-gray-400 rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center gap-2 hover:text-white transition-all border border-white/5">
          <Home className="w-4 h-4" /> Voltar ao início
        </button>
      </div>

      {/* ── 3) Painel do Step ── */}
      {openNode && (() => {
        const ns = seasonState.nodes.find(n => n.node.index === openNode.index)!;
        const nodeProg = progNodes[nodeKeyOf(seasonIdx, openNode.index)];
        const isReview = openNode.type === 'review';
        return (
          <div className="fixed inset-0 z-[400] bg-black/85 backdrop-blur-xl flex items-end md:items-center justify-center p-0 md:p-6" onClick={() => setOpenNode(null)}>
            <div className="bg-[#2a2a2a] w-full max-w-lg rounded-t-[2.5rem] md:rounded-[2.5rem] border border-white/10 shadow-2xl max-h-[88vh] overflow-y-auto scrollbar-hide animate-pop" onClick={e => e.stopPropagation()}>
              <div className={`relative p-7 bg-gradient-to-br ${journey.gradient}`}>
                <button onClick={() => setOpenNode(null)} className="absolute top-5 right-5 p-2 rounded-xl bg-black/20 text-white/80 hover:text-white transition-all"><X className="w-5 h-5" /></button>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/80 mb-1">
                  {season.title} · {isReview ? `Review ${openNode.stepNumber}` : `Step ${openNode.stepNumber}`}
                </p>
                {/* Mesma hierarquia dos cards: vocabulário grande, gramática abaixo. */}
                <h3 className="text-2xl font-black text-white leading-tight pr-10">{isReview ? openNode.grammarTopic : `📚 ${openNode.vocabTheme}`}</h3>
                {!isReview && <p className="text-sm font-bold text-white/85 mt-1">{openNode.grammarTopic}</p>}
              </div>

              <div className="p-6 space-y-3">
                {isReview && (
                  <div className="flex items-start gap-3 bg-[#222222] border border-white/5 rounded-2xl p-4 mb-2">
                    <Flag className={`w-4 h-4 shrink-0 mt-0.5 ${journey.accent}`} />
                    <p className="text-xs text-gray-400 leading-relaxed">
                      Revisão dos 3 steps anteriores num quiz só. Serve para fixar antes de seguir — e vale XP como qualquer exercício.
                    </p>
                  </div>
                )}

                {openNode.kinds.map((kind, i) => {
                  const res = nodeProg?.exercises?.[kind];
                  const meta = KIND_META[kind];
                  // Dentro do Step, os exercícios são feitos na ordem —
                  // o texto de leitura usa a gramática que o aluno acabou
                  // de estudar, então pular quebraria a lógica.
                  const prevDone = i === 0 || !!nodeProg?.exercises?.[openNode.kinds[i - 1]];
                  // Em Season liberada pelo nivelamento (revisão), a ordem
                  // não prende ninguém — o aluno escolhe o que revisar.
                  const blocked = ns.state === 'locked' || (!prevDone && !ns.freeRoam);
                  return (
                    <button key={kind} disabled={blocked || !!starting} onClick={() => startExercise(seasonIdx, openNode, kind)}
                      className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left ${
                        blocked ? 'bg-[#222222] border-white/5 opacity-50 cursor-not-allowed'
                        : res ? 'bg-[#222222] border-green-500/25 hover:border-green-500/60'
                        : 'bg-[#222222] border-[#f7931e]/40 hover:border-[#f7931e] hover:bg-[#f7931e]/5'
                      }`}>
                      <div className="w-11 h-11 rounded-2xl bg-[#333333] flex items-center justify-center text-xl shrink-0">{meta.icon}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-black text-sm uppercase tracking-tight">{meta.label}</p>
                        {res ? (
                          <div className="flex items-center gap-2 mt-1">
                            <StarRow stars={res.stars} />
                            <span className="text-[10px] font-black text-gray-500">{res.bestPct}% · {res.attempts}x</span>
                          </div>
                        ) : (
                          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-0.5">
                            {blocked ? 'Faça o exercício anterior' : 'Não iniciado'}
                          </p>
                        )}
                      </div>
                      {starting === kind
                        ? <Loader2 className="w-5 h-5 text-[#f7931e] animate-spin shrink-0" />
                        : blocked ? <Lock className="w-4 h-4 text-gray-600 shrink-0" />
                        : res ? <RefreshCw className="w-4 h-4 text-gray-500 shrink-0" />
                        : <Play className="w-4 h-4 text-[#f7931e] fill-current shrink-0" />}
                    </button>
                  );
                })}

                <div className={`mt-4 p-4 rounded-2xl border ${ns.passed ? 'bg-green-500/5 border-green-500/25' : 'bg-[#222222] border-white/5'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Média do {isReview ? 'review' : 'step'}</p>
                    <p className={`text-lg font-black ${ns.passed ? 'text-green-400' : 'text-white'}`}>{ns.pct}%</p>
                  </div>
                  <div className="h-2 bg-black/40 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-700 ${ns.passed ? 'bg-green-500' : 'bg-[#f7931e]'}`} style={{ width: `${ns.pct}%` }} />
                  </div>
                  <p className="text-[10px] text-gray-500 font-bold mt-2 leading-relaxed">
                    {ns.passed
                      ? <span className="text-green-400 flex items-center gap-1"><Sparkles className="w-3 h-3" /> Liberado! O próximo já está aberto.</span>
                      : `Conclua os ${openNode.kinds.length} exercícios com média de ${STEP_PASS_PCT}% para liberar o próximo. Refazer um exercício melhora a média.`}
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default JourneyScreen;
