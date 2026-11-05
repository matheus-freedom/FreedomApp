// "Tempo real" FALSO para o preview: em vez do onSnapshot do
// Firestore, pergunta ao preview/games-server.cjs a cada 250 ms.
// Mesma interface de services/gamesRealtime.ts.
import type { GameRoom } from '../services/gamesApi';
import type { Stroke, GameInvite } from '../services/gamesRealtime';
export type { Stroke, GameInvite } from '../services/gamesRealtime';

const BASE = 'http://localhost:8888';
const poll = <T,>(url: string, pick: (j: any) => T, cb: (v: T) => void, ms = 250) => {
  let last = '';
  let alive = true;
  const run = async () => {
    try {
      const j = await (await fetch(url)).json();
      const s = JSON.stringify(j);
      if (s !== last) { last = s; cb(pick(j)); }
    } catch { /* servidor caiu */ }
    if (alive) setTimeout(run, ms);
  };
  run();
  return () => { alive = false; };
};

export const subscribeRoom = (roomId: string, cb: (room: GameRoom | null) => void) =>
  poll(`${BASE}/__doc?path=${encodeURIComponent(`game_rooms/${roomId}`)}`, (j) => j.data as GameRoom | null, cb);

export const subscribeStrokes = (roomId: string, turn: number, cb: (s: Stroke[]) => void) =>
  poll(`${BASE}/__query?col=${encodeURIComponent(`game_rooms/${roomId}/strokes`)}&f=turn&v=${turn}&num=1`, (j) => (j.docs as Stroke[]).sort((a, b) => a.seq - b.seq), cb, 150);

export const writeStroke = async (roomId: string, st: Omit<Stroke, 'id'>) => {
  await fetch(`${BASE}/__set`, { method: 'POST', body: JSON.stringify({ path: `game_rooms/${roomId}/strokes/${st.uid}_${st.turn}_${st.seq}`, data: st }) });
};

const uid = new URLSearchParams(location.search).get('as') || 'me';
export const heartbeat = async (roomId: string, u: string) => {
  await fetch(`${BASE}/__set`, { method: 'POST', body: JSON.stringify({ path: `game_rooms/${roomId}/presence/${u || uid}`, data: { at: Date.now() } }) }).catch(() => {});
};

export const subscribeInvites = (u: string, cb: (inv: GameInvite[]) => void) =>
  poll(`${BASE}/__query?col=game_invites&f=to&v=${u}`, (j) => j.docs as GameInvite[], cb, 1000);

export const dismissInvite = async (id: string) => {
  await fetch(`${BASE}/__del`, { method: 'POST', body: JSON.stringify({ path: `game_invites/${id}` }) });
};
