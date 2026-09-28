// ============================================================
// FREEDOMAPP — services/duelApi
// ------------------------------------------------------------
// Conversa do app com a function "duel" (Duelo da Roleta).
// Toda jogada vai para o servidor; a tela só mostra o resultado.
// Ver netlify/functions/duel.js para as regras.
// ============================================================

import { auth } from './firebase';
import { DuelCategory, WheelSlot } from '../duelConfig';

const DUEL_URL = import.meta.env.DEV
  ? 'http://localhost:8888/.netlify/functions/duel'
  : '/.netlify/functions/duel';

export interface DuelPlayerInfo { username: string; name: string; photo: string | null; level: string | null }
export interface DuelQuestion {
  n: number; kind: 'normal' | 'crown'; cat: DuelCategory; level: string;
  q: string; options: string[]; passage: string | null; audio: string | null; id: string;
  askedAt: number; limitMs: number; deadline: number; removed: number[];
}
export interface DuelResult {
  uid: string; n: number; ok: boolean; choice: number; correctIndex: number | null;
  explain: string | null; cat: DuelCategory; kind: 'normal' | 'crown'; qid: string | null; at: number;
}
export interface DuelReward { result: 'win' | 'loss' | 'draw'; xp: number; fr: number; pot: number; trophies: number; capped: boolean; trophiesTotal: number }
export interface Duel {
  id: string; mode: 'roleta';
  status: 'invited' | 'active' | 'finished' | 'declined' | 'expired' | 'cancelled';
  players: [string, string]; info: Record<string, DuelPlayerInfo>; stake: number;
  createdAt: number; updatedAt: number; expiresAt: number; acceptedAt?: number;
  turn: string | null; phase: 'spin' | 'question' | 'crown_pick' | null; turnDeadline: number | null;
  streakInTurn: number; crownSource?: 'meter' | 'wheel' | null;
  turns: Record<string, number>; crowns: Record<string, DuelCategory[]>; meter: Record<string, number>;
  correct: Record<string, number>; answered: Record<string, number>;
  catStats: Record<string, Partial<Record<DuelCategory, { c: number; t: number }>>>;
  helps: Record<string, { fifty: number; skip: number }>;
  question: DuelQuestion | null; lastResult: DuelResult | null;
  log: { uid: string; cat: DuelCategory; kind: 'normal' | 'crown'; ok: boolean; at: number }[];
  lastSpin?: { uid: string; slot: number; at: number };
  winner: string | null; endReason: 'crowns' | 'turns' | 'forfeit' | 'timeout' | null; finishedAt: number | null;
  rewards: Record<string, DuelReward> | null;
}
export interface DuelMe {
  uid: string; level: string | null; levelSource: 'placement' | 'choice' | null; needLevel: boolean;
  trophies: number; league: { id: string; name: string; min: number }; nextLeague: { id: string; name: string; min: number } | null;
  wins: number; losses: number; draws: number; played: number; streak: number; bestStreak: number; crownsTotal: number;
  catStats: Partial<Record<DuelCategory, { c: number; t: number }>>;
  daily: { day: string; xp: number; fr: number }; dailyCap: { xp: number; fr: number }; balance: number; xp: number;
}
export interface DuelSearchPlayer { uid: string; username: string; name: string; photo: string | null; level: string | null }

export class DuelApiError extends Error {
  code?: string; duelId?: string; status: number;
  constructor(msg: string, status: number, code?: string, duelId?: string) { super(msg); this.status = status; this.code = code; this.duelId = duelId; }
}

// Diferença entre o relógio do servidor e o do aparelho (ms). Celular
// com hora errada não pode fazer a pergunta "vencer" antes da hora.
let serverOffset = 0;
export const serverNow = () => Date.now() + serverOffset;

const call = async <T>(payload: Record<string, unknown>): Promise<T> => {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new DuelApiError('Sua sessão expirou. Faça login novamente.', 401);
  let res: Response;
  try {
    res = await fetch(DUEL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new DuelApiError('Sem conexão. Confira sua internet e tente de novo.', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new DuelApiError(data.error || `Erro ${res.status}`, res.status, data.code, data.duelId);
  if (typeof data.serverNow === 'number') serverOffset = data.serverNow - Date.now();
  return data as T;
};

export const duelApi = {
  hub: () => call<{ me: DuelMe; duels: Duel[] }>({ action: 'hub' }),
  get: (duelId: string) => call<{ duel: Duel }>({ action: 'get', duelId }),
  setLevel: (level: string) => call<{ me: DuelMe }>({ action: 'setLevel', level }),
  search: (q: string) => call<{ players: DuelSearchPlayer[] }>({ action: 'search', q }),
  create: (opts: { opponentId?: string; random?: boolean; stake: number }) => call<{ duel: Duel }>({ action: 'create', ...opts }),
  respond: (duelId: string, accept: boolean) => call<{ duel: Duel }>({ action: 'respond', duelId, accept }),
  cancel: (duelId: string) => call<{ duel: Duel }>({ action: 'cancel', duelId }),
  spin: (duelId: string) => call<{ slot: number; target: WheelSlot; duel: Duel }>({ action: 'spin', duelId }),
  pickCrown: (duelId: string, cat: DuelCategory) => call<{ duel: Duel }>({ action: 'pickCrown', duelId, cat }),
  answer: (duelId: string, n: number, choice: number) =>
    call<{ result: DuelResult; event: string; timedOut?: boolean; duel: Duel }>({ action: 'answer', duelId, n, choice }),
  help: (duelId: string, kind: 'fifty' | 'skip') => call<{ duel: Duel }>({ action: 'help', duelId, kind }),
  forfeit: (duelId: string) => call<{ duel: Duel }>({ action: 'forfeit', duelId }),
  report: (duelId: string, qid: string, reason: string) => call<{ ok: boolean }>({ action: 'report', duelId, qid, reason }),
};

// Quantos duelos pedem uma ação minha (convite recebido ou minha vez).
export const duelsNeedingMe = (duels: Duel[], uid: string) =>
  duels.filter(d => (d.status === 'invited' && d.players[1] === uid) || (d.status === 'active' && d.turn === uid)).length;
