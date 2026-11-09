import { useEffect, useRef, useState } from 'react';
import { GameRoom, gamesApi, toLocal } from '../../services/gamesApi';
import { heartbeat, subscribeRoom } from '../../services/gamesRealtime';

// ════════════════════════════════════════════════════════════════
// useRoom — mantém a tela sincronizada com a sala
// ────────────────────────────────────────────────────────────────
// 1) ESCUTA a sala no Firestore: cada mudança chega na hora.
// 2) SINAL DE VIDA a cada 10s (o servidor sabe quem ainda está aqui).
// 3) RELÓGIO: a sala diz em `nextAt` quando é o próximo evento (fim
//    da pergunta, dica, próxima vez...). Quando chega a hora, o app
//    chama "tick" e o servidor avança. Para não chover chamadas, só
//    um aparelho (o "puxador") chama na hora; os outros esperam 1,5s
//    e só chamam se ninguém tiver puxado — é o plano B se o puxador
//    tiver fechado o app.
// ════════════════════════════════════════════════════════════════
export const useRoom = (roomId: string, uid: string, seed?: GameRoom | null) => {
  const [room, setRoom] = useState<GameRoom | null>(seed || null);
  const [missing, setMissing] = useState(false);
  const roomRef = useRef<GameRoom | null>(seed || null);
  roomRef.current = room;

  useEffect(() => {
    const unsub = subscribeRoom(roomId, (r) => { if (r) { setRoom(r); setMissing(false); } else setMissing(true); });
    return unsub;
  }, [roomId]);

  // Sinal de vida.
  const live = room ? room.status === 'lobby' || room.status === 'playing' : true;
  useEffect(() => {
    if (!live) return;
    heartbeat(roomId, uid);
    const t = setInterval(() => { if (!document.hidden) heartbeat(roomId, uid); }, 10000);
    return () => clearInterval(t);
  }, [roomId, uid, live]);

  // Relógio.
  const nextAt = room?.nextAt ?? null;
  const phaseKey = room ? `${room.status}|${room.phase}|${room.q?.n ?? ''}|${room.turn ?? ''}|${nextAt}` : '';
  useEffect(() => {
    if (!room || !nextAt || (room.status !== 'lobby' && room.status !== 'playing')) return;
    const active = room.order.filter((u) => room.players[u] && !room.players[u].left).sort();
    // Puxador: o host (jogando ou apresentando). Se o host jogador saiu,
    // o primeiro jogador ativo assume.
    const iAmHost = room.hostId === uid && (!room.hostPlays || !room.players[uid]?.left);
    const hostGone = room.hostPlays && (!room.players[room.hostId] || room.players[room.hostId].left);
    const puller = iAmHost || (hostGone && active[0] === uid);
    const delay = Math.max(0, toLocal(nextAt) - Date.now()) + (puller ? 120 : 1500 + Math.random() * 900);
    let tries = 0;
    let timer: number;
    const fire = () => {
      const cur = roomRef.current;
      if (!cur || cur.nextAt !== nextAt) return; // alguém já puxou
      gamesApi.tick(roomId).then((r) => { if (r.room) setRoom((old) => (old && old.updatedAt > r.room.updatedAt ? old : r.room)); }).catch(() => {});
      // Se o relógio do servidor ainda não tinha chegado lá, tenta de novo.
      if (++tries < 6) timer = window.setTimeout(fire, 1500);
    };
    timer = window.setTimeout(fire, delay);
    return () => clearTimeout(timer);
  }, [phaseKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Draw It!: confere de vez em quando se quem desenha caiu (o servidor
  // só descobre quando alguém pergunta).
  const drawing = room?.game === 'draw' && room.status === 'playing' && (room.phase === 'draw' || room.phase === 'choose');
  useEffect(() => {
    if (!drawing) return;
    const t = setInterval(() => { if (!document.hidden) gamesApi.tick(roomId).catch(() => {}); }, 15000);
    return () => clearInterval(t);
  }, [drawing, roomId]);

  // Atualização otimista: a resposta de uma ação chega antes do snapshot.
  const accept = (r?: GameRoom | null) => { if (r) setRoom((old) => (old && old.updatedAt > r.updatedAt ? old : r)); };
  return { room, missing, accept };
};
