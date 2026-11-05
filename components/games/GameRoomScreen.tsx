import React, { useEffect } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { showToast } from '../Toast';
import { GameRoom, gamesApi } from '../../services/gamesApi';
import { gameAudio } from '../../services/gameAudio';
import { GZ, SoundToggles } from './theme';
import { useRoom } from './useRoom';
import RoomLobby from './RoomLobby';
import QuizPlay from './QuizPlay';
import DrawPlay from './DrawPlay';
import Podium from './Podium';

// ════════════════════════════════════════════════════════════════
// Uma sala de jogo: escolhe a tela certa conforme o estado (saguão,
// jogando, pódio) e a trilha sonora que combina com cada momento.
// ════════════════════════════════════════════════════════════════
interface Props { roomId: string; seed?: GameRoom | null; uid: string; onExit: () => void; onOpenRoom: (r: GameRoom) => void }

const GameRoomScreen: React.FC<Props> = ({ roomId, seed, uid, onExit, onOpenRoom }) => {
  const { room, missing, accept } = useRoom(roomId, uid, seed);

  // Trilha: saguão animado; quiz acelerado; desenho tranquilo.
  useEffect(() => {
    if (!room) return;
    if (room.status === 'lobby') gameAudio.play('lobby');
    else if (room.status === 'playing') gameAudio.play(room.game === 'quiz' ? 'quiz' : 'draw');
  }, [room?.status, room?.game]); // eslint-disable-line react-hooks/exhaustive-deps

  // Removido pelo host ou sala encerrada.
  const kicked = !!room?.kicked?.includes(uid);
  useEffect(() => {
    if (kicked) { showToast('Você foi removido da sala pelo host.', 'info'); onExit(); }
  }, [kicked]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (room?.status === 'closed') { showToast('Essa sala foi encerrada.', 'info'); onExit(); }
  }, [room?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const leave = async () => {
    if (room && room.status === 'playing' && room.mode === 'party' && !window.confirm('Sair da partida? Seus pontos ficam, mas você para de jogar.')) return;
    try { if (room && room.status !== 'finished') await gamesApi.leave(roomId); } catch { /* sai mesmo assim */ }
    onExit();
  };

  if (missing) {
    return (
      <div className="gz-card p-8 text-center max-w-md mx-auto">
        <p className="text-xl font-semibold">Sala não encontrada</p>
        <button onClick={onExit} className="gz-btn gz-btn-orange mt-5">Voltar aos games</button>
      </div>
    );
  }
  if (!room) return <div className="flex justify-center py-24"><Loader2 className="w-10 h-10 animate-spin" style={{ color: GZ.orange }} /></div>;

  const title = room.game === 'quiz' ? 'Quiz Party' : 'Draw It!';
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={room.status === 'finished' ? onExit : leave} className="gz-btn gz-btn-ghost gz-btn-sm" aria-label={room.status === 'finished' ? 'Voltar aos games' : 'Sair da sala'}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-2xl font-semibold">{title}{room.mode === 'solo' ? ' · solo' : ''}</h2>
        <div className="ml-auto"><SoundToggles compact /></div>
      </div>
      {room.status === 'lobby' && <RoomLobby room={room} uid={uid} onLeave={leave} accept={accept} />}
      {room.status === 'playing' && room.game === 'quiz' && room.q && <QuizPlay key={room.id} room={room} uid={uid} accept={accept} />}
      {room.status === 'playing' && room.game === 'draw' && <DrawPlay key={room.id} room={room} uid={uid} accept={accept} />}
      {room.status === 'finished' && <Podium key={room.id} room={room} uid={uid} onExit={onExit} onOpenRoom={onOpenRoom} />}
    </div>
  );
};

export default GameRoomScreen;
