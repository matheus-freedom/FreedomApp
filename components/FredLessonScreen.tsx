import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronRight, CheckCircle2, XCircle, Lightbulb, AlertTriangle, Sparkles, ThumbsUp, ThumbsDown, Loader2, RefreshCw, Trophy, Dumbbell, Languages, Quote, ListChecks, Play, Map as MapIcon } from 'lucide-react';
import { Level, Theme, UserSession } from '../types';
import { CatalogEntry, FRED_CATALOG, FredLesson, FredOrigin, LessonProgress, LessonQuiz, LESSON_PASS_PCT, LESSON_XP, parseBold, splitParagraphs, scoreLocally } from '../fredExplains';
import { api } from '../services/api';
import { showToast } from './Toast';
import FredAvatar, { FredExpression } from './FredAvatar';
import { saveFredDraft, loadFredDraft, clearFredDraft } from '../services/fredDraft';
import { pingActivity } from '../services/activity';

// ══════════════════════════════════════════════════════════════
// FRED EXPLICA — a aula
// ──────────────────────────────────────────────────────────────
// Como funciona a leitura:
//  1) A tela pede a aula à function (api.getFredLesson). Se ela já
//     existe no banco, chega na hora. Se não, o servidor manda gerar
//     e respondemos "generating": aí escutamos o documento no
//     Firestore (onSnapshot) e, quando a background function grava
//     a aula, ela aparece sozinha — sem F5.
//  2) As seções aparecem UMA de cada vez ("Continuar"): ler tudo de
//     uma vez é o que faz gramática parecer um muro de texto. Quando
//     a seção tem mini-quiz, o aluno precisa responder para seguir.
//  3) No fim: pegadinhas, resumo e o checkpoint (5 questões). O
//     servidor corrige e dá +XP uma vez por tema.
//  Quem já concluiu o tema entra em "modo revisão": tudo aberto.
// ══════════════════════════════════════════════════════════════

interface FredLessonScreenProps {
  user: UserSession;
  entry: CatalogEntry;
  onBack: () => void;
  onOpenLesson: (entry: CatalogEntry) => void;
  onUserUpdate: (u: UserSession) => void;
  // "Praticar este tema": abre um exercício normal de gramática.
  onPractice: (level: Level, theme: Theme, topic: string) => void;
  // Quando a aula foi aberta de um Step da Journey: a tela troca o
  // "voltar" por "voltar à trilha" e, no fim, oferece o exercício
  // seguinte daquele Step em vez de "próximo tema".
  journeyOrigin?: FredOrigin | null;
  // Inicia o exercício da trilha. Devolve false se foi recusado (cota
  // do dia estourada abre o modal de compra) — aí o botão destrava.
  onStartJourneyExercise?: () => Promise<boolean>;
}

type DocState = 'loading' | 'generating' | 'ready' | 'failed' | 'error';

const MOOD_LABEL: Record<FredExpression, string> = {
  perfil: 'Fred explica', feliz: 'Fred comemora', surpreso: 'Fred se surpreende', triste: 'Fred alerta', motivado: 'Fred desafia', professor: 'Fred ensina',
};

// ── Texto do Fred (parágrafos + **negrito**) ──────────────────
const FredText: React.FC<{ text: string; className?: string }> = ({ text, className = '' }) => (
  <div className={`space-y-3 ${className}`}>
    {splitParagraphs(text).map((p, i) => (
      <p key={i} className="text-[15px] md:text-base text-gray-200 leading-relaxed font-medium">
        {parseBold(p).map((piece, j) => piece.bold
          ? <strong key={j} className="text-[#f7931e] font-black">{piece.text}</strong>
          : <React.Fragment key={j}>{piece.text}</React.Fragment>)}
      </p>
    ))}
  </div>
);

