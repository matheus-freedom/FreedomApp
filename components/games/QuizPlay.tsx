import React, { useEffect, useMemo, useState } from 'react';
import { Check, Flame, Headphones, Loader2, X } from 'lucide-react';
import { showToast } from '../Toast';
import { GameRoom, GamesApiError, gamesApi, toLocal } from '../../services/gamesApi';
import { gameAudio } from '../../services/gameAudio';
import { CAT_META } from '../../duelConfig';
import { pickEnglishVoice } from '../challenges/DuelGame';
import { ANSWER_STYLES, Avatar, GZ, TimerRing, useNow } from './theme';

// ════════════════════════════════════════════════════════════════
// QUIZ PARTY — durante a partida
// ────────────────────────────────────────────────────────────────
// Cada pergunta tem 3 momentos, todos comandados pelo servidor:
//   1) "Prepare-se" (3s): a pergunta aparece, as alternativas não —
//      dá tempo de LER antes de sair clicando (importante para quem
//      está aprendendo inglês).
//   2) Valendo: 20s (30s em Leitura/Listening). Quanto mais rápido o
//      acerto, mais pontos (de 1000 a 500) + bônus de sequência.
//   3) Resultado: a certa acende, aparece a explicação e o placar.
// No modo professor a mesma tela vira "telão": letras grandes, conta
// de quem já respondeu e o gráfico de respostas.
// ════════════════════════════════════════════════════════════════

interface Props { room: GameRoom; uid: string; accept: (r: GameRoom) => void }

