import React, { useState } from 'react';
import { Megaphone, Check, Loader2 } from 'lucide-react';
import { AdminNotification } from '../types';

// ════════════════════════════════════════════════════════════════
// MENSAGEM DA ESCOLA PARA O ALUNO
// ────────────────────────────────────────────────────────────────
// O painel admin sempre teve o botão "Mensagem", mas nada no app
// mostrava a mensagem ao aluno — ela ficava gravada e invisível.
// Este aviso fecha o circuito: mensagem não lida aparece na tela
// (inclusive em tempo real, se o aluno estiver com o app aberto) e
// some quando ele toca em "Entendi".
// ════════════════════════════════════════════════════════════════

interface Props {
  notification: AdminNotification;
  remaining: number;
  onRead: (id: string) => Promise<void>;
}

const AdminMessageModal: React.FC<Props> = ({ notification, remaining, onRead }) => {
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-[650] bg-black/85 backdrop-blur-xl flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-[#2a2a2a] w-full max-w-md rounded-[2.5rem] border-2 border-[#f7931e]/50 p-8 text-center space-y-5 animate-pop shadow-[0_0_50px_rgba(247,147,30,0.2)]">
        <div className="w-16 h-16 bg-[#f7931e]/10 rounded-full flex items-center justify-center mx-auto"><Megaphone className="w-8 h-8 text-[#f7931e]" /></div>
        <div>
          <h3 className="text-xl font-black text-white uppercase tracking-tighter">Recado da Freedom</h3>
          <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mt-1">{new Date(notification.date).toLocaleDateString('pt-BR')}</p>
        </div>
        <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-wrap text-left bg-[#222222] rounded-2xl p-5 border border-white/5 max-h-64 overflow-y-auto">{notification.message}</p>
        <button disabled={busy} onClick={async () => { setBusy(true); await onRead(notification.id); setBusy(false); }}
          className="w-full py-4 bg-[#f7931e] text-[#222222] rounded-2xl font-black uppercase tracking-widest hover:scale-105 transition-transform flex items-center justify-center gap-2 disabled:opacity-60">
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />} Entendi{remaining > 0 ? ` (mais ${remaining})` : ''}
        </button>
      </div>
    </div>
  );
};

export default AdminMessageModal;
