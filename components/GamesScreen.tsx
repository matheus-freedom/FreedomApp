import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Coins, Loader2, LogIn, Play, Presentation, Shuffle, Swords, Trophy, User, Users, X, Zap } from 'lucide-react';
import { showToast } from './Toast';
import { UserSession } from '../types';
import { GameKind, GameRoom, GamesApiError, GamesMe, QuizCat, gamesApi } from '../services/gamesApi';
import { duelApi, duelsNeedingMe } from '../services/duelApi';
import { gameAudio } from '../services/gameAudio';
import { CAT_META, LEVEL_OPTIONS } from '../duelConfig';
import ChallengesScreen from './ChallengesScreen';
import LeagueSection from './challenges/LeagueSection';
import GameRoomScreen from './games/GameRoomScreen';
import { Pill } from './games/RoomLobby';
import { ANSWER_STYLES, GZ, GameStyles, LEVELS, SoundToggles } from './games/theme';
import { fr } from './challenges/ui';
import GameInviteBanner from './GameInviteBanner';

// ════════════════════════════════════════════════════════════════
// ABA GAMES (antiga "Desafios")
// ────────────────────────────────────────────────────────────────
//   • Quiz Party (estilo Kahoot): sozinho, partida rápida, sala com
//     código ou modo professor (telão).
//   • Draw It! (estilo Gartic): desenhar e adivinhar em inglês.
//   • Duelo da Roleta e Liga em Grupo: os modos que já existiam,
//     agora morando aqui dentro.
// O visual desta aba é próprio (ver games/theme.tsx) e tem trilha
// sonora e efeitos (services/gameAudio.ts), com botão de mudo.
// ════════════════════════════════════════════════════════════════

interface Props {
  user: UserSession;
  onHome: () => void;
  onUserUpdate: (user: UserSession) => void;
  onBadgeChange?: (n: number) => void;
  initialJoin?: string | null;
  onJoinConsumed?: () => void;
}

type View = { kind: 'hub' } | { kind: 'room'; id: string; seed?: GameRoom | null } | { kind: 'duel' } | { kind: 'league' };
type Hub = Awaited<ReturnType<typeof gamesApi.hub>>;
type CreateKind = { game: GameKind; mode: 'solo' | 'party' };

