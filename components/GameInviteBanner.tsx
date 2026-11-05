import React, { useEffect, useState } from 'react';
import { Gamepad2, X } from 'lucide-react';
import { GameInvite, dismissInvite, subscribeInvites } from '../services/gamesRealtime';
import { serverNow } from '../services/gamesApi';

// ════════════════════════════════════════════════════════════════
// Convite para jogar, em TEMPO REAL e em qualquer tela do app.
// Quando um colega toca em "Convidar" no saguão, o servidor grava um
// documento em game_invites endereçado a este aluno; o app está
// "escutando" esses documentos e mostra este cartão na hora.
// ════════════════════════════════════════════════════════════════
interface Props { uid: string; onJoin: (code: string) => void }

const GameInviteBanner: React.FC<Props> = ({ uid, onJoin }) => {
  const [invites, setInvites] = useState<GameInvite[]>([]);
  useEffect(() => subscribeInvites(uid, setInvites), [uid]);
  const live = invites.filter((i) => i.expiresAt > serverNow() && i.code).sort((a, b) => b.createdAt - a.createdAt);
  const inv = live[0];
  // Convites vencidos somem do banco também.
  useEffect(() => { invites.filter((i) => i.expiresAt <= serverNow()).forEach((i) => dismissInvite(i.id)); }, [invites]);
  if (!inv) return null;
  const game = inv.game === 'quiz' ? 'Quiz Party' : 'Draw It!';
  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-5 z-[800] w-[min(92vw,440px)]" role="alert">
      <div className="flex items-center gap-3 p-3.5 rounded-[20px]" style={{ background: '#ffffff', color: '#222222', border: '3px solid #222222', boxShadow: '0 6px 0 #222222', fontFamily: "'Fredoka', system-ui, sans-serif" }}>
        <span className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: inv.game === 'quiz' ? '#f7931e' : '#3fd0ff', color: '#222222', border: '3px solid #222222' }}><Gamepad2 className="w-6 h-6" /></span>
        <p className="flex-1 text-sm leading-snug"><b>{inv.from.username || inv.from.name}</b> te chamou para jogar <b>{game}</b> ({inv.level})</p>
        <button onClick={() => { dismissInvite(inv.id); onJoin(inv.code!); }} className="px-3 py-2 rounded-xl font-semibold text-sm" style={{ background: '#f7931e', color: '#222222', border: '2px solid #222222' }}>Entrar</button>
        <button onClick={() => dismissInvite(inv.id)} className="p-1.5 rounded-lg" aria-label="Agora não" style={{ color: '#6b6b6b' }}><X className="w-4 h-4" /></button>
      </div>
    </div>
  );
};

export default GameInviteBanner;
