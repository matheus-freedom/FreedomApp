// ============================================================
// Cliente da function "games" (Quiz Party e Draw It!).
// ------------------------------------------------------------
// Toda AÇÃO (criar sala, responder, adivinhar...) passa por aqui e
// vai para o servidor, que é o juiz. Para VER a sala mudando em tempo
// real o app usa services/gamesRealtime.ts (escuta o Firestore).
// ============================================================
import { auth } from './firebase';

const GAMES_URL = import.meta.env.DEV
  ? 'http://localhost:8888/.netlify/functions/games'
  : '/.netlify/functions/games';

export type GameKind = 'quiz' | 'draw';
export type QuizCat = 'grammar' | 'vocabulary' | 'reading' | 'listening' | 'travel' | 'everyday';

export interface RoomPlayer {
  username: string; name: string; photo: string | null; level: string | null;
  score: number; correct: number; acts: number; joinedAt: number; left: boolean;
}
export interface FeedItem { t: number; k: 'join' | 'leave' | 'guess' | 'react'; uid: string; name: string; x?: number }
export interface Standing { uid: string; place: number; score: number; correct: number }
export interface RoomReward { place: number | null; xp: number; fr: number; capped?: boolean }

export interface QuizQ {
  n: number; total: number; cat: QuizCat; q: string; passage: string | null; audio: string | null;
  options: string[]; id: string; startsAt: number; endsAt: number; ms: number;
}
export interface QuizReveal {
  n: number; answer: number; explain: string; dist: number[];
  results: Record<string, { ok: boolean; pts: number; choice: number | null; streak: number }>;
}

export interface GameRoom {
  id: string; code: string | null; game: GameKind; mode: 'solo' | 'party';
  hostId: string; hostInfo: { username: string; name: string; photo: string | null; level: string | null };
  hostPlays: boolean; level: string; public: boolean;
  status: 'lobby' | 'playing' | 'finished' | 'closed';
  phase: 'lobby' | 'question' | 'reveal' | 'choose' | 'draw' | 'turnEnd' | 'podium' | 'closed';
  nextAt: number | null; autoStart?: boolean;
  players: Record<string, RoomPlayer>; order: string[];
  settings: { count?: number; cats?: QuizCat[]; rounds?: number; drawMs?: number };
  feed: FeedItem[]; createdAt: number; updatedAt: number; startedAt: number | null; finishedAt: number | null;
  standings: Standing[] | null; rewards: Record<string, RoomReward> | null; paid?: boolean;
  kicked?: string[]; next?: { id: string; code: string | null; by: string } | null; endReason?: string;
  // quiz
  total?: number; q?: QuizQ | null; answered?: Record<string, boolean>; reveal?: QuizReveal | null;
  // draw
  drawOrder?: string[]; round?: number; turn?: number; turnIdx?: number; drawer?: string;
  mask?: (string | null)[] | null; wordInfo?: { c: string; len: number } | null;
  guessed?: Record<string, { order: number; pts: number }>; reports?: Record<string, boolean>;
  drawStartsAt?: number | null; drawEndsAt?: number | null; hintsGiven?: number;
  turnResult?: { word: string | null; pt: string | null; reason: string; guessed: Record<string, { order: number; pts: number }>; drawer: string } | null;
}

export interface GamesMe {
  uid: string; level: string | null; levelSource: 'placement' | 'choice' | null; needLevel: boolean;
  quiz: { played: number; wins: number; podiums: number; best: number; correct: number } | null;
  draw: { played: number; wins: number; podiums: number; best: number; correct: number } | null;
  daily: { day: string; xp: number; fr: number }; dailyCap: { xp: number; fr: number }; balance: number; xp: number;
}
export interface DrawWord { w: string; pt: string; c: string }

export class GamesApiError extends Error {
  code?: string; status: number;
  constructor(msg: string, status: number, code?: string) { super(msg); this.status = status; this.code = code; }
}

// Diferença entre o relógio do servidor e o do aparelho. Os prazos da
// sala vêm no relógio do servidor; sem isso, um celular com a hora
// errada veria o cronômetro adiantado ou atrasado.
let serverOffset = 0;
export const serverNow = () => Date.now() + serverOffset;
export const toLocal = (serverMs: number) => serverMs - serverOffset;

const call = async <T>(payload: Record<string, unknown>): Promise<T> => {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new GamesApiError('Sua sessão expirou. Faça login novamente.', 401);
  let res: Response;
  const sentAt = Date.now();
  try {
    res = await fetch(GAMES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new GamesApiError('Sem conexão. Confira sua internet e tente de novo.', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (typeof data.serverNow === 'number') {
    // Metade do tempo de ida e volta: estimativa de quando o servidor respondeu.
    const rtt = Date.now() - sentAt;
    serverOffset = data.serverNow - (Date.now() - rtt / 2);
  }
  if (!res.ok) throw new GamesApiError(data.error || `Erro ${res.status}`, res.status, data.code);
  return data as T;
};

type R = { room: GameRoom };
export const gamesApi = {
  hub: () => call<{ me: GamesMe; current: { id: string; code: string | null; game: GameKind; mode: string; status: string; players: number } | null; open: { quiz: number; draw: number } }>({ action: 'hub' }),
  create: (opts: { game: GameKind; mode: 'solo' | 'party'; hostPlays?: boolean; level?: string; public?: boolean; settings?: GameRoom['settings'] }) =>
    call<R>({ action: 'create', ...opts }),
  join: (code: string) => call<R>({ action: 'join', code }),
  rejoin: (roomId: string) => call<R>({ action: 'join', roomId }),
  quick: (game: GameKind) => call<R & { matched: boolean }>({ action: 'quick', game }),
  leave: (roomId: string) => call<R>({ action: 'leave', roomId }),
  settings: (roomId: string, s: { settings?: GameRoom['settings']; level?: string }) => call<R>({ action: 'settings', roomId, ...s }),
  kick: (roomId: string, uid: string) => call<R>({ action: 'kick', roomId, uid }),
  start: (roomId: string) => call<R>({ action: 'start', roomId }),
  tick: (roomId: string) => call<R>({ action: 'tick', roomId }),
  answer: (roomId: string, n: number, choice: number) => call<{ ok: boolean; room?: GameRoom }>({ action: 'answer', roomId, n, choice }),
  peek: (roomId: string) => call<{ turn: number; phase: string; choices: DrawWord[] | null; word: DrawWord | null }>({ action: 'peek', roomId }),
  pick: (roomId: string, turn: number, idx: number) => call<R & { word: DrawWord }>({ action: 'pick', roomId, turn, idx }),
  guess: (roomId: string, text: string) => call<R & { result: { ok?: boolean; close?: boolean; pts?: number; already?: boolean; slow?: boolean } }>({ action: 'guess', roomId, text }),
  react: (roomId: string, r: number) => call<R>({ action: 'react', roomId, r }),
  report: (roomId: string) => call<R & { result: { removed: boolean; count: number } }>({ action: 'report', roomId }),
  invite: (roomId: string, to: string) => call<{ ok: boolean }>({ action: 'invite', roomId, to }),
  again: (roomId: string) => call<R>({ action: 'again', roomId }),
};

export const REACTIONS = ['👏', '😂', '🔥', '😮', '❤️', '🤔'];
