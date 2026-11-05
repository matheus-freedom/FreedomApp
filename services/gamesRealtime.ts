// ============================================================
// Tempo real dos Games (Firestore onSnapshot).
// ------------------------------------------------------------
// "onSnapshot" é o Firestore avisando o app CADA VEZ que um documento
// muda. É isso que faz todos os celulares da sala verem a mesma
// pergunta no mesmo instante, ou o desenho aparecendo enquanto o
// colega rabisca — sem ficar recarregando.
//
// O que o navegador pode fazer aqui (as regras do Firestore conferem):
//   • LER a sala (game_rooms/{id})            → todo aluno logado
//   • GRAVAR traços (…/strokes)               → só quem está desenhando
//   • GRAVAR o próprio sinal de vida (…/presence/{uid})
//   • LER e apagar os próprios convites (game_invites)
// Todo o resto (pontos, gabarito, palavra) só o servidor mexe.
// ============================================================
import {
  doc, collection, onSnapshot, query, where, setDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import type { GameRoom, GameKind } from './gamesApi';

export interface Stroke {
  id: string; turn: number; seq: number; uid: string;
  k: 'l' | 'c' | 'u'; // l = linha, c = limpar tudo, u = desfazer o último traço
  s: string;          // id do traço (vários pedaços podem formar um traço longo)
  c: number;          // cor (índice da paleta)
  w: number;          // espessura
  p: number[];        // pontos x,y,x,y... em 0..1000 (independe do tamanho da tela)
}

export interface GameInvite {
  id: string; to: string; roomId: string; code: string | null; game: GameKind; level: string;
  from: { username: string; name: string; photo: string | null }; fromUid: string; createdAt: number; expiresAt: number;
}

export const subscribeRoom = (roomId: string, cb: (room: GameRoom | null) => void, onError?: (e: Error) => void) =>
  onSnapshot(doc(db, 'game_rooms', roomId), (s) => cb(s.exists() ? (s.data() as GameRoom) : null), (e) => onError?.(e));

export const subscribeStrokes = (roomId: string, turn: number, cb: (strokes: Stroke[]) => void) =>
  onSnapshot(
    query(collection(db, 'game_rooms', roomId, 'strokes'), where('turn', '==', turn)),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Stroke, 'id'>) })).sort((a, b) => a.seq - b.seq)),
    () => { /* sem permissão = não é mais a vez; ignora */ },
  );

export const writeStroke = (roomId: string, st: Omit<Stroke, 'id'>) =>
  setDoc(doc(db, 'game_rooms', roomId, 'strokes', `${st.uid}_${st.turn}_${st.seq}`), st);

// Sinal de vida: a cada 10s o app diz "ainda estou aqui". Se parar
// (fechou a aba, caiu a internet), em 30s o servidor considera a pessoa
// fora do ar — por exemplo, passa a vez de quem desenhava.
export const heartbeat = (roomId: string, uid: string) =>
  setDoc(doc(db, 'game_rooms', roomId, 'presence', uid), { at: serverTimestamp() }).catch(() => { /* tenta de novo no próximo */ });

export const subscribeInvites = (uid: string, cb: (inv: GameInvite[]) => void) =>
  onSnapshot(
    query(collection(db, 'game_invites'), where('to', '==', uid)),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<GameInvite, 'id'>) }))),
    () => cb([]),
  );

export const dismissInvite = (id: string) => deleteDoc(doc(db, 'game_invites', id)).catch(() => {});
