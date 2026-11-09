import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Eraser, Flag, Pencil, Send, Trash2, Undo2, Check } from 'lucide-react';
import { showToast } from '../Toast';
import { DrawWord, GameRoom, REACTIONS, gamesApi, toLocal } from '../../services/gamesApi';
import { Stroke, subscribeStrokes, writeStroke } from '../../services/gamesRealtime';
import { gameAudio } from '../../services/gameAudio';
import { Avatar, GZ, TimerRing, useNow } from './theme';

// ════════════════════════════════════════════════════════════════
// DRAW IT! — durante a partida
// ────────────────────────────────────────────────────────────────
// Quem desenha grava os traços direto no Firestore (em pedacinhos a
// cada 0,1s); os outros escutam e redesenham na hora. Os pontos são
// guardados numa grade de 1000×750, não em pixels: assim o desenho
// fica igual num celular pequeno e num notebook.
//
// Palpites vão para o servidor, que compara com a palavra secreta.
// Palpite ERRADO não aparece para ninguém além de quem digitou (é o
// modo "protegido" combinado para as crianças): os colegas só veem
// "fulano acertou!". Assim ninguém escreve bobagem para a sala.
// ════════════════════════════════════════════════════════════════

const W = 1000, H = 750;
const COLORS = ['#1d1631', '#ffffff', '#ff5a5f', '#f7931e', '#ffc93c', '#38d39f', '#3fd0ff', '#3f8cff', '#a78bfa', '#ff5fa2', '#8b5a2b', '#9ca3af'];
const WIDTHS = [6, 14, 30];
const ERASER = 1; // branco = borracha (o fundo do quadro é branco)

interface Props { room: GameRoom; uid: string; accept: (r: GameRoom) => void }
type MyGuess = { text: string; res: 'wrong' | 'close' | 'ok' | 'wait' };

