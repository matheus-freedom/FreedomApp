import React, { useEffect, useState } from 'react';
import { BellRing, Check, X, Loader2, ChevronRight, UserPlus } from 'lucide-react';
import { UserSession } from '../types';
import { api } from '../services/api';
import { showToast } from './Toast';
import { fmtAgo } from '../services/analytics';

// ════════════════════════════════════════════════════════════════
// AVISO DE PEDIDOS DE ACESSO — tela inicial do ADMINISTRADOR
// ────────────────────────────────────────────────────────────────
// Aparece no topo da tela inicial só para o admin e só quando há
// pedido aguardando. Escuta o banco em tempo real: o aluno clica em
// "Solicitar acesso" e o cartão surge aqui sem recarregar a página.
// Dá para aprovar/recusar direto daqui ou abrir o painel completo.
// ════════════════════════════════════════════════════════════════

interface Props { onOpenPanel: () => void }

const AccessRequestsBanner: React.FC<Props> = ({ onOpenPanel }) => {
  const [pending, setPending] = useState<UserSession[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => api.subscribePendingAccess(setPending), []);

  if (pending.length === 0) return null;

  const decide = async (u: UserSession, decision: 'approve' | 'reject') => {
    setBusyId(u.userId);
    try {
      await api.admin_decideAccess(u.userId, decision);
      showToast(decision === 'approve' ? `${u.fullName} foi aprovado(a) e já pode entrar.` : `Pedido de ${u.fullName} recusado.`, decision === 'approve' ? 'success' : 'info');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Não consegui registrar a decisão.', 'error', 7000);
    }
    setBusyId(null);
  };

  return (
    <div className="max-w-6xl mx-auto mt-6 animate-fade-in">
      <div className="bg-[#2a2a2a] border-2 border-[#f7931e]/60 rounded-[2rem] p-5 md:p-6 shadow-[0_0_40px_rgba(247,147,30,0.15)]">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 shrink-0 rounded-2xl bg-[#f7931e]/15 flex items-center justify-center text-[#f7931e] relative">
              <BellRing className="w-5 h-5" />
              <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center">{pending.length}</span>
            </div>
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-widest">
                {pending.length === 1 ? '1 pedido de acesso aguardando' : `${pending.length} pedidos de acesso aguardando`}
              </h3>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Contas novas só entram depois da sua aprovação</p>
            </div>
          </div>
          <button onClick={onOpenPanel} className="hidden sm:flex items-center gap-1 text-[10px] font-black text-[#f7931e] uppercase tracking-widest hover:underline shrink-0">
            Abrir painel <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="space-y-2">
          {pending.slice(0, 4).map(u => (
            <div key={u.userId} className="flex flex-col sm:flex-row sm:items-center gap-3 bg-[#222222] rounded-2xl p-3.5 border border-white/5">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-full bg-[#333333] overflow-hidden flex items-center justify-center shrink-0 text-gray-500">
                  {u.profilePhoto ? <img src={u.profilePhoto} alt="" className="w-full h-full object-cover" /> : <UserPlus className="w-4 h-4" />}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-black text-white truncate">{u.fullName}</p>
                  <p className="text-[10px] font-bold text-gray-500 truncate">{u.username} · pediu {fmtAgo(u.accessRequestedAt || null)}</p>
                  <p className="text-[10px] font-bold text-gray-600 truncate">{u.email}</p>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => decide(u, 'approve')} disabled={busyId === u.userId}
                  className="flex-1 sm:flex-none px-4 py-2.5 bg-green-500 text-[#0f2a14] rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 hover:bg-green-400 transition-all disabled:opacity-50">
                  {busyId === u.userId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Aprovar
                </button>
                <button onClick={() => decide(u, 'reject')} disabled={busyId === u.userId}
                  className="flex-1 sm:flex-none px-4 py-2.5 bg-[#333333] text-red-400 border border-red-500/30 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 hover:bg-red-500 hover:text-white transition-all disabled:opacity-50">
                  <X className="w-3.5 h-3.5" /> Recusar
                </button>
              </div>
            </div>
          ))}
          {pending.length > 4 && (
            <button onClick={onOpenPanel} className="w-full py-2.5 text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-white">
              + {pending.length - 4} no painel
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AccessRequestsBanner;