const QuizPlay: React.FC<Props> = ({ room, uid, accept }) => {
  const q = room.q!;
  const now = useNow(100);
  const presenter = room.hostId === uid && !room.hostPlays;
  const me = room.players[uid];
  const [picked, setPicked] = useState<{ n: number; choice: number } | null>(null);
  const [sending, setSending] = useState(false);
  const startsAt = toLocal(q.startsAt), endsAt = toLocal(q.endsAt);
  const intro = now < startsAt;
  const reveal = room.phase === 'reveal' && room.reveal && room.reveal.n === q.n ? room.reveal : null;
  const leftMs = intro ? q.ms : Math.max(0, endsAt - now);
  const myPick = picked && picked.n === q.n ? picked.choice : null;
  const answeredCount = Object.keys(room.answered || {}).length;
  const activeCount = room.order.filter((u) => room.players[u] && !room.players[u].left).length;
  const cat = CAT_META[q.cat];

  // ── Sons e fala ─────────────────────────────────────────────
  useEffect(() => {
    gameAudio.fx('whoosh');
    const ts: number[] = [];
    const until = Math.max(0, startsAt - Date.now());
    [3, 2, 1].forEach((s) => { const at = until - s * 1000; if (at > 0) ts.push(window.setTimeout(() => gameAudio.fx('countdown'), at)); });
    ts.push(window.setTimeout(() => { gameAudio.fx('go'); if (q.cat === 'listening' && q.audio && !presenterMuteTts) speak(q.audio); }, until));
    return () => { ts.forEach(clearTimeout); window.speechSynthesis?.cancel(); gameAudio.duck(false); };
  }, [q.n]); // eslint-disable-line react-hooks/exhaustive-deps

  const secs = Math.ceil(leftMs / 1000);
  useEffect(() => {
    if (!intro && !reveal && myPick === null && secs <= 5 && secs > 0) gameAudio.fx(secs <= 3 ? 'tock' : 'tick');
    if (!intro && !reveal && secs === 0) gameAudio.fx('timeup');
  }, [secs]); // eslint-disable-line react-hooks/exhaustive-deps

  const myResult = reveal && reveal.results[uid];
  useEffect(() => {
    if (!reveal) return;
    if (presenter || !myResult) { gameAudio.fx('reveal'); return; }
    gameAudio.fx(myResult.ok ? 'correct' : 'wrong');
    if (myResult.ok && navigator.vibrate) navigator.vibrate(40);
  }, [reveal?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  const answer = async (i: number) => {
    if (presenter || !me || myPick !== null || intro || reveal || sending) return;
    setPicked({ n: q.n, choice: i });
    setSending(true);
    gameAudio.fx('pop');
    try {
      const r = await gamesApi.answer(room.id, q.n, i);
      if (r.room) accept(r.room);
    } catch (e) {
      if (e instanceof GamesApiError && e.code === 'DUP') return;
      setPicked(null);
      showToast(e instanceof Error ? e.message : 'Não deu para responder.', 'error');
    } finally { setSending(false); }
  };

  const ranking = useMemo(() => (room.standings || []).slice(0, presenter ? 8 : 5), [room.standings, presenter]);
  const myStanding = (room.standings || []).find((s) => s.uid === uid);

  return (
    <div className="space-y-4">
      {/* Barra de cima */}
      <div className="flex items-center gap-3">
        <span className="gz-chip gz-num" style={{ background: GZ.cream, color: GZ.ink }}>{q.n + 1} de {q.total}</span>
        <span className="gz-chip" style={{ background: cat.color, color: GZ.ink }}>{cat.emoji} {cat.label}</span>
        <div className="ml-auto flex items-center gap-3">
          {!presenter && me && <span className="text-lg font-semibold gz-num" aria-label="Seus pontos">⭐ {me.score.toLocaleString('pt-BR')}</span>}
          {presenter && !reveal && <span className="text-lg font-semibold gz-num">{answeredCount} de {activeCount} responderam</span>}
          {!reveal && <TimerRing leftMs={leftMs} totalMs={q.ms} size={presenter ? 84 : 60} />}
        </div>
      </div>

      {/* Pergunta */}
      <div className="gz-card p-5 md:p-7" style={{ background: GZ.cream, color: GZ.ink }}>
        {q.passage && (
          <div className="gz-read mb-4 p-4 rounded-2xl text-[15px] md:text-base leading-relaxed max-h-56 overflow-y-auto gz-scroll" style={{ background: '#f3ede0', border: `2px solid ${GZ.ink}` }}>
            {q.passage}
          </div>
        )}
        {q.cat === 'listening' && q.audio && (
          <button onClick={() => speak(q.audio!)} className="gz-btn gz-btn-pink gz-btn-sm mb-4"><Headphones className="w-4 h-4" /> Ouvir de novo</button>
        )}
        <p className={`gz-read font-extrabold leading-snug ${presenter ? 'text-3xl md:text-5xl' : 'text-xl md:text-3xl'}`}>{q.q}</p>
        {intro && (
          <div className="mt-5">
            <p className="font-semibold mb-2">Prepare-se…</p>
            <div className="h-3 rounded-full overflow-hidden" style={{ background: '#e2d6bd', border: `2px solid ${GZ.ink}` }}>
              <div key={q.n} className="h-full origin-left" style={{ background: GZ.orange, animation: `gzBar ${Math.max(0.2, (startsAt - Date.now()) / 1000)}s linear forwards` }} />
            </div>
          </div>
        )}
      </div>

      {/* Alternativas */}
      {!intro && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
          {q.options.map((opt, i) => {
            const st = ANSWER_STYLES[i];
            const isRight = reveal && reveal.answer === i;
            const isMine = myPick === i || (reveal && myResult?.choice === i);
            const faded = (reveal && !isRight) || (!reveal && myPick !== null && myPick !== i);
            const total = reveal ? reveal.dist.reduce((a, b) => a + b, 0) || 1 : 1;
            return (
              <button key={i} onClick={() => answer(i)} disabled={presenter || !!reveal || myPick !== null || !me}
                className="gz-tile relative text-left flex items-center gap-3 p-4 md:p-5 min-h-[76px] gz-pop"
                style={{ background: st.color, color: GZ.ink, opacity: faded ? 0.35 : 1, animationDelay: `${i * 60}ms`, transform: isRight ? 'scale(1.02)' : undefined }}
                aria-label={`Alternativa ${st.name}: ${opt}`}>
                <span className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ background: 'rgba(34,34,34,.15)' }} aria-hidden>{st.shape}</span>
                <span className={`gz-read font-extrabold flex-1 ${presenter ? 'text-xl md:text-2xl' : 'text-base md:text-lg'}`}>{opt}</span>
                {reveal && (
                  <span className="flex items-center gap-1.5 shrink-0">
                    {isRight && <Check className="w-7 h-7" strokeWidth={3.5} />}
                    {!isRight && isMine && <X className="w-6 h-6" strokeWidth={3.5} />}
                    {(presenter || room.mode === 'party') && <span className="gz-num font-semibold text-sm px-2 py-0.5 rounded-lg" style={{ background: 'rgba(34,34,34,.18)' }}>{reveal.dist[i]}</span>}
                  </span>
                )}
                {reveal && (presenter || room.mode === 'party') && (
                  <span className="absolute left-0 bottom-0 h-1.5 rounded-b-2xl" style={{ width: `${(reveal.dist[i] / total) * 100}%`, background: GZ.ink, opacity: 0.35 }} />
                )}
                {!reveal && myPick === i && <Loader2 className={`w-5 h-5 ${sending ? 'animate-spin' : 'opacity-0'}`} />}
              </button>
            );
          })}
        </div>
      )}

      {/* Respondeu, esperando */}
      {!reveal && myPick !== null && !presenter && room.mode === 'party' && (
        <p className="text-center font-medium" style={{ color: GZ.muted }}>Resposta enviada! {answeredCount} de {activeCount} já responderam…</p>
      )}

      {/* Resultado da pergunta */}
      {reveal && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="gz-card p-5 lg:col-span-3 relative overflow-hidden">
            {!presenter && myResult && (
              <div className="flex items-center gap-3 mb-3 gz-pop">
                <span className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: myResult.ok ? GZ.lime : GZ.coral, color: GZ.ink, border: `3px solid ${GZ.ink}` }}>
                  {myResult.ok ? <Check className="w-7 h-7" strokeWidth={3.5} /> : <X className="w-7 h-7" strokeWidth={3.5} />}
                </span>
                <div>
                  <p className="text-2xl font-bold">{myResult.ok ? `+${myResult.pts}` : myResult.choice === null ? 'O tempo acabou' : 'Não foi dessa vez'}</p>
                  {myResult.ok && myResult.streak >= 2 && <p className="text-sm flex items-center gap-1" style={{ color: GZ.orange }}><Flame className="w-4 h-4" /> {myResult.streak} acertos seguidos</p>}
                </div>
                {myResult.ok && <span className="absolute right-6 top-4 text-3xl font-bold gz-rise" style={{ color: GZ.green }} aria-hidden>+{myResult.pts}</span>}
              </div>
            )}
            {reveal.explain && (
              <p className="gz-read text-[15px] md:text-base leading-relaxed" style={{ color: GZ.text }}>
                <b style={{ color: '#0e7490' }}>Por quê? </b>{reveal.explain}
              </p>
            )}
          </div>
          {room.mode === 'party' && (
            <div className="gz-card p-5 lg:col-span-2">
              <p className="font-semibold mb-3">Placar</p>
              <MiniBoard room={room} rows={ranking} uid={uid} big={presenter} />
              {!presenter && myStanding && myStanding.place > ranking.length && (
                <p className="text-sm mt-3" style={{ color: GZ.muted }}>Você está em {myStanding.place}º com {myStanding.score.toLocaleString('pt-BR')} pontos.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Quem já respondeu (bolinhas) */}
      {!reveal && room.mode === 'party' && (
        <div className="flex flex-wrap gap-1.5 justify-center" aria-label="Quem já respondeu">
          {room.order.filter((u) => room.players[u] && !room.players[u].left).map((u) => (
            <span key={u} title={room.players[u].username} style={{ opacity: room.answered?.[u] ? 1 : 0.3, transition: 'opacity .3s' }}>
              <Avatar photo={room.players[u].photo} name={room.players[u].username || room.players[u].name} size={presenter ? 40 : 28} />
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

// No telão, o professor costuma dar o áudio pela própria chamada.
// Mesmo assim falamos em todos os aparelhos: cada aluno está em casa.
const presenterMuteTts = false;

const speak = (text: string) => {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  const v = pickEnglishVoice();
  if (v) u.voice = v;
  u.lang = 'en-US';
  u.rate = 0.9;
  u.onstart = () => gameAudio.duck(true);
  u.onend = () => gameAudio.duck(false);
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
};

export const MiniBoard: React.FC<{ room: GameRoom; rows: { uid: string; place: number; score: number }[]; uid: string; big?: boolean }> = ({ room, rows, uid, big }) => {
  const medal = ['🥇', '🥈', '🥉'];
  return (
    <ol className="space-y-2">
      {rows.map((r) => {
        const p = room.players[r.uid];
        if (!p) return null;
        const d = room.phase === 'reveal' ? room.reveal?.results[r.uid]?.pts || 0 : 0;
        return (
          <li key={r.uid} className="gz-inset flex items-center gap-3 p-2.5" style={{ outline: r.uid === uid ? `2px solid ${GZ.orange}` : undefined }}>
            <span className={`w-8 text-center font-bold gz-num ${big ? 'text-2xl' : 'text-lg'}`}>{medal[r.place - 1] || `${r.place}º`}</span>
            <Avatar photo={p.photo} name={p.username || p.name} size={big ? 44 : 34} />
            <span className={`flex-1 truncate font-semibold ${big ? 'text-lg' : ''}`}>{p.username || p.name}</span>
            {d > 0 && <span className="text-xs font-semibold gz-num" style={{ color: GZ.green }}>+{d}</span>}
            <span className={`font-bold gz-num ${big ? 'text-xl' : ''}`}>{r.score.toLocaleString('pt-BR')}</span>
          </li>
        );
      })}
    </ol>
  );
};

export default QuizPlay;