const GamesScreen: React.FC<Props> = ({ user, onHome, onUserUpdate, onBadgeChange, initialJoin, onJoinConsumed }) => {
  const uid = user.userId;
  const [view, setView] = useState<View>({ kind: 'hub' });
  const [hub, setHub] = useState<Hub | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [duelBadge, setDuelBadge] = useState(0);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [create, setCreate] = useState<CreateKind | null>(null);
  const [askLevel, setAskLevel] = useState<{ then?: () => void } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const h = await gamesApi.hub();
      setHub(h); setError(null);
      const g = user.gamification;
      if (g.xp !== h.me.xp || g.frBalance !== h.me.balance) onUserUpdate({ ...user, gamification: { ...g, xp: h.me.xp, frBalance: h.me.balance } });
    } catch (e) { setError(e instanceof Error ? e.message : 'Não deu para abrir os games.'); }
    finally { setLoading(false); }
    duelApi.hub().then((r) => { const n = duelsNeedingMe(r.duels, uid); setDuelBadge(n); onBadgeChange?.(n); }).catch(() => {});
  }, [uid, user, onUserUpdate, onBadgeChange]);

  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Ao sair da aba, a música para.
  useEffect(() => () => { gameAudio.play(null); }, []);
  useEffect(() => { if (view.kind === 'hub' || view.kind === 'duel' || view.kind === 'league') gameAudio.play('lobby'); }, [view.kind]);

  const openRoom = (r: GameRoom) => setView({ kind: 'room', id: r.id, seed: r });
  const backToHub = () => { setView({ kind: 'hub' }); refresh(); };

  const run = async (key: string, fn: () => Promise<{ room: GameRoom }>, needLevelRetry?: () => void) => {
    if (busy) return;
    setBusy(key);
    gameAudio.fx('click');
    try { const r = await fn(); openRoom(r.room); }
    catch (e) {
      if (e instanceof GamesApiError && e.code === 'NEED_LEVEL') { setAskLevel({ then: needLevelRetry }); return; }
      showToast(e instanceof Error ? e.message : 'Não deu certo. Tente de novo.', 'error');
    } finally { setBusy(null); }
  };

  const joinCode = (c = code) => {
    const clean = c.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (clean.length !== 5) { showToast('O código tem 5 letras/números.', 'info'); return; }
    run('join', () => gamesApi.join(clean));
  };
  const quick = (game: GameKind) => run(`quick-${game}`, async () => {
    const r = await gamesApi.quick(game);
    showToast(r.matched ? 'Achamos uma sala! Bora jogar 🎮' : 'Sala criada! Assim que mais alguém entrar, a partida começa.', 'success');
    return r;
  }, () => quick(game));

  // Convite aceito em outra tela do app: entra direto.
  useEffect(() => {
    if (!initialJoin) return;
    onJoinConsumed?.();
    run('join', () => gamesApi.join(initialJoin));
  }, [initialJoin]); // eslint-disable-line react-hooks/exhaustive-deps

  const needLevelThen = (fn: () => void) => { if (hub?.me.needLevel) setAskLevel({ then: fn }); else fn(); };

  // ── Sub-telas ─────────────────────────────────────────────────
  const shell = (children: React.ReactNode) => (
    <div className="gz gz-bg min-h-[calc(100vh-80px)] -mx-0">
      <GameStyles />
      <div className="max-w-6xl mx-auto p-4 md:p-6 pb-24">{children}</div>
    </div>
  );
  if (view.kind === 'room') return shell(<GameRoomScreen key={view.id} roomId={view.id} seed={view.seed} uid={uid} onExit={backToHub} onOpenRoom={openRoom} />);
  // Duelo e Liga mantêm o visual escuro original do app (foram
  // desenhados para ele: título branco, cartões #2a2a2a).
  if (view.kind === 'duel') return <div><ChallengesScreen user={user} onHome={backToHub} onUserUpdate={onUserUpdate} onBadgeChange={(n) => { setDuelBadge(n); onBadgeChange?.(n); }} /></div>;
  if (view.kind === 'league') return <div><LeagueSection user={user} onHome={backToHub} /></div>;

  const me: GamesMe | undefined = hub?.me;
  const title = 'Game Zone';

  return shell(
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex items-center gap-3">
          <button onClick={onHome} className="gz-btn gz-btn-ghost gz-btn-sm" aria-label="Voltar para o início"><ArrowLeft className="w-5 h-5" /></button>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight" aria-label={title}>
            {title.split('').map((ch, i) => (
              <span key={i} className="gz-hop" aria-hidden style={{ animationDelay: `${i * 45}ms`, color: GZ.orange, textShadow: `0 3px 0 ${GZ.ink}` }}>
                {ch === ' ' ? ' ' : ch}
              </span>
            ))}
          </h1>
        </div>
        <div className="md:ml-auto flex flex-wrap items-center gap-2">
          {me && (
            <>
              <button onClick={() => me.levelSource !== 'placement' && setAskLevel({})} className="gz-chip" style={{ background: GZ.cream, color: GZ.ink, cursor: me.levelSource === 'placement' ? 'default' : 'pointer' }}
                title={me.levelSource === 'placement' ? 'Nível do seu nivelamento' : 'Toque para mudar seu nível'}>
                Nível {me.level || '?'}
              </button>
              <span className="gz-chip gz-num" style={{ background: GZ.lime, color: GZ.ink }}>{me.xp.toLocaleString('pt-BR')} XP</span>
              <span className="gz-chip gz-num flex items-center gap-1" style={{ background: '#ffc93c', color: GZ.ink }}><Coins className="w-3.5 h-3.5" /> {fr(me.balance)}</span>
            </>
          )}
          <SoundToggles compact />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-24"><Loader2 className="w-10 h-10 animate-spin" style={{ color: GZ.orange }} /></div>
      ) : error ? (
        <div className="gz-card p-8 text-center">
          <p className="text-xl font-semibold">Não conseguimos abrir os games.</p>
          <p className="mt-1" style={{ color: GZ.muted }}>{error}</p>
          <button onClick={() => { setLoading(true); refresh(); }} className="gz-btn gz-btn-orange mt-5">Tentar de novo</button>
        </div>
      ) : (
        <>
          {hub?.current && (
            <button onClick={() => run('rejoin', () => gamesApi.rejoin(hub.current!.id))} className="gz-card w-full p-4 flex items-center gap-3 text-left gz-focus" style={{ background: GZ.orange, color: GZ.ink }}>
              <Play className="w-6 h-6" />
              <span className="flex-1 font-semibold text-lg">Você está numa partida de {hub.current.game === 'quiz' ? 'Quiz Party' : 'Draw It!'}{hub.current.code ? ` (sala ${hub.current.code})` : ''}</span>
              <span className="font-semibold">Voltar</span>
            </button>
          )}

          {/* Entrar com código */}
          <form onSubmit={(e) => { e.preventDefault(); joinCode(); }} className="gz-card p-4 md:p-5 flex flex-col sm:flex-row sm:items-center gap-3">
            <label htmlFor="gz-code" className="text-lg font-semibold sm:w-56">Tem um código de sala?</label>
            <input id="gz-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5))}
              placeholder="ABC12" inputMode="text" autoComplete="off" autoCapitalize="characters"
              className="gz-input flex-1 text-2xl tracking-[0.35em] text-center gz-num uppercase" aria-label="Código da sala" />
            <button type="submit" disabled={code.length !== 5 || !!busy} className="gz-btn gz-btn-orange text-lg">
              {busy === 'join' ? <Loader2 className="w-5 h-5 animate-spin" /> : <><LogIn className="w-5 h-5" /> Entrar</>}
            </button>
          </form>

          {/* Os 4 modos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <GameCard color={GZ.orange} art={<QuizArt />} title="Quiz Party" open={hub?.open.quiz || 0}
              desc="Todo mundo responde a mesma pergunta ao mesmo tempo. Quem acerta mais rápido ganha mais pontos.">
              <button onClick={() => needLevelThen(() => setCreate({ game: 'quiz', mode: 'solo' }))} className="gz-btn gz-btn-orange"><User className="w-4 h-4" /> Jogar sozinho</button>
              <button onClick={() => needLevelThen(() => quick('quiz'))} disabled={!!busy} className="gz-btn gz-btn-ghost">
                {busy === 'quick-quiz' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shuffle className="w-4 h-4" />} Partida rápida
              </button>
              <button onClick={() => needLevelThen(() => setCreate({ game: 'quiz', mode: 'party' }))} className="gz-btn gz-btn-ghost"><Users className="w-4 h-4" /> Criar sala</button>
            </GameCard>
            <GameCard color={GZ.cyan} art={<DrawArt />} title="Draw It!" open={hub?.open.draw || 0}
              desc="Um desenha, os outros adivinham a palavra em inglês. Quanto antes você acertar, mais pontos.">
              <button onClick={() => needLevelThen(() => quick('draw'))} disabled={!!busy} className="gz-btn gz-btn-cyan">
                {busy === 'quick-draw' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shuffle className="w-4 h-4" />} Partida rápida
              </button>
              <button onClick={() => needLevelThen(() => setCreate({ game: 'draw', mode: 'party' }))} className="gz-btn gz-btn-ghost"><Users className="w-4 h-4" /> Criar sala</button>
            </GameCard>
            <GameCard color={GZ.pink} art={<DuelArt />} title="Duelo da Roleta" badge={duelBadge > 0 ? `${duelBadge} duelo${duelBadge > 1 ? 's' : ''} na sua vez` : null}
              desc="Gire a roleta, acerte as perguntas e junte as 6 coroas antes do adversário. Cada um joga na sua hora.">
              <button onClick={() => setView({ kind: 'duel' })} className="gz-btn gz-btn-pink"><Swords className="w-4 h-4" /> Abrir duelos</button>
            </GameCard>
            <GameCard color={GZ.lime} art={<LeagueArt />} title="Liga em Grupo"
              desc="Uma corrida de XP com os amigos por alguns dias. Cada exercício feito no app conta pontos no ranking.">
              <button onClick={() => setView({ kind: 'league' })} className="gz-btn gz-btn-lime"><Trophy className="w-4 h-4" /> Abrir ligas</button>
            </GameCard>
          </div>

          {me && <TodayStrip me={me} />}
        </>
      )}

      <GameInviteBanner uid={uid} onJoin={(c) => run('join', () => gamesApi.join(c))} />
      {create && me && (
        <CreateModal kind={create} me={me} onClose={() => setCreate(null)}
          onCreate={(opts) => { setCreate(null); run('create', () => gamesApi.create(opts)); }} />
      )}
      {askLevel !== null && (
        <LevelModal current={me?.level || null} onClose={() => setAskLevel(null)}
          onSaved={async () => { const after = askLevel.then; setAskLevel(null); await refresh(); showToast('Nível salvo!', 'success'); after?.(); }} />
      )}
    </div>
  );
};

// ── Cartões ──────────────────────────────────────────────────────
const GameCard: React.FC<{ color: string; art: React.ReactNode; title: string; desc: string; open?: number; badge?: string | null; children: React.ReactNode }> = ({ color, art, title, desc, open = 0, badge, children }) => (
  <section className="gz-card overflow-hidden" aria-label={title}>
    <div className="relative h-36 md:h-44 flex items-center justify-center overflow-hidden" style={{ background: color, borderBottom: `3px solid ${GZ.ink}` }}>
      {art}
      {open > 0 && (
        <span className="absolute top-3 right-3 gz-chip flex items-center gap-1" style={{ background: GZ.ink, color: '#ffffff' }}>
          <Zap className="w-3.5 h-3.5" style={{ color: GZ.lime }} /> {open} sala{open > 1 ? 's' : ''} abrindo agora
        </span>
      )}
      {badge && (
        <span className="absolute top-3 right-3 gz-chip" style={{ background: GZ.orange, color: GZ.ink }}>{badge}</span>
      )}
    </div>
    <div className="p-5">
      <h2 className="text-3xl font-bold">{title}</h2>
      <p className="gz-read mt-1.5 text-[15px] leading-relaxed" style={{ color: GZ.muted, maxWidth: '46ch' }}>{desc}</p>
      <div className="flex flex-wrap gap-2.5 mt-4">{children}</div>
    </div>
  </section>
);

// Ilustrações: as 4 peças do quiz, um rabisco a lápis, a roleta do
// duelo (as 6 categorias com seus ícones, coroa no meio) e um placar
// de liga.
const QuizArt: React.FC = () => (
  <div className="grid grid-cols-2 gap-2.5 -rotate-6" aria-hidden>
    {ANSWER_STYLES.map((s, i) => (
      <span key={i} className="w-16 h-12 md:w-20 md:h-14 rounded-2xl flex items-center justify-center text-2xl"
        style={{ background: s.color, color: GZ.ink, border: `3px solid ${GZ.ink}`, boxShadow: `0 4px 0 ${GZ.ink}`, transform: `rotate(${[4, -3, -5, 3][i]}deg)` }}>{s.shape}</span>
    ))}
  </div>
);
const DrawArt: React.FC = () => (
  <svg viewBox="0 0 260 120" className="w-64 md:w-72" aria-hidden>
    <rect x="18" y="10" width="224" height="100" rx="14" fill="#fff" stroke={GZ.ink} strokeWidth="4" />
    <path d="M45 82 C 60 30, 85 30, 95 62 S 130 95, 150 50 S 195 25, 215 70" fill="none" stroke={GZ.pink} strokeWidth="8" strokeLinecap="round" />
    <circle cx="70" cy="44" r="9" fill="#ffc93c" stroke={GZ.ink} strokeWidth="3" />
    <g transform="translate(196 66) rotate(40)">
      <rect x="-7" y="-46" width="14" height="46" rx="3" fill={GZ.orange} stroke={GZ.ink} strokeWidth="3" />
      <path d="M-7 0 L0 14 L7 0 Z" fill={GZ.cream} stroke={GZ.ink} strokeWidth="3" strokeLinejoin="round" />
    </g>
  </svg>
);

const DuelArt: React.FC = () => {
  const cats = ['grammar', 'vocabulary', 'reading', 'listening', 'travel', 'everyday'] as const;
  const cx = 130, cy = 64, r = 54;
  const pt = (deg: number, rad: number) => [cx + rad * Math.cos((deg - 90) * Math.PI / 180), cy + rad * Math.sin((deg - 90) * Math.PI / 180)];
  return (
    <svg viewBox="0 0 260 128" className="w-64 md:w-72" aria-hidden>
      <g style={{ transformOrigin: `${cx}px ${cy}px`, transform: 'rotate(-12deg)' }}>
        <circle cx={cx} cy={cy} r={r + 6} fill={GZ.ink} />
        {cats.map((c, i) => {
          const [x1, y1] = pt(i * 60, r), [x2, y2] = pt((i + 1) * 60, r);
          const [tx, ty] = pt(i * 60 + 30, r * 0.64);
          return (
            <g key={c}>
              <path d={`M${cx} ${cy} L${x1} ${y1} A${r} ${r} 0 0 1 ${x2} ${y2} Z`} fill={CAT_META[c].color} stroke={GZ.ink} strokeWidth="2.5" />
              <text x={tx} y={ty} textAnchor="middle" dominantBaseline="central" fontSize="17">{CAT_META[c].emoji}</text>
            </g>
          );
        })}
      </g>
      <circle cx={cx} cy={cy} r="15" fill="#fff" stroke={GZ.ink} strokeWidth="3" />
      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="central" fontSize="15">👑</text>
      <path d={`M${cx - 10} 2 L${cx + 10} 2 L${cx} 20 Z`} fill={GZ.orange} stroke={GZ.ink} strokeWidth="3" strokeLinejoin="round" />
    </svg>
  );
};
const LeagueArt: React.FC = () => {
  const rows = [
    { medal: '#ffc93c', bar: 96, pts: '1.240' },
    { medal: '#c7cbd6', bar: 74, pts: '980' },
    { medal: '#f59e7b', bar: 52, pts: '715' },
  ];
  return (
    <svg viewBox="0 0 260 128" className="w-64 md:w-72" aria-hidden>
      <g transform="rotate(-3 130 64)">
        <rect x="22" y="8" width="216" height="112" rx="14" fill="#fff" stroke={GZ.ink} strokeWidth="4" />
        <rect x="22" y="8" width="216" height="24" rx="14" fill={GZ.ink} />
        <rect x="22" y="22" width="216" height="10" fill={GZ.ink} />
        <text x="40" y="21" dominantBaseline="central" fontSize="11" fontWeight="700" fill="#fff" fontFamily="Fredoka, system-ui">Ranking</text>
        <text x="220" y="21" dominantBaseline="central" textAnchor="end" fontSize="11" fontWeight="700" fill={GZ.lime} fontFamily="Fredoka, system-ui">XP</text>
        {rows.map((r, i) => {
          const y = 48 + i * 25;
          return (
            <g key={i}>
              <circle cx="44" cy={y} r="9" fill={r.medal} stroke={GZ.ink} strokeWidth="2.5" />
              <text x="44" y={y + 0.5} textAnchor="middle" dominantBaseline="central" fontSize="10" fontWeight="700" fill={GZ.ink} fontFamily="Fredoka, system-ui">{i + 1}</text>
              <circle cx="68" cy={y} r="8" fill={[GZ.orange, GZ.cyan, GZ.pink][i]} stroke={GZ.ink} strokeWidth="2" />
              <rect x="82" y={y - 5} width={r.bar} height="10" rx="5" fill={i === 0 ? GZ.orange : '#e3e3df'} stroke={GZ.ink} strokeWidth="1.5" />
              <text x="220" y={y + 0.5} textAnchor="end" dominantBaseline="central" fontSize="11" fontWeight="700" fill={GZ.ink} fontFamily="Fredoka, system-ui">{r.pts}</text>
            </g>
          );
        })}
      </g>
    </svg>
  );
};

const TodayStrip: React.FC<{ me: GamesMe }> = ({ me }) => (
  <div className="gz-card p-5 grid grid-cols-1 md:grid-cols-3 gap-5">
    <div className="md:col-span-1">
      <p className="font-semibold mb-2">Prêmios dos games hoje</p>
      <Meter label="XP" value={me.daily.xp} max={me.dailyCap.xp} color={GZ.lime} fmt={(v) => `${v}`} />
      <Meter label="FR$" value={me.daily.fr} max={me.dailyCap.fr} color="#ffc93c" fmt={(v) => v.toFixed(2).replace('.', ',')} />
      <p className="gz-read text-xs mt-1" style={{ color: GZ.muted }}>Não gasta sua cota de exercícios.</p>
    </div>
    <Stat title="Quiz Party" s={me.quiz} />
    <Stat title="Draw It!" s={me.draw} />
  </div>
);
const Meter: React.FC<{ label: string; value: number; max: number; color: string; fmt: (v: number) => string }> = ({ label, value, max, color, fmt }) => (
  <div className="flex items-center gap-2 mb-2">
    <span className="text-sm w-9">{label}</span>
    <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: GZ.grapeDeep, border: `2px solid ${GZ.ink}` }}>
      <div className="h-full" style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: color }} />
    </div>
    <span className="text-xs gz-num" style={{ color: GZ.muted }}>{fmt(value)}/{fmt(max)}</span>
  </div>
);
const Stat: React.FC<{ title: string; s: GamesMe['quiz'] }> = ({ title, s }) => (
  <div>
    <p className="font-semibold mb-2">{title}</p>
    {s && s.played ? (
      <div className="grid grid-cols-3 gap-2">
        {[['Partidas', s.played], ['Vitórias', s.wins], ['Recorde', s.best]].map(([l, v]) => (
          <div key={l as string} className="gz-inset p-2 text-center">
            <p className="text-xl font-bold gz-num">{(v as number).toLocaleString('pt-BR')}</p>
            <p className="text-xs" style={{ color: GZ.muted }}>{l}</p>
          </div>
        ))}
      </div>
    ) : <p className="gz-read text-sm" style={{ color: GZ.muted }}>Você ainda não jogou. Que tal a primeira?</p>}
  </div>
);

// ── Criar partida ────────────────────────────────────────────────
const QUIZ_CATS: QuizCat[] = ['grammar', 'vocabulary', 'reading', 'listening', 'travel', 'everyday'];
const CreateModal: React.FC<{ kind: CreateKind; me: GamesMe; onClose: () => void; onCreate: (o: Parameters<typeof gamesApi.create>[0]) => void }> = ({ kind, me, onClose, onCreate }) => {
  const [level, setLevel] = useState(me.level || 'A1');
  const [count, setCount] = useState(10);
  const [cats, setCats] = useState<QuizCat[]>([...QUIZ_CATS]);
  const [hostPlays, setHostPlays] = useState(true);
  const [rounds, setRounds] = useState(2);
  const [drawMs, setDrawMs] = useState(80000);
  const quiz = kind.game === 'quiz';
  const solo = kind.mode === 'solo';
  const toggleCat = (c: QuizCat) => setCats((l) => (l.includes(c) ? (l.length > 1 ? l.filter((x) => x !== c) : l) : [...l, c]));
  const submit = () => onCreate(quiz
    ? { game: 'quiz', mode: kind.mode, level, hostPlays: solo ? true : hostPlays, settings: { count, cats } }
    : { game: 'draw', mode: 'party', level, settings: { rounds, drawMs } });
  return (
    <div className="fixed inset-0 z-[650] flex items-end sm:items-center justify-center sm:p-4" style={{ background: 'rgba(34,34,34,.55)' }} onClick={onClose}>
      <div className="gz gz-card w-full max-w-lg p-5 md:p-6 gz-pop max-h-[92vh] overflow-y-auto gz-scroll" onClick={(e) => e.stopPropagation()} role="dialog"
        aria-label={solo ? 'Jogar sozinho' : 'Criar sala'}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-2xl font-bold">{solo ? 'Quiz sozinho' : quiz ? 'Nova sala de Quiz Party' : 'Nova sala de Draw It!'}</h3>
          <button onClick={onClose} className="p-2 gz-focus rounded-lg" aria-label="Fechar"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-5">
          {quiz && !solo && (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setHostPlays(true)} aria-pressed={hostPlays} className="gz-btn flex-col py-3.5" style={{ background: hostPlays ? GZ.orange : GZ.grapeDeep, color: hostPlays ? GZ.ink : GZ.text }}>
                <Users className="w-6 h-6" /> Eu jogo também
              </button>
              <button onClick={() => setHostPlays(false)} aria-pressed={!hostPlays} className="gz-btn flex-col py-3.5" style={{ background: !hostPlays ? GZ.orange : GZ.grapeDeep, color: !hostPlays ? GZ.ink : GZ.text }}>
                <Presentation className="w-6 h-6" /> Só apresento
              </button>
              <p className="col-span-2 gz-read text-sm" style={{ color: GZ.muted }}>
                {hostPlays ? 'Você joga junto com os colegas.' : 'Modo professor: sua tela vira o telão (compartilhe na aula) e os alunos respondem no celular.'}
              </p>
            </div>
          )}
          <div>
            <p className="text-sm mb-2" style={{ color: GZ.muted }}>Nível {quiz ? 'das perguntas' : 'das palavras'}</p>
            <div className="flex flex-wrap gap-2">{LEVELS.map((l) => <Pill key={l} on={level === l} onClick={() => setLevel(l)}>{l}</Pill>)}</div>
          </div>
          {quiz ? (
            <>
              <div>
                <p className="text-sm mb-2" style={{ color: GZ.muted }}>Quantas perguntas</p>
                <div className="flex gap-2">{[5, 10, 15].map((n) => <Pill key={n} on={count === n} onClick={() => setCount(n)}>{n}</Pill>)}</div>
              </div>
              <div>
                <p className="text-sm mb-2" style={{ color: GZ.muted }}>Categorias</p>
                <div className="flex flex-wrap gap-2">{QUIZ_CATS.map((c) => <Pill key={c} on={cats.includes(c)} onClick={() => toggleCat(c)}>{CAT_META[c].emoji} {CAT_META[c].label}</Pill>)}</div>
              </div>
            </>
          ) : (
            <>
              <div>
                <p className="text-sm mb-2" style={{ color: GZ.muted }}>Rodadas (cada um desenha uma vez por rodada)</p>
                <div className="flex gap-2">{[1, 2, 3].map((n) => <Pill key={n} on={rounds === n} onClick={() => setRounds(n)}>{n}</Pill>)}</div>
              </div>
              <div>
                <p className="text-sm mb-2" style={{ color: GZ.muted }}>Tempo para desenhar</p>
                <div className="flex gap-2">{[60000, 80000, 100000].map((n) => <Pill key={n} on={drawMs === n} onClick={() => setDrawMs(n)}>{n / 1000}s</Pill>)}</div>
              </div>
            </>
          )}
        </div>
        <button onClick={submit} className="gz-btn gz-btn-orange w-full mt-6 text-lg py-3.5"><Play className="w-5 h-5" /> {solo ? 'Começar' : 'Criar sala'}</button>
      </div>
    </div>
  );
};

// "Qual seu nível?" — o mesmo do Duelo (fica salvo para os dois).
const LevelModal: React.FC<{ current: string | null; onClose: () => void; onSaved: () => void }> = ({ current, onClose, onSaved }) => {
  const [sel, setSel] = useState<string | null>(current);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!sel || saving) return;
    setSaving(true);
    try { await duelApi.setLevel(sel); onSaved(); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Não deu para salvar.', 'error'); }
    finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-[660] flex items-center justify-center p-4" style={{ background: 'rgba(34,34,34,.55)' }} onClick={onClose}>
      <div className="gz gz-card w-full max-w-md p-6 gz-pop max-h-[92vh] overflow-y-auto gz-scroll" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Qual seu nível?">
        <h3 className="text-2xl font-bold">Qual seu nível?</h3>
        <p className="gz-read text-sm mt-1 mb-4" style={{ color: GZ.muted }}>Assim as perguntas e palavras ficam na medida certa. Quando você fizer o nivelamento, ele passa a valer no lugar desta escolha.</p>
        <div className="space-y-2">
          {LEVEL_OPTIONS.map((o) => (
            <button key={o.level} onClick={() => setSel(o.level)} aria-pressed={sel === o.level}
              className="w-full flex items-center gap-3 p-3 text-left gz-inset gz-focus" style={{ outline: sel === o.level ? `3px solid ${GZ.orange}` : undefined }}>
              <span className="w-11 h-11 rounded-xl flex items-center justify-center font-bold" style={{ background: sel === o.level ? GZ.orange : GZ.panelHi, color: sel === o.level ? GZ.ink : GZ.text, border: `2px solid ${GZ.ink}` }}>{o.level}</span>
              <span><span className="block font-semibold">{o.title}</span><span className="gz-read block text-xs" style={{ color: GZ.muted }}>{o.desc}</span></span>
            </button>
          ))}
        </div>
        <button onClick={save} disabled={!sel || saving} className="gz-btn gz-btn-orange w-full mt-5 text-lg">{saving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Salvar nível'}</button>
      </div>
    </div>
  );
};

export default GamesScreen;
