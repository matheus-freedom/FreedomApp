import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Clock, Flag, Headphones, Loader2, RotateCcw, Scissors, SkipForward, Trophy, Zap, Coins, X, Crown, Swords } from 'lucide-react';
import { showToast } from '../Toast';
import FredAvatar from '../FredAvatar';
import { Duel, DuelApiError, DuelResult, duelApi, serverNow } from '../../services/duelApi';
import { CAT_META, CATEGORIES, DuelCategory, MAX_TURNS, METER_MAX, WHEEL, WheelSlot } from '../../duelConfig';
import Wheel, { targetRotation } from './Wheel';
import { CatDot, CrownRow, PlayerAvatar, fr, timeLeftLabel } from './ui';

// ════════════════════════════════════════════════════════════════
// TELA DA PARTIDA — Duelo da Roleta
// ────────────────────────────────────────────────────────────────
// Máquina de estados simples, guiada pelo que o SERVIDOR diz:
//   duel.phase = 'spin'       → mostra a roleta (se for a minha vez)
//   duel.phase = 'crown_pick' → escolher a categoria da coroa
//   duel.phase = 'question'   → pergunta com cronômetro
// Por cima disso, a tela guarda só o que é visual: a animação da
// roleta, a alternativa clicada e o "feedback" depois de responder.
//
// Detalhe importante: quando o servidor devolve o giro, a resposta
// JÁ traz a pergunta. A tela segura essa informação ("staged") até
// a roleta parar — senão a pergunta apareceria antes da animação.
// ════════════════════════════════════════════════════════════════

const GRACE_MS = 5000;
const POLL_MS = 8000;

interface Props {
  duelId: string;
  initial?: Duel | null;
  uid: string;
  onBack: () => void;
  onChanged: () => void;                // avisa o hub para recarregar (saldo, lista)
  onRematch: (opponentId: string, stake: number) => void;
}

type Feedback = { result: DuelResult; event: string; timedOut?: boolean; next: Duel };

const vibrate = (p: number | number[]) => { try { navigator.vibrate?.(p); } catch { /* sem suporte */ } };