// ── Questão de múltipla escolha com correção na hora ──────────
const QuizCard: React.FC<{
  quiz: LessonQuiz;
  label: string;
  chosen: number | null;
  onChoose: (idx: number) => void;
  userName: string;
}> = ({ quiz, label, chosen, onChoose, userName }) => {
  const answered = chosen !== null;
  const correct = answered && chosen === quiz.correctIndex;
  const letters = ['A', 'B', 'C', 'D'];
  return (
    <div className={`rounded-[1.75rem] border-2 p-5 md:p-6 transition-all ${answered ? (correct ? 'border-green-500/50 bg-green-500/5' : 'border-red-500/40 bg-red-500/5') : 'border-[#f7931e]/40 bg-[#f7931e]/5'}`}>
      <div className="flex items-center gap-2 mb-3">
        <ListChecks className={`w-4 h-4 ${answered ? (correct ? 'text-green-400' : 'text-red-400') : 'text-[#f7931e]'}`} />
        <p className={`text-[10px] font-black uppercase tracking-[0.2em] ${answered ? (correct ? 'text-green-400' : 'text-red-400') : 'text-[#f7931e]'}`}>{label}</p>
      </div>
      <p className="text-white font-black text-base md:text-lg leading-snug mb-4">{quiz.question}</p>
      <div className="grid grid-cols-1 gap-2">
        {quiz.options.map((opt, i) => {
          const isRight = i === quiz.correctIndex;
          const isChosen = chosen === i;
          let cls = 'bg-[#222222] border-white/5 hover:border-[#f7931e]/60 hover:bg-[#f7931e]/5 text-gray-200';
          if (answered) {
            if (isRight) cls = 'bg-green-500/15 border-green-500 text-white';
            else if (isChosen) cls = 'bg-red-500/10 border-red-500 text-gray-300 line-through decoration-red-400';
            else cls = 'bg-[#222222] border-white/5 text-gray-600';
          }
          return (
            <button key={i} disabled={answered} onClick={() => onChoose(i)}
              className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 text-left text-sm font-bold transition-all disabled:cursor-default ${cls}`}>
              <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-black shrink-0 ${answered && isRight ? 'bg-green-500 text-[#222222]' : answered && isChosen ? 'bg-red-500 text-white' : 'bg-[#333333] text-gray-400'}`}>{letters[i]}</span>
              <span className="flex-1">{opt}</span>
              {answered && isRight && <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />}
              {answered && isChosen && !isRight && <XCircle className="w-5 h-5 text-red-400 shrink-0" />}
            </button>
          );
        })}
      </div>
      {answered && (
        <div className="mt-4 flex items-start gap-3 animate-fade-in">
          <FredAvatar expression={correct ? 'feliz' : 'triste'} className="w-12 h-16 shrink-0" />
          <div className="flex-1 bg-[#222222] border border-white/5 rounded-2xl p-4">
            <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${correct ? 'text-green-400' : 'text-red-400'}`}>
              {correct ? `Isso, ${userName}!` : 'Quase!'}
            </p>
            <p className="text-sm text-gray-300 leading-relaxed">
              {parseBold(quiz.explanation || (correct ? 'Você pegou a ideia.' : `A certa era a ${letters[quiz.correctIndex]}.`)).map((piece, j) => piece.bold ? <strong key={j} className="text-white font-black">{piece.text}</strong> : <React.Fragment key={j}>{piece.text}</React.Fragment>)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

const FredLessonScreen: React.FC<FredLessonScreenProps> = ({ user, entry, onBack, onOpenLesson, onUserUpdate, onPractice, journeyOrigin = null, onStartJourneyExercise }) => {
  const [docState, setDocState] = useState<DocState>('loading');
  const [lesson, setLesson] = useState<FredLesson | null>(null);
  const [progress, setProgress] = useState<LessonProgress | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [waitSeconds, setWaitSeconds] = useState(0);

  // Leitura progressiva
  const [revealed, setRevealed] = useState(1);
  const [sectionAnswers, setSectionAnswers] = useState<Record<number, number>>({});
  const [finalAnswers, setFinalAnswers] = useState<Record<number, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [finalResult, setFinalResult] = useState<{ score: number; total: number; pct: number; passed: boolean; xpGained: number; alreadyCompleted: boolean } | null>(null);
  const [vote, setVote] = useState<'up' | 'down' | null>(null);

  const firstName = (user.userName || '').split(' ')[0] || 'você';
  const alreadyDone = !!progress?.completedAt;
  const bottomRef = useRef<HTMLDivElement>(null);
  // Trava do botão "fazer o exercício da trilha" (evita clique duplo e
  // mostra o spinner enquanto o exercício é preparado).
  const [startingJourney, setStartingJourney] = useState(false);
  const goToJourneyExercise = async () => {
    if (!onStartJourneyExercise || startingJourney) return;
    setStartingJourney(true);
    const ok = await onStartJourneyExercise();
    if (!ok) setStartingJourney(false);
  };

  // ── Carrega (ou acompanha a geração) ──────────────────────────
  useEffect(() => {
    let unsub: (() => void) | null = null;
    let alive = true;
    setDocState('loading'); setLesson(null); setProgress(null); setRevealed(1);
    setSectionAnswers({}); setFinalAnswers({}); setFinalResult(null); setVote(null); setWaitSeconds(0);
    // Retomada: se este aluno já tinha começado ESTA aula (aba
    // recarregou, sessão caiu...), volta para onde parou.
    const draft = loadFredDraft(user.userId);
    if (draft && draft.lessonId === entry.id) {
      setRevealed(draft.revealed);
      setSectionAnswers(draft.sectionAnswers);
      setFinalAnswers(draft.finalAnswers);
    }

    (async () => {
      try {
        const res = await api.getFredLesson(entry.id);
        if (!alive) return;
        if (res.status === 'ready' && res.lesson) {
          setLesson(res.lesson); setProgress(res.progress || null); setDocState('ready');
          return;
        }
        if (res.status === 'failed') { setErrorMsg(res.error || ''); setDocState('failed'); return; }
        setDocState('generating');
        // Acompanha em tempo real até ficar pronta.
        unsub = api.subscribeFredLesson(entry.id, (d) => {
          if (!alive || !d) return;
          if (d.status === 'ready' && d.lesson) {
            setLesson(d.lesson); setDocState('ready');
            api.getFredProgress(user.userId).then(p => alive && setProgress(p?.lessons?.[entry.id] || null));
            unsub?.(); unsub = null;
          } else if (d.status === 'error' && (d.attempts || 0) >= 3) {
            setErrorMsg('O Fred tentou algumas vezes e não conseguiu preparar esta aula. Avise o professor, por favor.');
            setDocState('failed'); unsub?.(); unsub = null;
          } else if (d.status === 'error') {
            // Falhou, mas ainda há tentativas: pedir de novo faz o servidor
            // redisparar a geração. Sem isto o aluno ficaria esperando
            // um doc que nunca mais mudaria.
            api.getFredLesson(entry.id).catch(() => {});
          }
        });
      } catch (e) {
        if (!alive) return;
        setErrorMsg(e instanceof Error ? e.message : 'Não consegui carregar a aula.');
        setDocState('error');
      }
    })();
    return () => { alive = false; unsub?.(); };
  }, [entry.id, user.userId]);

  // Contador de espera (só informativo).
  useEffect(() => {
    if (docState !== 'generating') return;
    const t = setInterval(() => setWaitSeconds(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [docState]);

  // Salva o progresso da leitura a cada mudança (seção aberta, resposta
  // de mini-quiz ou do checkpoint). Barato: só um JSON pequeno no
  // localStorage. Também conta como "sinal de vida" para o timer de
  // inatividade — responder um quiz é o oposto de estar ausente.
  useEffect(() => {
    if (docState !== 'ready' || !lesson || finalResult) return;
    pingActivity();
    saveFredDraft(user.userId, { lessonId: entry.id, revealed, sectionAnswers, finalAnswers, origin: journeyOrigin, active: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docState, revealed, sectionAnswers, finalAnswers]);

  // Quem já concluiu vê tudo aberto (modo revisão).
  useEffect(() => {
    if (docState === 'ready' && lesson && alreadyDone) setRevealed(lesson.sections.length + 1);
  }, [docState, lesson, alreadyDone]);

  // Rola até a seção recém-aberta.
  useEffect(() => {
    if (revealed > 1) setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }, [revealed]);

  const total = lesson?.sections.length || 0;
  const allSectionsRevealed = revealed > total;
  const finalDone = lesson ? Object.keys(finalAnswers).length === lesson.finalQuiz.length : false;
  const localFinal = useMemo(() => lesson ? scoreLocally(lesson.finalQuiz, lesson.finalQuiz.map((_, i) => finalAnswers[i] ?? -1)) : null, [lesson, finalAnswers]);

  // Barra de progresso: seções + checkpoint.
  const stepsTotal = total + 1;
  const stepsDone = Math.min(revealed - 1, total) + (finalResult ? 1 : 0);

  const nextEntry = useMemo(() => {
    const same = FRED_CATALOG.filter(c => c.level === entry.level);
    return same.find(c => c.order === entry.order + 1) || null;
  }, [entry]);

  const canContinue = (idx: number) => {
    const s = lesson!.sections[idx];
    return s.quiz.length === 0 || sectionAnswers[idx] !== undefined;
  };

  const handleSubmitFinal = async () => {
    if (!lesson || submitting) return;
    setSubmitting(true);
    try {
      const answers = lesson.finalQuiz.map((_, i) => finalAnswers[i] ?? -1);
      const r = await api.completeFredLesson(entry.id, answers);
      setFinalResult({ score: r.score, total: r.total, pct: r.pct, passed: r.passed, xpGained: r.xpGained, alreadyCompleted: r.alreadyCompleted });
      // Checkpoint entregue: o rascunho cumpriu o papel dele.
      clearFredDraft(user.userId);
      setProgress(r.progress);
      if (r.xpGained > 0 && r.totalXp !== null) {
        const today = new Date().toISOString().split('T')[0];
        onUserUpdate({
          ...user,
          gamification: {
            ...user.gamification,
            xp: r.totalXp,
            dailyXpEarned: (user.gamification.lastXpGainDate === today ? user.gamification.dailyXpEarned : 0) + r.xpGained,
            lastXpGainDate: today,
          },
        });
        showToast(`+${r.xpGained} XP! Tema concluído. 🎓`, 'success');
      }
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Não consegui registrar seu checkpoint. Tente de novo.', 'error', 7000);
    }
    setSubmitting(false);
  };

  const handleVote = async (v: 'up' | 'down') => {
    if (vote === v) return;
    setVote(v);
    try { await api.sendFredFeedback(entry.id, v); showToast(v === 'up' ? 'Valeu! O Fred agradece. 💛' : 'Anotado — o professor vai revisar esta aula.', 'info'); }
    catch { /* silencioso: feedback é opcional */ }
  };

  const retryLoad = async () => {
    setDocState('loading');
    try {
      const res = await api.getFredLesson(entry.id);
      if (res.status === 'ready' && res.lesson) { setLesson(res.lesson); setProgress(res.progress || null); setDocState('ready'); }
      else if (res.status === 'failed') { setErrorMsg(res.error || ''); setDocState('failed'); }
      else { setDocState('generating'); setWaitSeconds(0); }
    } catch (e) { setErrorMsg(e instanceof Error ? e.message : 'Erro'); setDocState('error'); }
  };

  // ── Cabeçalho comum ───────────────────────────────────────────
  const header = (
    <div className="flex items-center gap-3">
      <button onClick={onBack} title={journeyOrigin ? 'Voltar à trilha' : 'Todos os temas'} className="p-3 rounded-2xl bg-[#2a2a2a] border border-white/5 text-gray-400 hover:text-white transition-all flex items-center gap-2">
        <ArrowLeft className="w-5 h-5" />{journeyOrigin && <MapIcon className="w-4 h-4 text-[#f7931e]" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#f7931e]">Fred explica · {entry.level}{journeyOrigin ? ` · ${journeyOrigin.stepLabel}` : ''}</p>
        <p className="text-white font-black truncate">{entry.topic}</p>
      </div>
      {docState === 'ready' && (
        <div className="hidden md:flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-500">
          {alreadyDone && <span className="text-green-400 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Concluído</span>}
        </div>
      )}
    </div>
  );

  // ── Estados de carregamento ───────────────────────────────────
  if (docState !== 'ready' || !lesson) {
    return (
      <div className="max-w-3xl mx-auto py-6 md:py-10 space-y-6 animate-fade-in">
        {header}
        <div className="bg-[#2a2a2a] rounded-[2.5rem] border border-white/10 p-8 md:p-12 text-center shadow-2xl">
          {docState === 'loading' && (<>
            <Loader2 className="w-14 h-14 text-[#f7931e] animate-spin mx-auto mb-4" />
            <p className="text-white font-black">Abrindo a aula...</p>
          </>)}
          {docState === 'generating' && (<>
            <FredAvatar expression="professor" className="w-40 h-52 mx-auto mb-4 animate-pulse" />
            <h3 className="text-2xl font-black text-white uppercase tracking-tighter mb-2">Estou escrevendo esta aula agora</h3>
            <p className="text-gray-400 text-sm leading-relaxed max-w-md mx-auto">
              Você é a primeira pessoa a pedir <span className="text-white font-bold">{entry.topic}</span> — capricho leva mais ou menos um minuto. Depois de pronta, ela abre na hora para todo mundo.
            </p>
            <div className="mt-6 inline-flex items-center gap-2 bg-[#222222] border border-white/5 rounded-2xl px-5 py-3">
              <Loader2 className="w-4 h-4 text-[#f7931e] animate-spin" />
              <span className="text-xs font-black text-gray-300">{waitSeconds}s</span>
            </div>
            {waitSeconds > 150 && (
              <div className="mt-6 space-y-3">
                <p className="text-xs text-gray-500">Está demorando mais que o normal.</p>
                <button onClick={retryLoad} className="px-6 py-3 bg-[#333333] text-white rounded-2xl text-xs font-black uppercase tracking-widest flex items-center gap-2 mx-auto"><RefreshCw className="w-4 h-4" /> Tentar de novo</button>
              </div>
            )}
          </>)}
          {(docState === 'failed' || docState === 'error') && (<>
            <FredAvatar expression="triste" className="w-32 h-40 mx-auto mb-4" />
            <h3 className="text-xl font-black text-white mb-2">Não deu desta vez</h3>
            <p className="text-gray-400 text-sm max-w-md mx-auto leading-relaxed">{errorMsg}</p>
            <div className="mt-6 flex gap-3 justify-center">
              <button onClick={retryLoad} className="px-6 py-3 bg-[#f7931e] text-[#222222] rounded-2xl text-xs font-black uppercase tracking-widest flex items-center gap-2"><RefreshCw className="w-4 h-4" /> Tentar de novo</button>
              <button onClick={onBack} className="px-6 py-3 bg-[#333333] text-gray-300 rounded-2xl text-xs font-black uppercase tracking-widest">Voltar</button>
            </div>
          </>)}
        </div>
      </div>
    );
  }

  // ── A aula ────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto py-6 md:py-10 space-y-6 animate-fade-in pb-24">
      {header}

      {/* Barra de progresso (sticky abaixo do header do app) */}
      <div className="sticky top-[76px] z-30 -mx-4 px-4 py-2 bg-[#222222]/90 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 bg-black/40 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-[#f7931e] to-[#ff5e3a] rounded-full transition-all duration-500" style={{ width: `${(stepsDone / stepsTotal) * 100}%` }} />
          </div>
          <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest shrink-0">{Math.min(revealed, total)}/{total} seções{finalResult ? ' · ✓' : ''}</span>
        </div>
      </div>

      {/* Capa */}
      <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#2a2a2a] shadow-2xl">
        <div className="absolute -right-20 -top-20 w-72 h-72 rounded-full bg-gradient-to-br from-[#f7931e] to-[#ff5e3a] opacity-20 blur-3xl" />
        <div className="relative p-6 md:p-8 flex flex-col md:flex-row gap-6 items-center">
          <FredAvatar expression="professor" className="w-32 h-40 md:w-36 md:h-44 shrink-0 drop-shadow-[0_15px_30px_rgba(247,147,30,0.3)]" />
          <div className="flex-1 text-center md:text-left">
            <div className="flex items-center gap-2 justify-center md:justify-start mb-2">
              <span className="text-[9px] font-black uppercase tracking-[0.2em] bg-[#f7931e] text-[#222222] px-2 py-0.5 rounded">{entry.level}</span>
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-500">{total} seções · {lesson.finalQuiz.length} questões no checkpoint</span>
            </div>
            <h1 className="text-2xl md:text-4xl font-black text-white tracking-tight leading-tight mb-3">{lesson.title}</h1>
            <div className="relative bg-[#222222] border border-white/5 rounded-2xl p-4 md:p-5">
              <Quote className="absolute -top-3 -left-2 w-6 h-6 text-[#f7931e] fill-current opacity-80" />
              <FredText text={lesson.hook} />
            </div>
          </div>
        </div>
      </div>

      {/* Seções */}
      {lesson.sections.slice(0, Math.min(revealed, total)).map((s, idx) => {
        const isLast = idx === Math.min(revealed, total) - 1;
        return (
          <section key={idx} ref={isLast && !allSectionsRevealed ? bottomRef : undefined} className="space-y-4 animate-fade-in scroll-mt-32">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#f7931e] text-[#222222] flex items-center justify-center font-black text-sm shadow-lg shadow-[#f7931e]/30">{idx + 1}</div>
              <h2 className="text-xl md:text-2xl font-black text-white tracking-tight leading-tight">{s.heading}</h2>
            </div>

            <div className="flex flex-col md:flex-row gap-4 items-start">
              <div className="shrink-0 flex md:flex-col items-center gap-2 md:w-28">
                <FredAvatar expression={s.mood} className="w-20 h-24 md:w-28 md:h-32" />
                <span className="text-[9px] font-black uppercase tracking-widest text-gray-600 text-center">{MOOD_LABEL[s.mood]}</span>
              </div>
              <div className="flex-1 min-w-0 space-y-4">
                <div className="relative bg-[#2a2a2a] border border-white/10 rounded-[1.75rem] rounded-tl-md p-5 md:p-6 shadow-xl">
                  <FredText text={s.body} />
                </div>

                {s.examples.length > 0 && (
                  <div className="bg-[#1e1e1e] border border-white/5 rounded-[1.5rem] p-4 md:p-5 space-y-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2"><Languages className="w-3.5 h-3.5" /> Exemplos</p>
                    {s.examples.map((ex, i) => (
                      <div key={i} className="pl-4 border-l-2 border-[#f7931e]/60">
                        <p className="text-white font-black text-base leading-snug">{ex.en}</p>
                        <p className="text-gray-400 text-sm italic mt-0.5">{ex.pt}</p>
                        {ex.note && <p className="text-[#f7931e] text-xs font-bold mt-1">↳ {ex.note}</p>}
                      </div>
                    ))}
                  </div>
                )}

                {s.ptAnalogy && (
                  <div className="bg-gradient-to-br from-sky-500/10 to-purple-500/10 border border-sky-400/20 rounded-[1.5rem] p-4 md:p-5">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-300 mb-2 flex items-center gap-2">🇧🇷 E no português?</p>
                    <FredText text={s.ptAnalogy} />
                  </div>
                )}

                {s.tip && (
                  <div className="flex items-start gap-3 bg-yellow-400/5 border border-yellow-400/20 rounded-2xl p-4">
                    <Lightbulb className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-gray-200 leading-relaxed font-medium">
                      {parseBold(s.tip).map((piece, j) => piece.bold ? <strong key={j} className="text-[#f7931e] font-black">{piece.text}</strong> : <React.Fragment key={j}>{piece.text}</React.Fragment>)}
                    </p>
                  </div>
                )}

                {s.quiz.length > 0 && (
                  <QuizCard
                    quiz={s.quiz[0]}
                    label="Mini-quiz · você pegou?"
                    chosen={sectionAnswers[idx] ?? null}
                    onChoose={(i) => setSectionAnswers(a => ({ ...a, [idx]: i }))}
                    userName={firstName}
                  />
                )}

                {isLast && !allSectionsRevealed && (
                  <button disabled={!canContinue(idx)} onClick={() => setRevealed(r => r + 1)}
                    className="w-full py-4 bg-[#f7931e] text-[#222222] rounded-2xl font-black uppercase tracking-widest text-sm flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100 shadow-lg shadow-[#f7931e]/20">
                    {!canContinue(idx) ? 'Responda o mini-quiz para continuar' : idx + 1 === total ? 'Ver pegadinhas e resumo' : 'Continuar'} <ChevronRight className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          </section>
        );
      })}

      {/* Pegadinhas, resumo e checkpoint */}
      {allSectionsRevealed && (
        <div ref={bottomRef} className="space-y-6 animate-fade-in scroll-mt-32">
          {lesson.mistakes.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-3">
                <FredAvatar expression="triste" className="w-14 h-16" />
                <div>
                  <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">Pegadinhas para brasileiros</h2>
                  <p className="text-xs text-gray-500 font-bold">Os erros que o Fred mais vê — e que fazem ele chorar um pouquinho.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {lesson.mistakes.map((m, i) => (
                  <div key={i} className="bg-[#2a2a2a] border border-red-500/20 rounded-[1.5rem] p-4 md:p-5">
                    <div className="flex items-start gap-2"><XCircle className="w-4 h-4 text-red-400 mt-1 shrink-0" /><p className="text-gray-400 line-through decoration-red-400/70 font-bold">{m.wrong}</p></div>
                    <div className="flex items-start gap-2 mt-1"><CheckCircle2 className="w-4 h-4 text-green-400 mt-1 shrink-0" /><p className="text-white font-black">{m.right}</p></div>
                    {m.why && <p className="text-sm text-gray-400 mt-2 leading-relaxed pl-6">{m.why}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-3">
            <div className="flex items-center gap-3">
              <FredAvatar expression="feliz" className="w-14 h-16" />
              <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">Resumo do Fred</h2>
            </div>
            <div className="bg-gradient-to-br from-[#f7931e]/15 to-[#ff5e3a]/10 border border-[#f7931e]/30 rounded-[1.75rem] p-5 md:p-6 space-y-2.5">
              {lesson.summary.map((line, i) => (
                <div key={i} className="flex items-start gap-3">
                  <Sparkles className="w-4 h-4 text-[#f7931e] shrink-0 mt-1" />
                  <p className="text-gray-100 font-medium leading-relaxed">{line}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <FredAvatar expression="motivado" className="w-14 h-16" />
              <div>
                <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">Checkpoint</h2>
                <p className="text-xs text-gray-500 font-bold">
                  {alreadyDone ? `Você já concluiu este tema (melhor nota ${progress?.bestPct ?? 0}%). Refazer é só para revisar.` : `${lesson.finalQuiz.length} questões. Acerte ${LESSON_PASS_PCT}% ou mais e ganhe +${LESSON_XP} XP.`}
                </p>
              </div>
            </div>
            {lesson.finalQuiz.map((q, i) => (
              <QuizCard key={i} quiz={q} label={`Questão ${i + 1} de ${lesson.finalQuiz.length}`}
                chosen={finalAnswers[i] ?? null}
                onChoose={(c) => setFinalAnswers(a => ({ ...a, [i]: c }))}
                userName={firstName} />
            ))}

            {!finalResult ? (
              <button disabled={!finalDone || submitting} onClick={handleSubmitFinal}
                className="w-full py-5 bg-[#f7931e] text-[#222222] rounded-2xl font-black uppercase tracking-widest text-sm flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100 shadow-xl shadow-[#f7931e]/20">
                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trophy className="w-5 h-5" />}
                {submitting ? 'Corrigindo...' : !finalDone ? `Responda as ${lesson.finalQuiz.length} questões` : `Concluir checkpoint${localFinal ? ` (${localFinal.score}/${localFinal.total})` : ''}`}
              </button>
            ) : (
              <div className={`rounded-[2rem] border-2 p-6 md:p-8 text-center animate-pop ${finalResult.passed ? 'border-green-500/40 bg-green-500/5' : 'border-[#f7931e]/40 bg-[#f7931e]/5'}`}>
                <FredAvatar expression={finalResult.pct >= 90 ? 'surpreso' : finalResult.passed ? 'feliz' : 'motivado'} className="w-32 h-40 mx-auto mb-3" />
                <h3 className="text-3xl font-black text-white uppercase tracking-tighter">{finalResult.score}/{finalResult.total} · {finalResult.pct}%</h3>
                <p className="text-gray-300 font-medium mt-2 max-w-md mx-auto leading-relaxed">
                  {finalResult.pct >= 90 ? `Isso foi de mestre, ${firstName}. Esse tema é seu.`
                    : finalResult.passed ? `Mandou bem, ${firstName}! O tema está entendido — agora é praticar para virar automático.`
                    : `Faltou pouco. Dá uma relida no resumo e nas pegadinhas e tenta o checkpoint de novo — não tem limite de tentativas.`}
                </p>
                {finalResult.xpGained > 0 && (
                  <div className="mt-4 inline-flex items-center gap-2 bg-[#222222] border border-yellow-400/30 rounded-2xl px-5 py-3">
                    <Sparkles className="w-5 h-5 text-yellow-400" /><span className="text-yellow-400 font-black">+{finalResult.xpGained} XP</span>
                  </div>
                )}
                {finalResult.passed && finalResult.xpGained === 0 && (
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mt-4">{finalResult.alreadyCompleted ? 'Tema já concluído antes — sem XP na repetição' : 'Teto diário de XP atingido — a conclusão foi registrada'}</p>
                )}
                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {!finalResult.passed && (
                    <button onClick={() => { setFinalAnswers({}); setFinalResult(null); }} className="py-4 bg-[#f7931e] text-[#222222] rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2"><RefreshCw className="w-4 h-4" /> Refazer checkpoint</button>
                  )}
                  {journeyOrigin ? (
                    // Veio da trilha: o caminho natural é o exercício do Step
                    // (não a prática livre, que gastaria cota fora da trilha).
                    <>
                      <button disabled={startingJourney} onClick={goToJourneyExercise}
                        className="py-5 bg-[#f7931e] text-[#222222] rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 md:col-span-2 hover:scale-[1.02] transition-transform shadow-xl shadow-[#f7931e]/20 disabled:opacity-60 disabled:scale-100">
                        {startingJourney ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                        {startingJourney ? 'Preparando o exercício...' : `Fazer o exercício de ${journeyOrigin.nextLabel} · ${journeyOrigin.stepLabel}`}
                      </button>
                      <button onClick={onBack} className="py-4 bg-[#333333] text-white rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 border border-white/10 hover:border-[#f7931e]/50 md:col-span-2"><MapIcon className="w-4 h-4 text-[#f7931e]" /> Voltar ao mapa da trilha</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => onPractice(entry.level, Theme.Grammar, entry.topic)} className="py-4 bg-[#333333] text-white rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 border border-white/10 hover:border-[#f7931e]/50"><Dumbbell className="w-4 h-4 text-[#f7931e]" /> Praticar este tema</button>
                      {nextEntry && finalResult.passed && (
                        <button onClick={() => onOpenLesson(nextEntry)} className="py-4 bg-[#f7931e] text-[#222222] rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 md:col-span-2">Próximo tema: {nextEntry.topic} <ChevronRight className="w-4 h-4" /></button>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Veio da trilha e não passou pelo checkpoint agora (ex.: já
              tinha concluído o tema e só releu): mesmo assim o exercício
              do Step fica a um clique. */}
          {journeyOrigin && !finalResult && (
            <div className="rounded-[2rem] border-2 border-[#f7931e]/40 bg-[#f7931e]/5 p-5 md:p-6 flex flex-col md:flex-row items-center gap-4">
              <FredAvatar expression="motivado" className="w-16 h-20 shrink-0" />
              <div className="flex-1 text-center md:text-left">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#f7931e]">{journeyOrigin.stepLabel}</p>
                <p className="text-white font-black">Entendeu a teoria? Então bora praticar na trilha.</p>
                <p className="text-xs text-gray-400 font-bold mt-0.5">O checkpoint acima é opcional — vale +{LESSON_XP} XP na primeira vez.</p>
              </div>
              <button disabled={startingJourney} onClick={goToJourneyExercise}
                className="shrink-0 px-6 py-4 bg-[#f7931e] text-[#222222] rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform disabled:opacity-60 disabled:scale-100">
                {startingJourney ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                {startingJourney ? 'Preparando...' : `Exercício de ${journeyOrigin.nextLabel}`}
              </button>
            </div>
          )}

          {/* Feedback sobre a aula */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-[#2a2a2a] border border-white/5 rounded-[1.5rem] p-4 md:p-5">
            <p className="text-sm text-gray-400 font-bold">Esta explicação ajudou?</p>
            <div className="flex gap-2">
              <button onClick={() => handleVote('up')} className={`px-4 py-2.5 rounded-xl border text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all ${vote === 'up' ? 'bg-green-500 text-[#222222] border-green-500' : 'bg-[#222222] text-gray-400 border-white/5 hover:text-white'}`}><ThumbsUp className="w-4 h-4" /> Sim</button>
              <button onClick={() => handleVote('down')} className={`px-4 py-2.5 rounded-xl border text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all ${vote === 'down' ? 'bg-red-500 text-white border-red-500' : 'bg-[#222222] text-gray-400 border-white/5 hover:text-white'}`}><ThumbsDown className="w-4 h-4" /> Não muito</button>
            </div>
          </div>

          <div className="flex justify-center">
            <button onClick={onBack} className="px-8 py-4 bg-[#2a2a2a] text-gray-400 rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center gap-2 hover:text-white transition-all border border-white/5"><ArrowLeft className="w-4 h-4" /> {journeyOrigin ? 'Voltar à trilha' : 'Todos os temas'}</button>
          </div>
        </div>
      )}

      {!allSectionsRevealed && (
        <div className="flex items-center gap-2 justify-center text-[10px] font-black uppercase tracking-widest text-gray-600">
          <AlertTriangle className="w-3 h-3" /> Leia no seu ritmo — seu progresso nesta aula fica salvo neste aparelho, e o tema aparece como "em andamento" no catálogo.
        </div>
      )}
    </div>
  );
};

export default FredLessonScreen;
