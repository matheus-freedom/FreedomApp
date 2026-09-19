import React, { useEffect, useState } from 'react';
import { ShieldCheck, Send, Clock, XCircle, Ban, Loader2, MessageCircle, CheckCircle2 } from 'lucide-react';
import { UserSession, AccessStatus } from '../types';
import { api } from '../services/api';
import { showToast } from './Toast';

// ════════════════════════════════════════════════════════════════
// PORTA DE ENTRADA — substitui a antiga tela "Acesso Restrito"
// ────────────────────────────────────────────────────────────────
// Em vez de digitar uma palavra-chave (que qualquer aluno podia
// repassar), a conta NOVA pede acesso e o administrador decide.
//
// Esta tela escuta o próprio documento do aluno em tempo real
// (onSnapshot): no instante em que o admin aprova, ela libera a
// entrada sozinha — o aluno não precisa recarregar nem logar de novo.
// ════════════════════════════════════════════════════════════════

const WHATSAPP_URL = 'https://wa.me/message/JZDOD5MBRXEAO1';

interface Props {
  user: UserSession;
  onApproved: (user: UserSession) => void;
  onLogout: () => void;
}

const AccessGateScreen: React.FC<Props> = ({ user, onApproved, onLogout }) => {
  const [status, setStatus] = useState<AccessStatus>(user.accessStatus ?? 'new');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const unsubscribe = api.subscribeToUser(user.userId, (fresh) => {
      if (!fresh) return;
      const s = fresh.accessStatus ?? 'approved';
      setStatus(s);
      if (s === 'approved') onApproved(fresh);
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.userId]);

  const handleRequest = async () => {
    if (sending) return;
    setSending(true);
    try {
      await api.requestAccess(user.userId);
      setStatus('pending');
    } catch {
      showToast('Não consegui enviar seu pedido. Confira a internet e tente de novo.', 'error', 7000);
    }
    setSending(false);
  };

  const view = {
    new: {
      icon: <ShieldCheck className="w-12 h-12 text-[#f7931e]" />, tone: 'bg-[#f7931e]/10',
      title: `Quase lá, ${user.userName}!`,
      text: 'Sua conta foi criada. O FreedomApp é exclusivo para alunos da Freedom, então falta só um passo: pedir a liberação do seu acesso à escola.',
    },
    pending: {
      icon: <Clock className="w-12 h-12 text-yellow-400" />, tone: 'bg-yellow-400/10',
      title: 'Pedido enviado!',
      text: 'A equipe da Freedom já recebeu sua solicitação. Assim que ela for aprovada, esta tela libera sua entrada automaticamente — pode deixar aberta ou voltar mais tarde.',
    },
    rejected: {
      icon: <XCircle className="w-12 h-12 text-red-400" />, tone: 'bg-red-500/10',
      title: 'Pedido não aprovado',
      text: 'Sua solicitação de acesso não foi aprovada. Se você é aluno da Freedom e acha que houve um engano, fale com a secretaria e peça de novo.',
    },
    blocked: {
      icon: <Ban className="w-12 h-12 text-red-400" />, tone: 'bg-red-500/10',
      title: 'Acesso suspenso',
      text: 'Seu acesso à plataforma está suspenso no momento. Fale com a secretaria da Freedom para regularizar.',
    },
    approved: {
      icon: <CheckCircle2 className="w-12 h-12 text-green-400" />, tone: 'bg-green-500/10',
      title: 'Acesso liberado!', text: 'Entrando...',
    },
  }[status];

  return (
    <div className="max-w-md mx-auto pt-16 px-4 animate-fade-in">
      <div className="text-center mb-8">
        <div className={`inline-block p-4 rounded-full mb-4 ${view.tone}`}>{view.icon}</div>
        <h2 className="text-3xl font-black text-white uppercase tracking-tighter mb-3">{view.title}</h2>
        <p className="text-gray-400 text-sm font-medium leading-relaxed">{view.text}</p>
      </div>

      <div className="bg-[#2a2a2a] p-8 rounded-[2.5rem] border border-white/5 shadow-2xl space-y-4">
        <div className="flex items-center gap-3 bg-[#222222] rounded-2xl p-4 border border-white/5">
          <div className="w-11 h-11 rounded-full bg-[#333333] overflow-hidden flex items-center justify-center shrink-0 text-[#f7931e] font-black">
            {user.profilePhoto ? <img src={user.profilePhoto} alt="" className="w-full h-full object-cover" /> : (user.userName || '?').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-black text-white truncate">{user.fullName}</p>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest truncate">{user.username} · {user.email}</p>
          </div>
        </div>

        {(status === 'new' || status === 'rejected') && (
          <button onClick={handleRequest} disabled={sending}
            className="w-full py-5 bg-[#f7931e] text-[#222222] rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:scale-[1.02] transition-all shadow-xl shadow-[#f7931e]/20 disabled:opacity-60 disabled:scale-100">
            {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            {status === 'rejected' ? 'Solicitar novamente' : 'Solicitar acesso'}
          </button>
        )}

        {status === 'pending' && (
          <div className="flex items-center justify-center gap-3 py-4 text-yellow-400 text-[11px] font-black uppercase tracking-widest">
            <Loader2 className="w-4 h-4 animate-spin" /> Aguardando aprovação
          </div>
        )}

        {status !== 'new' && status !== 'approved' && (
          <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer"
            className="w-full py-4 bg-[#333333] text-white rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 border border-white/5 hover:border-[#f7931e]/40 transition-all">
            <MessageCircle className="w-4 h-4 text-green-400" /> Falar com a Freedom
          </a>
        )}

        <button type="button" onClick={onLogout}
          className="w-full py-3 text-gray-500 hover:text-white transition-colors text-[10px] font-black uppercase tracking-widest">
          Sair da conta
        </button>
      </div>
    </div>
  );
};

export default AccessGateScreen;