const DuelGame: React.FC<Props> = ({ duelId, initial, uid, onBack, onChanged, onRematch }) => {
  const [duel, setDuel] = useState<Duel | null>(initial || null);
  const [busy, setBusy] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [splash, setSplash] = useState<WheelSlot | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const staged = useRef<Duel | null>(null);

  const load = useCallback(async () => {
    try {
      const { duel: d } = await duelApi.get(duelId);
      // Não atropela uma animação/feedback em andamento.
      if (!spinning && !feedback) setDuel(d);
      return d;
    } catch (e) {
      if (e instanceof DuelApiError && e.status === 404) { showToast('Duelo não encontrado.', 'error'); onBack(); }
      return null;
    }
  }, [duelId, spinning, feedback, onBack]);

  // Sempre confere o estado real ao abrir: a cópia que veio da lista
  // pode ter até 20s de atraso.
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const me = uid;
  const opp = duel ? (duel.players[0] === me ? duel.players[1] : duel.players[0]) : '';
  const myTurn = !!duel && duel.status === 'active' && duel.turn === me;

  // Enquanto espero o adversário (ou o aceite), consulto o servidor de
  // tempos em tempos. Para quando a aba fica escondida (economiza
  // chamadas e bateria).
  useEffect(() => {
    if (!duel) return;
    const waiting = duel.status === 'invited' || (duel.status === 'active' && duel.turn !== me);
    if (!waiting) return;
    const t = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
    return () => clearInterval(t);
  }, [duel?.status, duel?.turn, me, load]); // eslint-disable-line react-hooks/exhaustive-deps

  // Duelo terminou nesta tela → avisa o hub (saldo, XP, lista).
  const finishedRef = useRef(duel?.status === 'finished');
  useEffect(() => {
    if (duel?.status === 'finished' && !finishedRef.current) {
      finishedRef.current = true;
      onChanged();
      if (duel.winner === me) { setCelebrate(true); vibrate([60, 40, 60, 40, 120]); }
    }
  }, [duel?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleError = (e: unknown) => {
    const msg = e instanceof Error ? e.message : 'Algo deu errado.';
    showToast(msg, 'error');
    // Jogada "velha" (outra aba, clique duplo): recarrega o estado real.
    if (e instanceof DuelApiError && (e.code === 'STALE' || e.status === 409)) load();
  };

  // ── Girar ─────────────────────────────────────────────────────
  const spin = async () => {
    if (!duel || busy || spinning) return;
    setBusy(true);
    try {
      const res = await duelApi.spin(duel.id);
      staged.current = res.duel;
      setSpinning(true);
      setRotation(r => targetRotation(r, res.slot));
      setTimeout(() => {
        setSplash(WHEEL[res.slot]);
        vibrate(30);
        setTimeout(() => {
          setSplash(null);
          setSpinning(false);
          setPicked(null);
          if (staged.current) setDuel(staged.current);
          staged.current = null;
        }, 1100);
      }, 3700);
    } catch (e) { handleError(e); }
    finally { setBusy(false); }
  };

  const pickCrown = async (cat: DuelCategory) => {
    if (!duel || busy) return;
    setBusy(true);
    try { const { duel: d } = await duelApi.pickCrown(duel.id, cat); setPicked(null); setDuel(d); }
    catch (e) { handleError(e); }
    finally { setBusy(false); }
  };

  const answer = async (choice: number) => {
    if (!duel?.question || busy || picked !== null) return;
    setPicked(choice);
    setBusy(true);
    window.speechSynthesis?.cancel();
    try {
      const res = await duelApi.answer(duel.id, duel.question.n, choice);
      vibrate(res.result.ok ? 40 : [80, 50, 80]);
      setFeedback({ result: res.result, event: res.event, timedOut: res.timedOut, next: res.duel });
      if (res.event === 'crown') { setCelebrate(true); setTimeout(() => setCelebrate(false), 2200); }
    } catch (e) { setPicked(null); handleError(e); }
    finally { setBusy(false); }
  };

  const useHelp = async (kind: 'fifty' | 'skip') => {
    if (!duel || busy || picked !== null) return;
    setBusy(true);
    try {
      const { duel: d } = await duelApi.help(duel.id, kind);
      setDuel(d);
      if (kind === 'skip') showToast('Pergunta trocada. O tempo recomeçou!', 'info');
    } catch (e) { handleError(e); }
    finally { setBusy(false); }
  };

  const continueAfterFeedback = () => {
    if (!feedback) return;
    setDuel(feedback.next);
    setFeedback(null);
    setPicked(null);
  };

  const respond = async (accept: boolean) => {
    if (!duel || busy) return;
    setBusy(true);
    try {
      const { duel: d } = await duelApi.respond(duel.id, accept);
      setDuel(d); onChanged();
      if (!accept) onBack();
    } catch (e) {
      // Sem nível: volta ao hub, que abre o "Qual seu nível?" sozinho.
      if (e instanceof DuelApiError && e.code === 'NEED_LEVEL') { showToast('Antes de aceitar, conte pra gente o seu nível 😉', 'info'); onBack(); }
      else handleError(e);
    } finally { setBusy(false); }
  };

  const quit = async () => {
    if (!duel || busy) return;
    setBusy(true);
    try {
      const { duel: d } = await duelApi.forfeit(duel.id);
      setConfirmQuit(false); setDuel(d); onChanged();
      if (d.status !== 'finished') onBack();
    } catch (e) { handleError(e); }
    finally { setBusy(false); }
  };

  if (!duel) {
    return <div className="flex items-center justify-center py-32"><Loader2 className="w-12 h-12 text-[#f7931e] animate-spin" /></div>;
  }

  const meInfo = duel.info[me], oppInfo = duel.info[opp];
  const shown = feedback ? feedback.next : duel;
  const round = Math.min(MAX_TURNS, Math.max(shown.turns[me] || 0, shown.turns[opp] || 0) + 1);

  return (
    <div className="max-w-3xl mx-auto px-4 pt-4 pb-28 animate-fade-in">
      <DuelStyles />
      {celebrate && <Confetti />}

      {/* ── Topo: voltar + menu ─────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={onBack} className="p-3 bg-[#333333] text-gray-400 rounded-2xl border border-white/5 hover:text-white transition-all"><ArrowLeft className="w-5 h-5" /></button>
        <div className="text-center">
          <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.25em]">Duelo da Roleta</p>
          {duel.status === 'active' && <p className="text-xs font-black text-white">Rodada {round} de {MAX_TURNS}</p>}
        </div>
        {duel.status === 'active' || duel.status === 'invited' ? (
          <button onClick={() => setConfirmQuit(true)} className="p-3 bg-[#333333] text-gray-500 rounded-2xl border border-white/5 hover:text-red-400 transition-all" title="Desistir"><Flag className="w-5 h-5" /></button>
        ) : <div className="w-11" />}
      </div>

      {/* ── Placar ──────────────────────────────────────────── */}
      <Scoreboard duel={shown} me={me} opp={opp} />

      {/* ── Corpo ───────────────────────────────────────────── */}
      <div className="mt-6">
        {duel.status === 'invited' && (
          <InviteCard duel={duel} me={me} busy={busy} onRespond={respond} onCancel={() => setConfirmQuit(true)} />
        )}

        {duel.status === 'active' && !myTurn && !feedback && (
          <WaitingCard duel={duel} opp={opp} oppName={oppInfo?.username || 'adversário'} me={me} />
        )}

        {myTurn && !feedback && (duel.phase === 'spin' || spinning) && (
          <div className="flex flex-col items-center">
            <OpponentRecap duel={duel} me={me} opp={opp} />
            <MeterBar value={duel.meter[me] || 0} />
            <div className="relative mt-4">
              <Wheel rotation={rotation} spinning={spinning} onSpin={spin} disabled={busy} size={Math.min(320, typeof window !== 'undefined' ? window.innerWidth - 48 : 320)} />
              {splash && (
                <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
                  <div className="duel-splash px-8 py-5 rounded-[2rem] text-center shadow-2xl" style={{ background: CAT_META[splash].color }}>
                    <p className="text-5xl mb-1">{CAT_META[splash].emoji}</p>
                    <p className="text-2xl font-black text-white uppercase tracking-tight">{CAT_META[splash].label}</p>
                  </div>
                </div>
              )}
            </div>
            <p className="text-gray-500 text-xs font-bold mt-6 text-center max-w-xs">
              Acerte <span className="text-white">3 seguidas</span> para disputar uma coroa. Errou, a vez passa.
            </p>
          </div>
        )}

        {myTurn && !feedback && duel.phase === 'crown_pick' && !spinning && (
          <CrownPicker duel={duel} me={me} busy={busy} onPick={pickCrown} />
        )}

        {((myTurn && duel.phase === 'question' && duel.question && !spinning) || feedback) && (
          <QuestionCard
            key={(feedback ? feedback.result.n : duel.question?.n) || 0}
            duel={duel}
            me={me}
            picked={picked}
            feedback={feedback}
            busy={busy}
            onAnswer={answer}
            onHelp={useHelp}
            onContinue={continueAfterFeedback}
            oppName={oppInfo?.username || 'adversário'}
          />
        )}

        {duel.status === 'finished' && !feedback && (
          <FinishCard duel={duel} me={me} opp={opp} onBack={onBack} onRematch={() => onRematch(opp, duel.stake)} />
        )}

        {['declined', 'expired', 'cancelled'].includes(duel.status) && (
          <div className="bg-[#2a2a2a] rounded-[2rem] p-8 text-center border border-white/5">
            <p className="text-white font-black text-lg mb-2">
              {duel.status === 'declined' ? 'Convite recusado' : duel.status === 'expired' ? 'Convite expirou' : 'Convite cancelado'}
            </p>
            {duel.stake > 0 && <p className="text-gray-400 text-sm">A aposta de {fr(duel.stake)} voltou para quem convidou.</p>}
            <button onClick={onBack} className="mt-6 px-6 py-3 bg-[#333333] text-white rounded-2xl font-black uppercase text-xs tracking-widest">Voltar</button>
          </div>
        )}
      </div>

      {/* ── Confirmar desistência ───────────────────────────── */}
      {confirmQuit && (
        <div className="fixed inset-0 z-[700] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setConfirmQuit(false)}>
          <div className="bg-[#2a2a2a] rounded-[2rem] p-8 max-w-sm w-full border border-white/10 animate-pop" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-black text-white mb-2">
              {duel.status === 'invited' ? (duel.players[0] === me ? 'Cancelar convite?' : 'Recusar convite?') : 'Desistir do duelo?'}
            </h3>
            <p className="text-gray-400 text-sm mb-6">
              {duel.status === 'invited'
                ? (duel.stake > 0 ? `A aposta de ${fr(duel.stake)} volta para quem convidou.` : 'Tudo bem, dá para desafiar de novo depois.')
                : `Desistir conta como derrota (−20 troféus)${duel.stake > 0 ? ` e o pote de ${fr(duel.stake * 2)} vai para ${oppInfo?.username}` : ''}.`}
            </p>
            <div className="flex gap-3">
              <button onClick={quit} disabled={busy} className="flex-1 py-3 bg-red-500 text-white rounded-2xl font-black uppercase text-xs tracking-widest disabled:opacity-50">
                {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Confirmar'}
              </button>
              <button onClick={() => setConfirmQuit(false)} className="flex-1 py-3 bg-[#333333] text-white rounded-2xl font-black uppercase text-xs tracking-widest">Voltar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ════════════════════════════════════════════════════════════════
// Peças da tela
// ════════════════════════════════════════════════════════════════

const Scoreboard: React.FC<{ duel: Duel; me: string; opp: string }> = ({ duel, me, opp }) => {
  // No celular a largura é curta: nome e nível ficam em uma linha
  // cada (sem quebrar) e as coroas encolhem um pouco.
  const side = (uid: string, align: 'left' | 'right') => {
    const info = duel.info[uid] || { username: '?', name: '?', photo: null, level: null };
    const active = duel.status === 'active' && duel.turn === uid;
    return (
      <div className={`min-w-0 flex flex-col ${align === 'right' ? 'items-end text-right' : 'items-start'}`}>
        <div className={`flex items-center gap-2 min-w-0 max-w-full ${align === 'right' ? 'flex-row-reverse' : ''}`}>
          <PlayerAvatar photo={info.photo} name={info.username || info.name} size={40} ring={active ? '#f7931e' : undefined} />
          <div className="min-w-0">
            <p className="text-sm font-black text-white truncate">{uid === me ? 'Você' : info.username}</p>
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest whitespace-nowrap">{info.level || '—'}<span className="hidden sm:inline"> · {duel.correct[uid] || 0} acerto{(duel.correct[uid] || 0) === 1 ? '' : 's'}</span></p>
          </div>
        </div>
        <div className="mt-2.5 hidden sm:block"><CrownRow crowns={duel.crowns[uid] || []} size={20} /></div>
        <div className="mt-2.5 sm:hidden"><CrownRow crowns={duel.crowns[uid] || []} size={15} /></div>
      </div>
    );
  };
  return (
    <div className="bg-[#2a2a2a] rounded-[2rem] p-4 border border-white/5 shadow-xl">
      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2 sm:gap-3">
        {side(me, 'left')}
        <p className="text-2xl font-black text-white tabular-nums pt-1.5 whitespace-nowrap">{(duel.crowns[me] || []).length}<span className="text-gray-600 mx-1">×</span>{(duel.crowns[opp] || []).length}</p>
        {side(opp, 'right')}
      </div>
      {duel.stake > 0 && <p className="text-[9px] font-black text-[#f7931e] uppercase tracking-widest mt-3 flex items-center justify-center gap-1"><Coins className="w-3 h-3" /> pote {fr(duel.stake * 2)}</p>}
    </div>
  );
};

const MeterBar: React.FC<{ value: number }> = ({ value }) => (
  <div className="flex items-center gap-3 mb-2">
    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Rumo à coroa</span>
    <div className="flex gap-1.5">
      {Array.from({ length: METER_MAX }).map((_, i) => (
        <div key={i} className={`w-9 h-3 rounded-full transition-all duration-500 ${i < value ? 'bg-[#f7931e] shadow-[0_0_10px_#f7931e]' : 'bg-[#333333]'}`} />
      ))}
    </div>
    <Crown className={`w-5 h-5 ${value >= METER_MAX ? 'text-[#f7931e]' : 'text-gray-700'}`} />
  </div>
);

// O que o adversário fez na última vez dele (aparece quando a minha vez começa).
const OpponentRecap: React.FC<{ duel: Duel; me: string; opp: string }> = ({ duel, me, opp }) => {
  const recent = useMemo(() => {
    const out: Duel['log'] = [];
    for (let i = duel.log.length - 1; i >= 0; i--) {
      if (duel.log[i].uid === me) break;
      out.unshift(duel.log[i]);
    }
    return out.filter(l => l.uid === opp);
  }, [duel.log, me, opp]);
  if (!recent.length) return null;
  return (
    <div className="w-full bg-[#222222] rounded-2xl border border-white/5 p-3 mb-4">
      <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Na vez de {duel.info[opp]?.username}</p>
      <div className="flex flex-wrap gap-1.5">
        {recent.map((l, i) => (
          <span key={i} className={`flex items-center gap-1 pl-1 pr-2 py-0.5 rounded-full text-[10px] font-black ${l.ok ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
            <CatDot cat={l.cat} size={16} /> {l.kind === 'crown' ? '👑 ' : ''}{l.ok ? '✓' : '✗'}
          </span>
        ))}
      </div>
    </div>
  );
};

const CrownPicker: React.FC<{ duel: Duel; me: string; busy: boolean; onPick: (c: DuelCategory) => void }> = ({ duel, me, busy, onPick }) => {
  const mine = duel.crowns[me] || [];
  return (
    <div className="text-center animate-pop">
      <div className="text-6xl mb-2 duel-bounce">👑</div>
      <h3 className="text-2xl font-black text-white uppercase tracking-tight">Hora da coroa!</h3>
      <p className="text-gray-400 text-sm mb-6">{duel.crownSource === 'wheel' ? 'A roleta caiu na Coroa.' : 'Medidor cheio!'} Escolha qual coroa você quer disputar.</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {CATEGORIES.map(c => {
          const has = mine.includes(c);
          return (
            <button key={c} disabled={has || busy} onClick={() => onPick(c)}
              className="p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all enabled:hover:scale-105 enabled:active:scale-95 disabled:opacity-30"
              style={{ borderColor: CAT_META[c].color, background: `${CAT_META[c].color}22` }}>
              <span className="text-3xl">{CAT_META[c].emoji}</span>
              <span className="text-xs font-black text-white uppercase tracking-widest">{CAT_META[c].label}</span>
              {has && <span className="text-[9px] font-black text-gray-400 uppercase">já é sua</span>}
            </button>
          );
        })}
      </div>
      {busy && <Loader2 className="w-6 h-6 text-[#f7931e] animate-spin mx-auto mt-6" />}
    </div>
  );
};

// ── Pergunta ────────────────────────────────────────────────────
const QuestionCard: React.FC<{
  duel: Duel; me: string; picked: number | null; feedback: Feedback | null; busy: boolean; oppName: string;
  onAnswer: (i: number) => void; onHelp: (k: 'fifty' | 'skip') => void; onContinue: () => void;
}> = ({ duel, me, picked, feedback, busy, oppName, onAnswer, onHelp, onContinue }) => {
  const q = duel.question;
  const result = feedback?.result;
  const cat = (result?.cat || q?.cat) as DuelCategory;
  const color = CAT_META[cat].color;
  const isCrown = (result?.kind || q?.kind) === 'crown';

  // Cronômetro local. Começa do que sobra segundo o servidor (útil ao
  // recarregar a página no meio da pergunta), limitado ao tempo total.
  const [left, setLeft] = useState(() => {
    if (!q) return 0;
    // Pergunta que saiu de um giro começa a contar depois da animação
    // (o servidor já soma esse tempo em askedAt/deadline).
    const byServer = q.deadline - GRACE_MS - serverNow();
    return Math.max(0, Math.min(q.limitMs, byServer));
  });
  const fired = useRef(false);
  useEffect(() => {
    if (!q || feedback || picked !== null) return;
    const end = Date.now() + left;
    const t = setInterval(() => {
      const rest = Math.max(0, end - Date.now());
      setLeft(rest);
      if (rest <= 0 && !fired.current) { fired.current = true; clearInterval(t); onAnswer(-1); }
    }, 100);
    return () => clearInterval(t);
  }, [q?.n, feedback, picked]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listening: o sintetizador de voz do navegador lê a frase (em inglês
  // americano, um pouco mais devagar). Até 2 vezes, como numa prova.
  const [plays, setPlays] = useState(0);
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const speak = () => {
    if (!q?.audio || !canSpeak || plays >= 2) return;
    const u = new SpeechSynthesisUtterance(q.audio);
    u.lang = 'en-US'; u.rate = 0.9;
    const voice = window.speechSynthesis.getVoices().find(v => v.lang === 'en-US') || window.speechSynthesis.getVoices().find(v => v.lang.startsWith('en'));
    if (voice) u.voice = voice;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    setPlays(p => p + 1);
  };
  useEffect(() => () => { window.speechSynthesis?.cancel(); }, []);

  const [reported, setReported] = useState(false);
  const report = async (reason: string) => {
    if (!result?.qid) return;
    setReported(true);
    try { await duelApi.report(duel.id, result.qid, reason); showToast('Obrigado! O Matheus vai revisar essa pergunta.', 'success'); }
    catch { /* sem drama: é só um aviso */ }
  };

  // Na hora do feedback a pergunta some do estado do servidor; a tela
  // usa a cópia que tinha (duel.question do estado anterior).
  const view = q || null;
  if (!view) return null;
  const helps = duel.helps[me] || { fifty: 0, skip: 0 };
  const pct = view.limitMs ? (left / view.limitMs) * 100 : 0;
  const answered = !!result;

  const optionStyle = (i: number) => {
    if (answered) {
      if (i === result!.correctIndex) return 'bg-green-500 border-green-400 text-white scale-[1.02]';
      if (i === result!.choice) return 'bg-red-500/90 border-red-400 text-white duel-shake';
      return 'bg-[#222222] border-white/5 text-gray-600';
    }
    if (picked === i) return 'bg-[#f7931e] border-[#f7931e] text-[#222222]';
    if (view.removed?.includes(i)) return 'bg-[#1d1d1d] border-transparent text-gray-700 line-through';
    return 'bg-[#222222] border-white/10 text-white hover:border-white/40 active:scale-[0.98]';
  };

  const next = feedback?.next;
  const nextLabel = !feedback ? '' :
    next?.status === 'finished' ? 'Ver resultado' :
    feedback.event === 'meter_full' ? 'Escolher coroa 👑' :
    feedback.event === 'crown' || feedback.event === 'correct' ? 'Girar de novo' :
    `Passar a vez para ${oppName}`;

  return (
    <div className="animate-pop">
      <div className="rounded-[2rem] overflow-hidden border-2 shadow-2xl" style={{ borderColor: color }}>
        {/* Cabeçalho da categoria */}
        <div className="px-5 py-3 flex items-center justify-between" style={{ background: color }}>
          <div className="flex items-center gap-2">
            <span className="text-2xl">{CAT_META[cat].emoji}</span>
            <div>
              <p className="text-white font-black uppercase tracking-tight leading-none">{CAT_META[cat].label}</p>
              {isCrown && <p className="text-[10px] font-black text-white/90 uppercase tracking-widest">👑 Pergunta da coroa</p>}
            </div>
          </div>
          {!answered && (
            <div className="flex items-center gap-1.5 bg-black/25 rounded-full px-3 py-1">
              <Clock className="w-4 h-4 text-white" />
              <span className="text-white font-black tabular-nums">{Math.ceil(left / 1000)}s</span>
            </div>
          )}
        </div>
        {!answered && (
          <div className="h-1.5 bg-black/40">
            <div className="h-full transition-[width] duration-100 ease-linear" style={{ width: `${pct}%`, background: pct < 25 ? '#ef4444' : '#ffffff' }} />
          </div>
        )}

        <div className="bg-[#2a2a2a] p-5 md:p-6">
          {view.passage && (
            <div className="bg-[#222222] rounded-2xl p-4 mb-4 border border-white/5">
              <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-line">{view.passage}</p>
            </div>
          )}
          {view.audio && (
            <div className="mb-4">
              {canSpeak ? (
                <button onClick={speak} disabled={plays >= 2 || answered}
                  className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest text-sm flex items-center justify-center gap-3 transition-all ${plays === 0 && !answered ? 'duel-pulse' : ''} disabled:opacity-40`}
                  style={{ background: `${color}33`, color: '#fff', border: `2px solid ${color}` }}>
                  <Headphones className="w-5 h-5" /> {plays === 0 ? 'Ouvir o áudio' : plays === 1 ? 'Ouvir de novo (última vez)' : 'Áudio ouvido 2×'}
                </button>
              ) : (
                <p className="text-xs text-gray-400 bg-[#222222] rounded-xl p-3">Seu navegador não fala em voz alta. Texto do áudio: <span className="text-white">“{view.audio}”</span></p>
              )}
              {answered && <p className="text-xs text-gray-400 mt-3">Áudio: <span className="text-white italic">“{view.audio}”</span></p>}
            </div>
          )}

          <h3 className="text-lg md:text-xl font-black text-white leading-snug mb-5">{view.q}</h3>

          <div className="grid gap-2.5">
            {view.options.map((o, i) => (
              <button key={i} onClick={() => onAnswer(i)} disabled={answered || busy || picked !== null || view.removed?.includes(i)}
                className={`w-full text-left px-4 py-3.5 rounded-2xl border-2 font-bold text-sm md:text-base transition-all duration-200 flex items-center gap-3 ${optionStyle(i)}`}>
                <span className="w-7 h-7 rounded-lg bg-black/20 flex items-center justify-center text-xs font-black shrink-0">{'ABCD'[i]}</span>
                <span className="flex-1">{o}</span>
                {picked === i && !answered && <Loader2 className="w-4 h-4 animate-spin" />}
              </button>
            ))}
          </div>

          {/* Ajudas */}
          {!answered && (
            <div className="flex gap-2 mt-4">
              <button onClick={() => onHelp('fifty')} disabled={!helps.fifty || busy || picked !== null || (view.removed || []).length > 0}
                className="flex-1 py-2.5 rounded-xl bg-[#222222] border border-white/10 text-xs font-black uppercase tracking-widest text-gray-300 flex items-center justify-center gap-2 disabled:opacity-30 enabled:hover:border-[#f7931e]/50">
                <Scissors className="w-4 h-4 text-[#f7931e]" /> 50/50 {helps.fifty ? '' : '(usado)'}
              </button>
              <button onClick={() => onHelp('skip')} disabled={!helps.skip || busy || picked !== null}
                className="flex-1 py-2.5 rounded-xl bg-[#222222] border border-white/10 text-xs font-black uppercase tracking-widest text-gray-300 flex items-center justify-center gap-2 disabled:opacity-30 enabled:hover:border-[#f7931e]/50">
                <SkipForward className="w-4 h-4 text-[#f7931e]" /> Trocar {helps.skip ? '' : '(usado)'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Feedback com o Fred */}
      {feedback && result && (
        <div className="mt-4 bg-[#2a2a2a] rounded-[2rem] border border-white/5 p-5 animate-pop">
          <div className="flex items-start gap-4">
            <FredAvatar expression={result.ok ? (feedback.event === 'crown' ? 'surpreso' : 'feliz') : 'motivado'} className="w-20 h-20 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className={`text-lg font-black ${result.ok ? 'text-green-400' : 'text-red-400'}`}>
                {feedback.event === 'crown' ? 'Coroa conquistada! 👑' :
                  result.ok ? (feedback.event === 'meter_full' ? 'Medidor cheio!' : 'Acertou!') :
                  feedback.timedOut || result.choice === -1 ? 'O tempo acabou!' : 'Não foi dessa vez.'}
              </p>
              {result.explain && <p className="text-gray-300 text-sm mt-1 leading-relaxed">{result.explain}</p>}
              {!reported && result.qid && (
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <span className="text-[10px] text-gray-600 font-bold uppercase tracking-widest flex items-center gap-1"><Flag className="w-3 h-3" /> Problema?</span>
                  {['Gabarito errado', 'Duas corretas', 'Texto confuso'].map(r => (
                    <button key={r} onClick={() => report(r)} className="text-[10px] font-black text-gray-500 hover:text-white px-2 py-1 rounded-lg bg-[#222222] border border-white/5">{r}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <button onClick={onContinue} className="w-full mt-5 py-4 bg-[#f7931e] text-[#222222] rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-[#e08215] transition-all shadow-xl shadow-[#f7931e]/20">
            {nextLabel}
          </button>
        </div>
      )}
    </div>
  );
};

const InviteCard: React.FC<{ duel: Duel; me: string; busy: boolean; onRespond: (a: boolean) => void; onCancel: () => void }> = ({ duel, me, busy, onRespond, onCancel }) => {
  const creator = duel.info[duel.players[0]];
  const iAmInvited = duel.players[1] === me;
  return (
    <div className="bg-[#2a2a2a] rounded-[2rem] p-8 text-center border border-white/5 shadow-xl">
      <Swords className="w-14 h-14 text-[#f7931e] mx-auto mb-4" />
      {iAmInvited ? (
        <>
          <h3 className="text-2xl font-black text-white mb-2">{creator?.username} te desafiou!</h3>
          <p className="text-gray-400 text-sm mb-2">Duelo da Roleta · 6 coroas · cada um joga na sua hora.</p>
          {duel.stake > 0
            ? <p className="text-[#f7931e] font-black text-sm mb-6 flex items-center justify-center gap-2"><Coins className="w-4 h-4" /> Aposta: {fr(duel.stake)} de cada um (quem vencer leva {fr(duel.stake * 2)})</p>
            : <p className="text-gray-500 text-xs mb-6">Sem aposta.</p>}
          <div className="flex flex-col sm:flex-row gap-3">
            <button onClick={() => onRespond(true)} disabled={busy} className="flex-1 py-4 bg-[#f7931e] text-[#222222] rounded-2xl font-black uppercase tracking-widest hover:scale-[1.02] transition-all disabled:opacity-50">
              {busy ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Aceitar ⚔️'}
            </button>
            <button onClick={() => onRespond(false)} disabled={busy} className="flex-1 py-4 bg-[#333333] text-gray-300 rounded-2xl font-black uppercase tracking-widest">Agora não</button>
          </div>
          <p className="text-[10px] text-gray-600 mt-4 uppercase tracking-widest">Expira em {timeLeftLabel(duel.expiresAt)}</p>
        </>
      ) : (
        <>
          <h3 className="text-2xl font-black text-white mb-2">Convite enviado!</h3>
          <p className="text-gray-400 text-sm mb-6">Assim que {duel.info[duel.players[1]]?.username} aceitar, você começa girando. Expira em {timeLeftLabel(duel.expiresAt)}.</p>
          <button onClick={onCancel} className="px-6 py-3 bg-[#333333] text-gray-300 rounded-2xl font-black uppercase text-xs tracking-widest">Cancelar convite</button>
        </>
      )}
    </div>
  );
};

const WaitingCard: React.FC<{ duel: Duel; opp: string; oppName: string; me: string }> = ({ duel, oppName, me }) => {
  const last = duel.lastResult && duel.lastResult.uid === me ? duel.lastResult : null;
  return (
    <div className="bg-[#2a2a2a] rounded-[2rem] p-8 text-center border border-white/5 shadow-xl">
      <div className="text-5xl mb-3 duel-bounce">⏳</div>
      <h3 className="text-xl font-black text-white mb-1">Vez de {oppName}</h3>
      <p className="text-gray-400 text-sm">Pode sair tranquilo: te esperamos aqui. Prazo da jogada: {timeLeftLabel(duel.turnDeadline)}.</p>
      {last && last.explain && (
        <div className="mt-6 text-left bg-[#222222] rounded-2xl p-4 border border-white/5 flex gap-3">
          <FredAvatar variant="face" className="w-10 h-10 rounded-full shrink-0" />
          <div>
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Sua última pergunta</p>
            <p className="text-gray-300 text-sm">{last.explain}</p>
          </div>
        </div>
      )}
    </div>
  );
};

const FinishCard: React.FC<{ duel: Duel; me: string; opp: string; onBack: () => void; onRematch: () => void }> = ({ duel, me, opp, onBack, onRematch }) => {
  const rw = duel.rewards?.[me];
  const result = duel.winner === null ? 'draw' : duel.winner === me ? 'win' : 'loss';
  const oppName = duel.info[opp]?.username || 'adversário';
  const reason =
    duel.endReason === 'crowns' ? (result === 'win' ? 'Você juntou as 6 coroas!' : `${oppName} juntou as 6 coroas.`) :
    duel.endReason === 'turns' ? `Fim das ${MAX_TURNS} rodadas: ${duel.winner === null ? 'empate em coroas e acertos' : 'decidido por coroas e acertos'}.` :
    duel.endReason === 'forfeit' ? (result === 'win' ? `${oppName} desistiu.` : 'Você desistiu.') :
    (result === 'win' ? `${oppName} não jogou a tempo (W.O.).` : 'O prazo da sua jogada acabou (W.O.).');

  const stats = CATEGORIES.map(c => ({ c, v: duel.catStats[me]?.[c] })).filter(x => x.v && x.v.t > 0);

  return (
    <div className="text-center animate-pop">
      <FredAvatar expression={result === 'win' ? 'surpreso' : result === 'draw' ? 'feliz' : 'motivado'} className="w-32 h-32 mx-auto" />
      <h2 className={`text-4xl font-black uppercase tracking-tighter mt-2 ${result === 'win' ? 'text-[#f7931e]' : result === 'draw' ? 'text-white' : 'text-gray-300'}`}>
        {result === 'win' ? 'Vitória!' : result === 'draw' ? 'Empate!' : 'Derrota'}
      </h2>
      <p className="text-gray-400 text-sm mt-1 mb-6">{reason}</p>

      {rw && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
          <Reward icon={<Zap className="w-4 h-4" />} label="XP" value={`+${rw.xp}`} />
          <Reward icon={<Coins className="w-4 h-4" />} label="Prêmio" value={`+${fr(rw.fr)}`} />
          <Reward icon={<Trophy className="w-4 h-4" />} label="Troféus" value={`${rw.trophies >= 0 ? '+' : ''}${rw.trophies}`} highlight={rw.trophies > 0} />
          <Reward icon={<Coins className="w-4 h-4" />} label={duel.stake > 0 ? 'Pote' : 'Aposta'} value={duel.stake > 0 ? (rw.pot > 0 ? `+${fr(rw.pot)}` : `−${fr(duel.stake)}`) : '—'} highlight={rw.pot > 0} />
        </div>
      )}
      {rw?.capped && <p className="text-[11px] text-gray-500 -mt-3 mb-5">Você bateu o teto diário de prêmios dos duelos — amanhã ele zera. Troféus e pote continuam valendo.</p>}

      {stats.length > 0 && (
        <div className="bg-[#2a2a2a] rounded-[2rem] p-5 border border-white/5 text-left mb-6">
          <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">Seus acertos neste duelo</p>
          <div className="space-y-2">
            {stats.map(({ c, v }) => (
              <div key={c} className="flex items-center gap-3">
                <CatDot cat={c} size={22} />
                <span className="text-xs font-black text-white w-24">{CAT_META[c].label}</span>
                <div className="flex-1 h-2 bg-[#333333] rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(v!.c / v!.t) * 100}%`, background: CAT_META[c].color }} /></div>
                <span className="text-xs font-black text-gray-400 tabular-nums w-10 text-right">{v!.c}/{v!.t}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <button onClick={onRematch} className="flex-1 py-4 bg-[#f7931e] text-[#222222] rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-[#e08215] transition-all shadow-xl shadow-[#f7931e]/20">
          <RotateCcw className="w-5 h-5" /> Revanche
        </button>
        <button onClick={onBack} className="flex-1 py-4 bg-[#333333] text-white rounded-2xl font-black uppercase tracking-widest">Voltar aos desafios</button>
      </div>
    </div>
  );
};

const Reward: React.FC<{ icon: React.ReactNode; label: string; value: string; highlight?: boolean }> = ({ icon, label, value, highlight }) => (
  <div className={`p-3 rounded-2xl border ${highlight ? 'bg-[#f7931e]/10 border-[#f7931e]/30' : 'bg-[#2a2a2a] border-white/5'}`}>
    <div className="flex items-center justify-center gap-1 text-[#f7931e] mb-1">{icon}<span className="text-[9px] font-black uppercase tracking-widest text-gray-500">{label}</span></div>
    <p className="text-lg font-black text-white tabular-nums">{value}</p>
  </div>
);

// Chuva de emojis (vitória / coroa). Só CSS, sem biblioteca.
const Confetti: React.FC = () => {
  const bits = useMemo(() => Array.from({ length: 36 }).map((_, i) => ({
    left: Math.random() * 100, delay: Math.random() * 0.8, dur: 1.8 + Math.random() * 1.4,
    e: ['👑', '⭐', '🎉', '✨', '🧡'][i % 5], size: 16 + Math.random() * 18,
  })), []);
  return (
    <div className="fixed inset-0 pointer-events-none z-[650] overflow-hidden">
      {bits.map((b, i) => (
        <span key={i} className="absolute duel-fall" style={{ left: `${b.left}%`, top: -40, fontSize: b.size, animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s` }}>{b.e}</span>
      ))}
    </div>
  );
};

// Animações usadas só nesta tela.
export const DuelStyles: React.FC = () => (
  <style>{`
    @keyframes duelSpin { to { transform: rotate(360deg); } }
    @keyframes duelFall { to { transform: translateY(110vh) rotate(540deg); opacity: .2; } }
    .duel-fall { animation-name: duelFall; animation-timing-function: linear; animation-fill-mode: forwards; }
    @keyframes duelShake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-6px)} 40%{transform:translateX(6px)} 60%{transform:translateX(-4px)} 80%{transform:translateX(4px)} }
    .duel-shake { animation: duelShake .45s ease; }
    @keyframes duelBounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
    .duel-bounce { animation: duelBounce 1.4s ease-in-out infinite; }
    @keyframes duelPulse { 0%,100%{box-shadow:0 0 0 0 rgba(247,147,30,.5)} 50%{box-shadow:0 0 0 10px rgba(247,147,30,0)} }
    .duel-pulse { animation: duelPulse 1.4s ease-in-out infinite; }
    @keyframes duelSplash { 0%{transform:scale(.3) rotate(-8deg);opacity:0} 60%{transform:scale(1.1) rotate(2deg);opacity:1} 100%{transform:scale(1) rotate(0)} }
    .duel-splash { animation: duelSplash .45s cubic-bezier(.2,1.4,.4,1) forwards; }
  `}</style>
);

export default DuelGame;
