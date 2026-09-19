import React, { useEffect, useState } from 'react';
import { BellRing, Ban, XCircle, UserPlus, ScrollText, Check, X, ShieldCheck, Loader2, Info } from 'lucide-react';
import { UserSession } from '../../types';
import { api, AccessLogEntry } from '../../services/api';
import { showToast } from '../Toast';
import { fmtAgo, ageLabel } from '../../services/analytics';
import { Section, Avatar, Empty, Pill } from './ui';

// ════════════════════════════════════════════════════════════════
// ABA "ACESSOS" — quem pode entrar no FreedomApp
// ────────────────────────────────────────────────────────────────
// Pedidos aguardando (em tempo real), contas bloqueadas/recusadas e
// o registro de todas as decisões. Bloquear um aluno que já usa o
// app é feito na ficha dele (aba Alunos → clicar no aluno).
// ════════════════════════════════════════════════════════════════

interface Props { users: UserSession[]; onChanged: () => void; onSelect: (userId: string) => void }

const DECISION_LABEL: Record<string, string> = { approve: 'Aprovado', reject: 'Recusado', block: 'Bloqueado', unblock: 'Desbloqueado' };
const DECISION_KIND: Record<string, string> = { approve: 'approved', reject: 'rejected', block: 'blocked', unblock: 'approved' };

