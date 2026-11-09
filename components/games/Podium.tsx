import React, { useEffect, useState } from 'react';
import { Home, Loader2, RotateCcw, Users } from 'lucide-react';
import { showToast } from '../Toast';
import { GameRoom, gamesApi } from '../../services/gamesApi';
import { gameAudio } from '../../services/gameAudio';
import { fr } from '../challenges/ui';
import { Avatar, Confetti, GZ } from './theme';

// ════════════════════════════════════════════════════════════════
// FIM DE PARTIDA — pódio, prêmio e "jogar de novo"
// ════════════════════════════════════════════════════════════════
interface Props { room: GameRoom; uid: string; onExit: () => void; onOpenRoom: (r: GameRoom) => void }

const Podium: React.FC<Props> = ({ room, uid, onExit, onOpenRoom }) => {
  const st = room.standings || [];
  const reward = room.rewards?.[uid];
  const mine = st.find((s) => s.uid === uid);
  const [busy, setBusy] = useState(false);
  const solo = room.mode === 'solo';
  const won = !solo && reward?.place === 1;

  useEffect(() => {
    gameAudio.play(null);
    gameAudio.fx(solo || (mine && mine.place <= 3) ? 'fanfare' : 'reveal');
    if (reward && reward.fr > 0) setTimeout(() => gameAudio.fx('coin'), 1300);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const again = async () => {
    if (busy) return;
    setBusy(true);
    try { const r = await gamesApi.again(room.id); onOpenRoom(r.room); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Não deu para começar outra.', 'error'); }
    finally { setBusy(false); }
  };

  const top = [st[1], st[0], st[2]]; // 2º, 1º, 3º (o 1º no meio, mais alto)
  const heights = [110, 150, 85];
  const colors = ['#c7d2fe', '#ffc93c', '#f59e7b'];
  const showNext = room.next && room.next.by !== uid;

  return (
    <div className="space-y-6">
      {(won || solo || (mine && mine.place <= 3)) && <Confetti />}
      <div className="text-center">
        <h2 className="text-4xl md:text-5xl font-bold">
          {solo ? 'Fim de jogo!' : won ? 'Você venceu! 🏆' : mine ? `Você ficou em ${mine.place}º` : 'Fim de jogo!'}
        </h2>
        {room.endReason === 'few' && <p className="mt-2" style={{ color: GZ.muted }}>A partida acabou mais cedo porque ficaram poucos jogadores.</p>}
      </div>

      {!solo && st.length > 0 && (
        <div className="flex items-end justify-center gap-2 md:gap-4 pt-6">
          {top.map((s, i) => s ? (
            <div key={s.uid} className="flex flex-col items-center w-24 md:w-36 gz-pop" style={{ animationDelay: `${[300, 700, 0][i]}ms` }}>
              <Avatar photo={room.players[s.uid]?.photo} name={room.players[s.uid]?.username || '?'} size={i === 1 ? 72 : 56} ring={s.uid === uid ? GZ.orange : undefined} />
              <p className="mt-2 font-semibold text-sm truncate max-w-full">{room.players[s.uid]?.username}</p>
              <p className="gz-num text-sm" style={{ color: GZ.muted }}>{s.score.toLocaleString('pt-BR')}</p>
              <div className="w-full mt-2 flex items-start justify-center pt-2 text-3xl font-bold"
                style={{ height: heights[i], background: colors[i], color: GZ.ink, border: `3px solid ${GZ.ink}`, borderBottom: 'none', borderRadius: '16px 16px 0 0' }}>
                {[2, 1, 3][i]}
              </div>
            </div>
          ) : <div key={i} className="w-24 md:w-36" />)}
        </div>
      )}

      <div className={`grid grid-cols-1 gap-5 mx-auto ${solo ? 'max-w-md' : 'lg:grid-cols-2 max-w-4xl'}`}>
        <div className="gz-card p-6 text-center">
          {mine ? (
            <>
              <p style={{ color: GZ.muted }}>{room.game === 'quiz' ? `${mine.correct} de ${room.total} certas` : `${mine.correct} palavra${mine.correct === 1 ? '' : 's'} adivinhada${mine.correct === 1 ? '' : 's'}`}</p>
              <p className="text-5xl font-bold gz-num mt-1">{mine.score.toLocaleString('pt-BR')}</p>
              <p style={{ color: GZ.muted }}>pontos</p>
            </>
          ) : <p style={{ color: GZ.muted }}>Você apresentou esta partida.</p>}
          {reward && room.paid && (
            <div className="mt-5 flex justify-center gap-3 flex-wrap">
              <span className="gz-chip text-base" style={{ background: GZ.lime, color: GZ.ink }}>+{reward.xp} XP</span>
              {reward.fr > 0 && <span className="gz-chip text-base" style={{ background: '#ffc93c', color: GZ.ink }}>+{fr(reward.fr)}</span>}
            </div>
          )}
          {reward?.capped && <p className="text-xs mt-3" style={{ color: GZ.muted }}>Você chegou ao limite de prêmios dos games de hoje. Amanhã tem mais!</p>}
          {mine && !reward && !solo && <p className="text-xs mt-3" style={{ color: GZ.muted }}>Para ganhar XP, participe respondendo ou adivinhando.</p>}
          {!room.paid && room.status === 'finished' && <Loader2 className="w-5 h-5 animate-spin mx-auto mt-4" style={{ color: GZ.cyan }} />}
        </div>

        {!solo && (
          <div className="gz-card p-5">
            <p className="font-semibold mb-3">Classificação</p>
            <ol className="space-y-2 max-h-72 overflow-y-auto gz-scroll pr-1">
              {st.map((s) => (
                <li key={s.uid} className="gz-inset flex items-center gap-3 p-2.5" style={{ outline: s.uid === uid ? `2px solid ${GZ.orange}` : undefined }}>
                  <span className="w-7 text-center font-bold gz-num">{s.place}º</span>
                  <Avatar photo={room.players[s.uid]?.photo} name={room.players[s.uid]?.username || '?'} size={32} />
                  <span className="flex-1 truncate font-semibold">{room.players[s.uid]?.username}</span>
                  <span className="font-bold gz-num">{s.score.toLocaleString('pt-BR')}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        {showNext ? (
          <button onClick={again} disabled={busy} className="gz-btn gz-btn-orange text-lg px-6 py-3.5">
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Users className="w-5 h-5" /> Entrar na revanche</>}
          </button>
        ) : (
          <button onClick={again} disabled={busy} className="gz-btn gz-btn-orange text-lg px-6 py-3.5">
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <><RotateCcw className="w-5 h-5" /> Jogar de novo</>}
          </button>
        )}
        <button onClick={onExit} className="gz-btn gz-btn-ghost text-lg px-6 py-3.5"><Home className="w-5 h-5" /> Voltar aos games</button>
      </div>
    </div>
  );
};

export default Podium;
