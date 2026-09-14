import React, { useEffect, useMemo, useState } from 'react';
import { Search, X, Home, CheckCircle2, Zap, Clock, ChevronRight, GraduationCap, Sparkles, BookOpen } from 'lucide-react';
import { Level, UserSession } from '../types';
import { CatalogEntry, FRED_CATALOG, FRED_LEVELS, FredProgressDoc, LESSON_XP, searchCatalog } from '../fredExplains';
import { api } from '../services/api';
import FredAvatar from './FredAvatar';

// ══════════════════════════════════════════════════════════════
// FRED EXPLICA — catálogo de temas
// ──────────────────────────────────────────────────────────────
// Tela "biblioteca": todos os temas gramaticais do A1 ao C1, com
// busca por texto (sem acento/caixa, com sinônimos tipo "passado")
// e filtro por nível e por situação (concluído / em andamento).
//
// A tela NÃO carrega o conteúdo das aulas — só dois documentos
// leves: o progresso do aluno (fred_progress/{uid}) e o índice de
// aulas prontas (fred_meta/index). O conteúdo só é baixado quando o
// aluno abre um tema, na FredLessonScreen.
// ══════════════════════════════════════════════════════════════

interface FredExplainsScreenProps {
  user: UserSession;
  onHome: () => void;
  onOpenLesson: (entry: CatalogEntry) => void;
  // Nível pré-selecionado (ex.: quando vem da Journey).
  initialLevel?: Level | null;
}

type StatusFilter = 'all' | 'done' | 'progress' | 'new';

const LEVEL_LABEL: Record<Level, string> = {
  [Level.A1]: 'Iniciante', [Level.A2]: 'Básico', [Level.B1]: 'Intermediário', [Level.B2]: 'Intermediário-avançado', [Level.C1]: 'Avançado',
};
const LEVEL_COLOR: Record<Level, string> = {
  [Level.A1]: 'from-green-500 to-emerald-600',
  [Level.A2]: 'from-sky-500 to-blue-600',
  [Level.B1]: 'from-[#f7931e] to-amber-600',
  [Level.B2]: 'from-purple-500 to-fuchsia-600',
  [Level.C1]: 'from-rose-500 to-red-600',
};