const AccessTab: React.FC<Props> = ({ users, onChanged, onSelect }) => {
  const [pending, setPending] = useState<UserSession[]>([]);
  const [log, setLog] = useState<AccessLogEntry[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => api.subscribePendingAccess(setPending), []);
  const loadLog = () => api.admin_getAccessLog().then(setLog);
  useEffect(() => { loadLog(); }, []);

  const decide = async (u: UserSession, decision: 'approve' | 'reject' | 'unblock') => {
    setBusyId(u.userId);
    try {
      await api.admin_decideAccess(u.userId, decision);
      showToast(`${u.fullName}: ${DECISION_LABEL[decision].toLowerCase()}.`, decision === 'reject' ? 'info' : 'success');
      onChanged(); loadLog();
    } catch (e) { showToast(e instanceof Error ? e.message : 'Não consegui registrar a decisão.', 'error', 7000); }
    setBusyId(null);
  };

  const blocked = users.filter(u => u.accessStatus === 'blocked');
  const rejected = users.filter(u => u.accessStatus === 'rejected');
  const fresh = users.filter(u => u.accessStatus === 'new');

  const Row: React.FC<{ u: UserSession; meta: string; children: React.ReactNode }> = ({ u, meta, children }) => (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-[#222222] border border-white/5 rounded-2xl p-3.5">
      <button onClick={() => onSelect(u.userId)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
        <Avatar photo={u.profilePhoto} name={u.fullName} />
        <div className="min-w-0">
          <p className="text-sm font-black text-white truncate hover:text-[#f7931e]">{u.fullName}</p>
          <p className="text-[10px] font-bold text-gray-500 truncate">{u.username} · {u.email} · {meta}</p>
        </div>
      </button>
      <div className="flex gap-2 shrink-0">{children}</div>
    </div>
  );

  const Btn: React.FC<{ u: UserSession; d: 'approve' | 'reject' | 'unblock'; label: string; tone: 'good' | 'bad' }> = ({ u, d, label, tone }) => (
    <button disabled={busyId === u.userId} onClick={() => decide(u, d)}
      className={`flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 ${tone === 'good' ? 'bg-green-500 text-[#0f2a14] hover:bg-green-400' : 'bg-[#333333] text-red-400 border border-red-500/30 hover:bg-red-500 hover:text-white'}`}>
      {busyId === u.userId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : d === 'reject' ? <X className="w-3.5 h-3.5" /> : d === 'unblock' ? <ShieldCheck className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />} {label}
    </button>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start gap-3 bg-[#2a2a2a] border border-white/5 rounded-2xl p-4">
        <Info className="w-5 h-5 text-[#f7931e] shrink-0 mt-0.5" />
        <p className="text-xs text-gray-300 leading-relaxed">
          <b className="text-white">Como funciona:</b> quem cria conta agora vê o botão "Solicitar acesso" e só entra depois da sua aprovação. Contas que já existiam antes desta mudança continuam entrando normalmente.
          Para bloquear um aluno, abra a ficha dele na aba <b className="text-white">Alunos</b> — o bloqueio tira a pessoa do app na hora e impede novo login.
        </p>
      </div>

      <Section title={`Aguardando sua aprovação (${pending.length})`} icon={<BellRing className="w-4 h-4 text-[#f7931e]" />} hint="Atualiza sozinho: o pedido aparece aqui no momento em que o aluno clica em Solicitar acesso.">
        {pending.length === 0 ? <Empty text="Nenhum pedido aguardando." /> : (
          <div className="space-y-2">{pending.map(u => (
            <Row key={u.userId} u={u} meta={`pediu ${fmtAgo(u.accessRequestedAt || null)}${ageLabel(u.age) ? ` · ${ageLabel(u.age)}` : ''}`}>
              <Btn u={u} d="approve" label="Aprovar" tone="good" /><Btn u={u} d="reject" label="Recusar" tone="bad" />
            </Row>
          ))}</div>
        )}
      </Section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Section title={`Bloqueados (${blocked.length})`} icon={<Ban className="w-4 h-4 text-red-400" />}>
          {blocked.length === 0 ? <Empty text="Nenhuma conta bloqueada." /> : (
            <div className="space-y-2">{blocked.map(u => (
              <Row key={u.userId} u={u} meta={`bloqueado ${fmtAgo(u.accessDecidedAt || null)}${u.blockReason ? ` · ${u.blockReason}` : ''}`}><Btn u={u} d="unblock" label="Desbloquear" tone="good" /></Row>
            ))}</div>
          )}
        </Section>
        <Section title={`Recusados (${rejected.length})`} icon={<XCircle className="w-4 h-4 text-red-400" />} hint="Podem pedir de novo; você também pode aprovar direto daqui.">
          {rejected.length === 0 ? <Empty text="Nenhum pedido recusado." /> : (
            <div className="space-y-2">{rejected.map(u => (
              <Row key={u.userId} u={u} meta={`recusado ${fmtAgo(u.accessDecidedAt || null)}`}><Btn u={u} d="approve" label="Aprovar" tone="good" /></Row>
            ))}</div>
          )}
        </Section>
      </div>

      {fresh.length > 0 && (
        <Section title={`Criaram conta e ainda não pediram acesso (${fresh.length})`} icon={<UserPlus className="w-4 h-4 text-[#f7931e]" />} hint="Pararam na tela do botão. Se você reconhece o aluno, pode aprovar sem esperar o pedido.">
          <div className="space-y-2">{fresh.map(u => (
            <Row key={u.userId} u={u} meta={`conta criada ${fmtAgo(u.createdAt || null)}`}><Btn u={u} d="approve" label="Aprovar" tone="good" /></Row>
          ))}</div>
        </Section>
      )}

      <Section title="Registro de decisões" icon={<ScrollText className="w-4 h-4 text-[#f7931e]" />} hint="As últimas 100 decisões de acesso, com data e responsável.">
        {log.length === 0 ? <Empty text="Nenhuma decisão registrada ainda." /> : (
          <div className="max-h-[360px] overflow-y-auto custom-scrollbar space-y-1.5 pr-1">
            {log.map((l, i) => (
              <div key={i} className="flex items-center gap-3 bg-[#222222] border border-white/5 rounded-xl px-4 py-2.5">
                <Pill kind={DECISION_KIND[l.decision]}>{DECISION_LABEL[l.decision]}</Pill>
                <p className="text-xs font-bold text-gray-200 flex-1 min-w-0 truncate">{l.fullName} <span className="text-gray-600">{l.username}</span>{l.reason ? <span className="text-gray-500"> — {l.reason}</span> : null}</p>
                <p className="text-[10px] font-bold text-gray-500 shrink-0">{new Date(l.at).toLocaleDateString('pt-BR')} {new Date(l.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}{l.byName ? ` · ${l.byName}` : ''}</p>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
};

export default AccessTab;