const DrawPlay: React.FC<Props> = ({ room, uid, accept }) => {
  const now = useNow(250);
  const isDrawer = room.drawer === uid;
  const me = room.players[uid];
  const turn = room.turn || 0;
  const drawer = room.drawer ? room.players[room.drawer] : null;
  const [word, setWord] = useState<DrawWord | null>(null);
  const [choices, setChoices] = useState<DrawWord[] | null>(null);
  const [guesses, setGuesses] = useState<MyGuess[]>([]);
  const [text, setText] = useState('');
  const [floating, setFloating] = useState<{ id: number; e: string; left: number }[]>([]);
  const iGuessed = !!room.guessed?.[uid];

  // Nova vez: limpa o que era da vez anterior.
  useEffect(() => { setWord(null); setChoices(null); setGuesses([]); setText(''); }, [turn]);

  // Quem desenha pergunta ao servidor as opções / a palavra.
  useEffect(() => {
    if (!isDrawer || (room.phase !== 'choose' && room.phase !== 'draw')) return;
    if (room.phase === 'choose' && choices) return;
    if (room.phase === 'draw' && word) return;
    gamesApi.peek(room.id).then((r) => {
      if (r.turn !== turn) return;
      if (r.choices) { setChoices(r.choices); gameAudio.fx('pop'); }
      if (r.word) setWord(r.word);
    }).catch(() => {});
  }, [isDrawer, room.phase, turn]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sons dos acontecimentos da sala (acertos de colegas, reações).
  const lastFeed = useRef<number>(room.feed?.length ? room.feed[room.feed.length - 1].t : 0);
  useEffect(() => {
    const fresh = (room.feed || []).filter((f) => f.t > lastFeed.current);
    if (!fresh.length) return;
    lastFeed.current = fresh[fresh.length - 1].t;
    for (const f of fresh) {
      if (f.k === 'guess' && f.uid !== uid) gameAudio.fx('guess');
      if (f.k === 'react' && f.x !== undefined) {
        gameAudio.fx('react');
        const id = Math.random();
        setFloating((l) => [...l, { id, e: REACTIONS[f.x!], left: 10 + Math.random() * 80 }]);
        setTimeout(() => setFloating((l) => l.filter((x) => x.id !== id)), 1700);
      }
    }
  }, [room.feed, uid]);

  useEffect(() => { if (room.phase === 'turnEnd') gameAudio.fx('reveal'); }, [room.phase, turn]);
  const hints = room.hintsGiven || 0;
  useEffect(() => { if (hints > 0 && !isDrawer) gameAudio.fx('coin'); }, [hints]); // eslint-disable-line react-hooks/exhaustive-deps

  const leftMs = room.phase === 'draw' && room.drawEndsAt ? Math.max(0, toLocal(room.drawEndsAt) - now)
    : room.phase === 'choose' && room.nextAt ? Math.max(0, toLocal(room.nextAt) - now) : 0;
  const totalMs = room.phase === 'draw' ? room.settings.drawMs || 80000 : 15000;
  const secs = Math.ceil(leftMs / 1000);
  useEffect(() => { if (room.phase === 'draw' && secs <= 10 && secs > 0 && !iGuessed) gameAudio.fx(secs <= 3 ? 'tock' : 'tick'); }, [secs]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = async (idx: number) => {
    try {
      const r = await gamesApi.pick(room.id, turn, idx);
      setWord(r.word); setChoices(null); accept(r.room); gameAudio.fx('start');
    } catch (e) { showToast(e instanceof Error ? e.message : 'Não deu para escolher.', 'error'); }
  };

  const sendGuess = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const t = text.trim();
    if (!t || iGuessed || isDrawer || room.phase !== 'draw') return;
    setText('');
    setGuesses((g) => [{ text: t, res: 'wait' as const }, ...g].slice(0, 8));
    try {
      const r = await gamesApi.guess(room.id, t);
      accept(r.room);
      const res = r.result;
      if (res.slow) { setGuesses((g) => g.filter((x, i) => !(i === 0 && x.text === t))); setText(t); return; }
      const kind: MyGuess['res'] = res.ok ? 'ok' : res.close ? 'close' : 'wrong';
      setGuesses((g) => g.map((x, i) => (i === 0 && x.text === t ? { ...x, res: kind } : x)));
      gameAudio.fx(res.ok ? 'correct' : res.close ? 'close' : 'click');
      if (res.ok && navigator.vibrate) navigator.vibrate(40);
    } catch (err) {
      setGuesses((g) => g.slice(1));
      showToast(err instanceof Error ? err.message : 'Não deu para enviar.', 'error');
    }
  };

  const react = (i: number) => { gamesApi.react(room.id, i).then((r) => accept(r.room)).catch(() => {}); };
  const report = async () => {
    if (!window.confirm('Denunciar este desenho como impróprio? Se metade da sala denunciar, ele é apagado.')) return;
    try { const r = await gamesApi.report(room.id); accept(r.room); showToast(r.result.removed ? 'Desenho removido.' : 'Denúncia registrada. Obrigado!', 'success'); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Não deu para denunciar.', 'error'); }
  };

  const players = useMemo(() => room.order.filter((u) => room.players[u] && !room.players[u].left)
    .sort((a, b) => room.players[b].score - room.players[a].score), [room.order, room.players]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
      <div className="space-y-3 min-w-0">
        {/* Barra da palavra */}
        <div className="gz-card p-3 md:p-4 flex items-center gap-3">
          {room.phase !== 'turnEnd' && <TimerRing leftMs={leftMs} totalMs={totalMs} size={54} />}
          <div className="flex-1 min-w-0">
            {room.phase === 'choose' && (
              <p className="font-semibold text-lg">{isDrawer ? 'Escolha a palavra que você vai desenhar' : `${drawer?.username || 'Alguém'} está escolhendo a palavra…`}</p>
            )}
            {room.phase === 'draw' && isDrawer && word && (
              <p className="text-lg md:text-xl font-semibold truncate">Desenhe: <span style={{ color: GZ.orange }}>{word.w}</span> <span className="text-sm font-medium" style={{ color: GZ.muted }}>({word.pt})</span></p>
            )}
            {room.phase === 'draw' && !isDrawer && room.mask && (
              <div>
                <WordMask mask={room.mask} />
                <p className="text-xs mt-1" style={{ color: GZ.muted }}>Category: {room.wordInfo?.c} · {room.wordInfo?.len} letras · desenho de {drawer?.username || '…'}</p>
              </div>
            )}
            {room.phase === 'turnEnd' && <p className="font-semibold text-lg">Fim da vez!</p>}
          </div>
          <span className="gz-chip gz-num hidden sm:inline-flex" style={{ background: GZ.cream, color: GZ.ink }}>Rodada {room.round}/{room.settings.rounds}</span>
        </div>

        {/* Quadro */}
        <div className="relative">
          <DrawCanvas roomId={room.id} uid={uid} turn={turn} canDraw={isDrawer && room.phase === 'draw'} />
          {floating.map((f) => (
            <span key={f.id} className="absolute bottom-6 text-4xl gz-rise pointer-events-none" style={{ left: `${f.left}%` }} aria-hidden>{f.e}</span>
          ))}
          {room.phase === 'choose' && isDrawer && choices && (
            <div className="absolute inset-0 flex items-center justify-center p-4 rounded-[22px]" style={{ background: 'rgba(250,250,248,.95)' }}>
              <div className="w-full max-w-lg space-y-3">
                <p className="text-center text-lg font-semibold">Qual você quer desenhar?</p>
                {choices.map((c, i) => (
                  <button key={c.w} onClick={() => pick(i)} className="gz-btn w-full justify-between text-left py-3.5 gz-pop"
                    style={{ background: [GZ.orange, GZ.cyan, GZ.pink][i], color: GZ.ink, animationDelay: `${i * 70}ms` }}>
                    <span className="text-xl">{c.w}</span>
                    <span className="text-sm font-medium opacity-80">{c.pt}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {room.phase === 'choose' && !isDrawer && (
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-[22px] gap-3" style={{ background: 'rgba(250,250,248,.88)' }}>
              {drawer && <Avatar photo={drawer.photo} name={drawer.username || drawer.name} size={72} ring={GZ.cyan} />}
              <p className="text-lg font-semibold gz-float">{drawer?.username} vai desenhar…</p>
            </div>
          )}
          {room.phase === 'turnEnd' && room.turnResult && <TurnEnd room={room} />}
        </div>

        {/* Palpite / reações */}
        {!isDrawer && room.phase === 'draw' && (
          iGuessed ? (
            <div className="gz-card p-4 flex items-center gap-3" style={{ background: GZ.lime, color: GZ.ink }}>
              <Check className="w-6 h-6" strokeWidth={3} />
              <p className="font-semibold text-lg">Você acertou! +{room.guessed?.[uid]?.pts}. Agora torça pelos colegas.</p>
            </div>
          ) : (
            <form onSubmit={sendGuess} className="flex gap-2">
              <input value={text} onChange={(e) => setText(e.target.value)} maxLength={40} placeholder="Type your guess in English…"
                className="gz-input flex-1 text-lg" autoComplete="off" autoCapitalize="none" spellCheck={false} aria-label="Seu palpite" />
              <button type="submit" disabled={!text.trim()} className="gz-btn gz-btn-orange" aria-label="Enviar palpite"><Send className="w-5 h-5" /></button>
            </form>
          )
        )}
        {guesses.length > 0 && !isDrawer && (
          <div className="flex flex-wrap gap-2" aria-live="polite">
            {guesses.map((g, i) => (
              <span key={`${g.text}${i}`} className="gz-chip" style={{
                background: g.res === 'ok' ? GZ.lime : g.res === 'close' ? '#ffc93c' : GZ.grapeDeep,
                color: g.res === 'ok' || g.res === 'close' ? GZ.ink : GZ.muted,
              }}>
                {g.res === 'close' ? `${g.text} — quase! 🔥` : g.res === 'ok' ? `${g.text} ✓` : g.res === 'wait' ? `${g.text}…` : <s>{g.text}</s>}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          {REACTIONS.map((e, i) => (
            <button key={e} onClick={() => react(i)} className="gz-btn gz-btn-ghost gz-btn-sm text-xl px-2.5" aria-label={`Reagir com ${e}`}>{e}</button>
          ))}
          {!isDrawer && (room.phase === 'draw' || room.phase === 'choose') && (
            <button onClick={report} disabled={!!room.reports?.[uid]} className="gz-btn gz-btn-ghost gz-btn-sm ml-auto" title="Denunciar desenho impróprio">
              <Flag className="w-4 h-4" /> {room.reports?.[uid] ? 'Denunciado' : 'Denunciar'}
            </button>
          )}
        </div>
      </div>

      {/* Lateral: placar e acontecimentos */}
      <div className="space-y-4">
        <div className="gz-card p-4">
          <p className="font-semibold mb-3">Placar</p>
          <ol className="space-y-2">
            {players.map((u, i) => {
              const p = room.players[u];
              const g = room.guessed?.[u];
              return (
                <li key={u} className="gz-inset flex items-center gap-2.5 p-2" style={{ background: g ? 'rgba(182,242,74,.3)' : undefined, outline: u === uid ? `2px solid ${GZ.orange}` : undefined }}>
                  <span className="w-5 text-center font-semibold gz-num text-sm">{i + 1}</span>
                  <Avatar photo={p.photo} name={p.username || p.name} size={32} />
                  <span className="flex-1 truncate font-semibold text-sm">{p.username || p.name}</span>
                  {u === room.drawer && <Pencil className="w-4 h-4" style={{ color: GZ.cyan }} aria-label="Desenhando" />}
                  {g && <Check className="w-4 h-4" style={{ color: GZ.green }} aria-label="Acertou" />}
                  <span className="font-bold gz-num text-sm">{p.score}</span>
                </li>
              );
            })}
          </ol>
        </div>
        <div className="gz-card p-4">
          <p className="font-semibold mb-2">Na sala</p>
          <ul className="space-y-1.5 text-sm max-h-48 overflow-y-auto gz-scroll" aria-live="polite">
            {[...(room.feed || [])].reverse().slice(0, 10).map((f) => (
              <li key={`${f.t}${f.uid}${f.k}`} style={{ color: f.k === 'guess' ? GZ.green : GZ.muted }}>
                {f.k === 'guess' && <>✅ <b>{f.name}</b> acertou!</>}
                {f.k === 'join' && <>👋 {f.name} entrou</>}
                {f.k === 'leave' && <>🚪 {f.name} saiu</>}
                {f.k === 'react' && <>{REACTIONS[f.x || 0]} {f.name}</>}
              </li>
            ))}
          </ul>
        </div>
        {!me && <p className="text-sm" style={{ color: GZ.muted }}>Você está assistindo.</p>}
      </div>
    </div>
  );
};

const WordMask: React.FC<{ mask: (string | null)[] }> = ({ mask }) => (
  <div className="flex flex-wrap gap-1" aria-label={`${mask.filter((c) => c === null).length} letras escondidas`}>
    {mask.map((ch, i) => (ch === ' ' ? <span key={i} className="w-3" /> : ch === '-' ? <span key={i} className="text-xl font-bold">-</span> : (
      <span key={i} className="w-6 md:w-7 h-8 flex items-end justify-center text-xl font-bold" style={{ borderBottom: `3px solid ${GZ.ink}`, color: GZ.orange }}>{ch || ''}</span>
    )))}
  </div>
);

const REASONS: Record<string, string> = {
  all: 'Todo mundo acertou! 🎉',
  time: 'O tempo acabou.',
  drawer_left: 'Quem desenhava saiu da sala.',
  reported: 'O desenho foi removido por denúncia.',
  no_pick: 'Ninguém escolheu a palavra.',
};

const TurnEnd: React.FC<{ room: GameRoom }> = ({ room }) => {
  const r = room.turnResult!;
  const list = Object.entries(r.guessed || {}) as [string, { order: number; pts: number }][];
  list.sort((a, b) => a[1].order - b[1].order);
  return (
    <div className="absolute inset-0 flex items-center justify-center p-4 rounded-[22px]" style={{ background: r.reason === 'reported' ? GZ.grape : 'rgba(250,250,248,.95)' }}>
      <div className="text-center gz-pop max-w-md w-full">
        <p style={{ color: GZ.muted }}>{REASONS[r.reason] || ''}</p>
        {r.word && (
          <>
            <p className="mt-2 text-sm" style={{ color: GZ.muted }}>A palavra era</p>
            <p className="text-4xl md:text-5xl font-bold" style={{ color: GZ.orange }}>{r.word}</p>
            <p className="text-lg" style={{ color: GZ.text }}>{r.pt}</p>
          </>
        )}
        {list.length > 0 && (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {list.map(([u, g]) => (
              <span key={u} className="gz-chip" style={{ background: GZ.lime, color: GZ.ink }}>{room.players[u]?.username} +{g.pts}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ── O quadro ──────────────────────────────────────────────────────
// Agrupa os pedaços por traço e aplica "limpar" e "desfazer".
const groupsOf = (strokes: Stroke[]) => {
  let groups: { sid: string; segs: Stroke[] }[] = [];
  for (const s of strokes) {
    if (s.k === 'c') groups = [];
    else if (s.k === 'u') groups.pop();
    else {
      const last = groups[groups.length - 1];
      if (last && last.sid === s.s) last.segs.push(s); else groups.push({ sid: s.s, segs: [s] });
    }
  }
  return groups;
};

const DrawCanvas: React.FC<{ roomId: string; uid: string; turn: number; canDraw: boolean }> = ({ roomId, uid, turn, canDraw }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const remote = useRef<Stroke[]>([]);
  const local = useRef<Stroke[]>([]);
  const drawnCount = useRef(0);
  const [color, setColor] = useState(0);
  const [width, setWidth] = useState(1);
  const drawing = useRef<{ sid: string; pts: number[]; last: [number, number] } | null>(null);
  const seqBase = useRef(0);
  const flushTimer = useRef<number | null>(null);

  const ctx2d = () => canvasRef.current?.getContext('2d') || null;

  const drawSeg = (ctx: CanvasRenderingContext2D, s: Stroke) => {
    const k = ctx.canvas.width / W;
    ctx.strokeStyle = COLORS[s.c] || COLORS[0];
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = s.w * k;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const p = s.p;
    if (p.length === 2 || (p.length === 4 && p[0] === p[2] && p[1] === p[3])) {
      ctx.beginPath(); ctx.arc(p[0] * k, p[1] * k, (s.w * k) / 2, 0, Math.PI * 2); ctx.fill(); return;
    }
    ctx.beginPath();
    ctx.moveTo(p[0] * k, p[1] * k);
    for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i] * k, p[i + 1] * k);
    ctx.stroke();
  };

  const redraw = useCallback(() => {
    const ctx = ctx2d(); if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    const list = canDraw || local.current.length ? local.current : remote.current;
    for (const g of groupsOf(list)) for (const s of g.segs) drawSeg(ctx, s);
    drawnCount.current = list.length;
  }, [canDraw]);

  // Tamanho do quadro acompanha a largura da tela (nítido em tela retina).
  useLayoutEffect(() => {
    const fit = () => {
      const c = canvasRef.current, w = wrapRef.current; if (!c || !w) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = w.clientWidth;
      c.style.width = `${cssW}px`; c.style.height = `${(cssW * H) / W}px`;
      c.width = Math.round(cssW * dpr); c.height = Math.round(((cssW * H) / W) * dpr);
      redraw();
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [redraw]);

  // Escuta os traços desta vez.
  useEffect(() => {
    remote.current = []; local.current = []; drawnCount.current = 0;
    seqBase.current = Date.now() * 10;
    redraw();
    const unsub = subscribeStrokes(roomId, turn, (list) => {
      const prev = remote.current;
      remote.current = list;
      if (canDraw) {
        // Quem desenha usa a própria cópia; só aproveita o que já estava
        // salvo se recarregou a página no meio da vez.
        if (!local.current.length && list.length) { local.current = [...list]; redraw(); }
        return;
      }
      const appendOnly = list.length >= prev.length && prev.every((s, i) => list[i] && list[i].id === s.id) && list.slice(prev.length).every((s) => s.k === 'l');
      const ctx = ctx2d();
      if (appendOnly && ctx) { for (const s of list.slice(prev.length)) drawSeg(ctx, s); drawnCount.current = list.length; }
      else redraw();
    });
    return () => unsub();
  }, [roomId, turn, canDraw]); // eslint-disable-line react-hooks/exhaustive-deps

  const nextSeq = () => ++seqBase.current;
  const send = (st: Omit<Stroke, 'id' | 'seq' | 'turn' | 'uid'>) => {
    const full = { ...st, seq: nextSeq(), turn, uid };
    local.current.push({ ...full, id: `${uid}_${turn}_${full.seq}` });
    writeStroke(roomId, full).catch(() => { /* a vez pode ter acabado */ });
  };

  const flush = (final = false) => {
    const d = drawing.current; if (!d) return;
    if (d.pts.length >= 4 || (final && d.pts.length >= 2)) {
      const pts = d.pts.length === 2 ? [d.pts[0], d.pts[1], d.pts[0], d.pts[1]] : d.pts;
      send({ k: 'l', s: d.sid, c: color, w: WIDTHS[width] * (color === ERASER ? 1.6 : 1), p: pts });
      d.pts = [d.last[0], d.last[1]];
    }
  };

  const pos = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * W), Math.round(((e.clientY - r.top) / r.height) * H)] as [number, number];
  };
  const down = (e: React.PointerEvent) => {
    if (!canDraw) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = pos(e);
    drawing.current = { sid: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, pts: [p[0], p[1]], last: p };
    const ctx = ctx2d();
    if (ctx) drawSeg(ctx, { id: '', turn, seq: 0, uid, k: 'l', s: '', c: color, w: WIDTHS[width] * (color === ERASER ? 1.6 : 1), p: [p[0], p[1]] });
    flushTimer.current = window.setInterval(() => flush(), 110);
  };
  const move = (e: React.PointerEvent) => {
    const d = drawing.current; if (!d || !canDraw) return;
    const p = pos(e);
    if (Math.hypot(p[0] - d.last[0], p[1] - d.last[1]) < 3) return;
    const ctx = ctx2d();
    if (ctx) drawSeg(ctx, { id: '', turn, seq: 0, uid, k: 'l', s: '', c: color, w: WIDTHS[width] * (color === ERASER ? 1.6 : 1), p: [d.last[0], d.last[1], p[0], p[1]] });
    d.pts.push(p[0], p[1]);
    d.last = p;
    if (d.pts.length > 400) flush();
  };
  const up = () => {
    if (!drawing.current) return;
    if (flushTimer.current) { clearInterval(flushTimer.current); flushTimer.current = null; }
    flush(true);
    drawing.current = null;
  };
  useEffect(() => () => { if (flushTimer.current) clearInterval(flushTimer.current); }, []);

  const undo = () => { send({ k: 'u', s: '', c: 0, w: 0, p: [] }); redraw(); gameAudio.fx('click'); };
  const clear = () => { send({ k: 'c', s: '', c: 0, w: 0, p: [] }); redraw(); gameAudio.fx('whoosh'); };

  return (
    <div className="space-y-2">
      <div ref={wrapRef} className="rounded-[22px] overflow-hidden" style={{ border: `3px solid ${GZ.ink}`, boxShadow: `0 6px 0 ${GZ.ink}`, background: '#fff' }}>
        <canvas ref={canvasRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up}
          style={{ display: 'block', touchAction: canDraw ? 'none' : 'auto', cursor: canDraw ? 'crosshair' : 'default' }}
          aria-label={canDraw ? 'Quadro de desenho: desenhe aqui' : 'Desenho do colega'} role="img" />
      </div>
      {canDraw && (
        <div className="gz-card p-2.5 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Cor">
            {COLORS.map((c, i) => i === ERASER ? null : (
              <button key={c} onClick={() => setColor(i)} role="radio" aria-checked={color === i} aria-label={`Cor ${i + 1}`}
                className="w-8 h-8 rounded-full gz-focus" style={{ background: c, border: `3px solid ${GZ.ink}`, boxShadow: color === i ? `0 0 0 3px ${GZ.orange}` : undefined }} />
            ))}
          </div>
          <div className="flex gap-1.5 ml-1" role="radiogroup" aria-label="Espessura">
            {WIDTHS.map((w, i) => (
              <button key={w} onClick={() => setWidth(i)} role="radio" aria-checked={width === i} aria-label={['Fino', 'Médio', 'Grosso'][i]}
                className="w-9 h-9 rounded-xl flex items-center justify-center gz-focus" style={{ background: width === i ? GZ.orange : GZ.grapeDeep, border: `2px solid ${GZ.ink}` }}>
                <span className="rounded-full" style={{ width: 4 + i * 6, height: 4 + i * 6, background: width === i ? GZ.ink : GZ.text }} />
              </button>
            ))}
          </div>
          <div className="flex gap-1.5 ml-auto">
            <button onClick={() => setColor(ERASER)} aria-pressed={color === ERASER} className="gz-btn gz-btn-sm" style={{ background: color === ERASER ? GZ.orange : GZ.panelHi, color: color === ERASER ? GZ.ink : GZ.text }} aria-label="Borracha"><Eraser className="w-4 h-4" /></button>
            <button onClick={undo} className="gz-btn gz-btn-ghost gz-btn-sm" aria-label="Desfazer"><Undo2 className="w-4 h-4" /></button>
            <button onClick={clear} className="gz-btn gz-btn-ghost gz-btn-sm" aria-label="Limpar tudo"><Trash2 className="w-4 h-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DrawPlay;