const FredExplainsScreen: React.FC<FredExplainsScreenProps> = ({ user, onHome, onOpenLesson, initialLevel }) => {
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState<Level | 'ALL'>(initialLevel || 'ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [progress, setProgress] = useState<FredProgressDoc | null>(null);
  const [ready, setReady] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [p, r] = await Promise.all([api.getFredProgress(user.userId), api.getFredReadyIndex()]);
      if (!alive) return;
      setProgress(p); setReady(r); setLoading(false);
    })();
    return () => { alive = false; };
  }, [user.userId]);

  const lessons = progress?.lessons || {};
  const statusOf = (id: string): 'done' | 'progress' | 'new' => {
    const l = lessons[id];
    if (l?.completedAt) return 'done';
    if (l?.openedAt) return 'progress';
    return 'new';
  };

  const results = useMemo(() => {
    const base = searchCatalog(query, level);
    return statusFilter === 'all' ? base : base.filter(c => statusOf(c.id) === statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, level, statusFilter, progress]);

  // Agrupa por nível para a lista ter "capítulos".
  const grouped = useMemo(() => {
    const map = new Map<Level, CatalogEntry[]>();
    for (const c of results) { if (!map.has(c.level)) map.set(c.level, []); map.get(c.level)!.push(c); }
    return FRED_LEVELS.filter(l => map.has(l)).map(l => ({ level: l, items: map.get(l)! }));
  }, [results]);

  const doneCount = FRED_CATALOG.filter(c => statusOf(c.id) === 'done').length;
  const firstName = (user.userName || '').split(' ')[0] || 'você';

  // "Continuar de onde parou": a última aula aberta e não concluída.
  const continueEntry = useMemo(() => {
    let best: { entry: CatalogEntry; at: number } | null = null;
    for (const c of FRED_CATALOG) {
      const l = lessons[c.id];
      if (l?.openedAt && !l.completedAt && (!best || l.openedAt > best.at)) best = { entry: c, at: l.openedAt };
    }
    return best?.entry || null;
  }, [lessons]);

  return (
    <div className="max-w-5xl mx-auto py-6 md:py-10 space-y-6 animate-fade-in">
      {/* ── Hero ── */}
      <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#2a2a2a] shadow-2xl">
        <div className="absolute -right-24 -top-24 w-96 h-96 rounded-full bg-gradient-to-br from-[#f7931e] to-[#ff5e3a] opacity-20 blur-3xl" />
        <div className="absolute -left-16 -bottom-24 w-72 h-72 rounded-full bg-gradient-to-br from-sky-500 to-purple-500 opacity-10 blur-3xl" />
        <div className="relative p-6 md:p-10 flex flex-col md:flex-row items-center gap-6 md:gap-10">
          <FredAvatar expression="professor" className="w-36 h-44 md:w-44 md:h-56 drop-shadow-[0_20px_40px_rgba(247,147,30,0.35)]" />
          <div className="flex-1 text-center md:text-left space-y-3">
            <div className="flex items-center gap-2 justify-center md:justify-start">
              <span className="text-[9px] font-black uppercase tracking-[0.2em] bg-[#f7931e] text-[#222222] px-2 py-0.5 rounded">Novo</span>
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-500">Sessão de estudo</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-black text-white uppercase tracking-tighter leading-none">Fred explica</h1>
            <p className="text-sm md:text-base text-gray-300 font-medium leading-relaxed max-w-xl">
              Gramática sem dor de cabeça, {firstName}. Escolhe um tema e eu te explico do meu jeito: com exemplos de verdade, comparações com o português e uns mini-quizzes no caminho para você ver que está pegando.
            </p>
            <div className="flex flex-wrap items-center gap-3 justify-center md:justify-start pt-1">
              <div className="flex items-center gap-2 bg-[#222222] border border-white/5 rounded-2xl px-4 py-2">
                <GraduationCap className="w-4 h-4 text-[#f7931e]" />
                <span className="text-xs font-black text-white">{doneCount}<span className="text-gray-500">/{FRED_CATALOG.length} temas concluídos</span></span>
              </div>
              <div className="flex items-center gap-2 bg-[#222222] border border-white/5 rounded-2xl px-4 py-2">
                <Sparkles className="w-4 h-4 text-yellow-400" />
                <span className="text-xs font-black text-gray-400">+{LESSON_XP} XP por tema concluído</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Continuar ── */}
      {continueEntry && (
        <button onClick={() => onOpenLesson(continueEntry)}
          className="w-full flex items-center gap-4 p-4 md:p-5 rounded-[2rem] bg-[#f7931e]/10 border-2 border-[#f7931e]/40 hover:border-[#f7931e] transition-all text-left group">
          <div className="w-12 h-12 rounded-2xl bg-[#f7931e] text-[#222222] flex items-center justify-center shrink-0 shadow-lg shadow-[#f7931e]/30"><BookOpen className="w-6 h-6" /></div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-[#f7931e]">Continuar de onde parou</p>
            <p className="text-white font-black truncate">{continueEntry.topic} <span className="text-gray-500 font-bold">· {continueEntry.level}</span></p>
          </div>
          <ChevronRight className="w-5 h-5 text-[#f7931e] group-hover:translate-x-1 transition-transform shrink-0" />
        </button>
      )}

      {/* ── Busca e filtros ── */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar tema: present perfect, condicionais, preposições, passado..."
            className="w-full bg-[#2a2a2a] border border-white/5 rounded-2xl py-4 pl-14 pr-12 text-white text-sm outline-none focus:border-[#f7931e]/50 transition-all shadow-inner placeholder:text-gray-600"
          />
          {query && (
            <button onClick={() => setQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-white"><X className="w-4 h-4" /></button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-500 mr-1">Nível</span>
          {(['ALL', ...FRED_LEVELS] as Array<Level | 'ALL'>).map(l => (
            <button key={l} onClick={() => setLevel(l)}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all border ${level === l ? 'bg-[#f7931e] text-[#222222] border-[#f7931e]' : 'bg-[#2a2a2a] text-gray-400 border-white/5 hover:text-white hover:border-white/20'}`}>
              {l === 'ALL' ? 'Todos' : l}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-500 mr-1">Situação</span>
          {([['all', 'Tudo'], ['new', 'Não iniciados'], ['progress', 'Em andamento'], ['done', 'Concluídos']] as Array<[StatusFilter, string]>).map(([k, label]) => (
            <button key={k} onClick={() => setStatusFilter(k)}
              className={`px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all border ${statusFilter === k ? 'bg-white text-[#222222] border-white' : 'bg-[#2a2a2a] text-gray-400 border-white/5 hover:text-white hover:border-white/20'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Lista ── */}
      {loading ? (
        <div className="text-center py-16 text-gray-500 text-sm font-bold">Carregando seu progresso...</div>
      ) : grouped.length === 0 ? (
        <div className="text-center py-16 bg-[#2a2a2a] rounded-[2rem] border border-white/5">
          <FredAvatar expression="motivado" className="w-24 h-32 mx-auto mb-4 opacity-90" />
          <p className="text-white font-black">Não achei nenhum tema com essa busca.</p>
          <p className="text-gray-500 text-sm mt-1">Tenta outra palavra — ou limpa os filtros.</p>
          <button onClick={() => { setQuery(''); setLevel('ALL'); setStatusFilter('all'); }} className="mt-5 px-6 py-3 bg-[#333333] text-gray-300 rounded-2xl text-xs font-black uppercase tracking-widest hover:text-white">Limpar filtros</button>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map(({ level: lv, items }) => {
            const doneHere = FRED_CATALOG.filter(c => c.level === lv && statusOf(c.id) === 'done').length;
            const totalHere = FRED_CATALOG.filter(c => c.level === lv).length;
            return (
              <section key={lv} className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className={`px-3 py-1.5 rounded-xl bg-gradient-to-br ${LEVEL_COLOR[lv]} text-white font-black text-sm shadow-lg`}>{lv}</div>
                  <div className="flex-1">
                    <p className="text-white font-black uppercase tracking-tight text-sm">{LEVEL_LABEL[lv]}</p>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{doneHere}/{totalHere} concluídos</p>
                  </div>
                  <div className="hidden md:block w-40 h-1.5 bg-black/40 rounded-full overflow-hidden">
                    <div className="h-full bg-[#f7931e] rounded-full transition-all" style={{ width: `${totalHere ? (doneHere / totalHere) * 100 : 0}%` }} />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {items.map(c => {
                    const st = statusOf(c.id);
                    const isReady = !!ready[c.id];
                    const l = lessons[c.id];
                    return (
                      <button key={c.id} onClick={() => onOpenLesson(c)}
                        className={`group flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all hover:-translate-y-0.5 ${
                          st === 'done' ? 'bg-[#222222] border-green-500/25 hover:border-green-500/60'
                          : st === 'progress' ? 'bg-[#222222] border-[#f7931e]/40 hover:border-[#f7931e]'
                          : 'bg-[#2a2a2a] border-white/5 hover:border-[#f7931e]/60'
                        }`}>
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-xs font-black ${st === 'done' ? 'bg-green-500/15 text-green-400' : 'bg-[#333333] text-gray-400 group-hover:text-[#f7931e]'}`}>
                          {st === 'done' ? <CheckCircle2 className="w-5 h-5" /> : String(c.order + 1).padStart(2, '0')}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-black text-sm leading-tight">{c.topic}</p>
                          <p className="text-[10px] font-bold uppercase tracking-widest mt-1 flex items-center gap-1.5">
                            {st === 'done' ? (
                              <span className="text-green-400">Concluído · melhor nota {l?.bestPct ?? 0}%</span>
                            ) : st === 'progress' ? (
                              <span className="text-[#f7931e]">Em andamento</span>
                            ) : isReady ? (
                              <span className="text-gray-500 flex items-center gap-1"><Zap className="w-3 h-3 text-yellow-400" /> Pronta para ler</span>
                            ) : (
                              <span className="text-gray-600 flex items-center gap-1"><Clock className="w-3 h-3" /> Fred prepara na hora (~1 min)</span>
                            )}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-[#f7931e] group-hover:translate-x-1 transition-all shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <div className="flex justify-center pt-2">
        <button onClick={onHome} className="px-8 py-4 bg-[#2a2a2a] text-gray-400 rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center gap-2 hover:text-white transition-all border border-white/5">
          <Home className="w-4 h-4" /> Voltar ao início
        </button>
      </div>
    </div>
  );
};

export default FredExplainsScreen;
