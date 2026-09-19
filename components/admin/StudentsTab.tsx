import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Download, ChevronRight, Users } from 'lucide-react';
import { UserSession } from '../../types';
import { StudentRow, StudentStatus, STATUS_META, fmtAgo, fmtMinutes, toCsv } from '../../services/analytics';
import { Section, Pill, Avatar, Delta, Empty, ACCESS_LABEL } from './ui';

// ════════════════════════════════════════════════════════════════
// ABA "ALUNOS" — todos os alunos numa tabela que dá para ordenar,
// filtrar por situação e exportar. Clicar numa linha abre a ficha.
// ════════════════════════════════════════════════════════════════

interface Props {
  rows: StudentRow[];
  users: UserSession[];
  search: string;
  onSelect: (userId: string) => void;
}

type SortKey = 'fullName' | 'lastSeen' | 'sessions30' | 'minutes30' | 'exercises30' | 'avgPct30' | 'totalExercises' | 'xp';
const STATUS_ORDER: StudentStatus[] = ['ativo', 'esfriando', 'em_risco', 'inativo', 'nunca_praticou'];

const StudentsTab: React.FC<Props> = ({ rows, users, search, onSelect }) => {
  const [filter, setFilter] = useState<StudentStatus | 'all' | 'restricted'>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'lastSeen', dir: -1 });
  const photoBy = useMemo(() => new Map(users.map(u => [u.userId, u.profilePhoto])), [users]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length, restricted: rows.filter(r => r.accessStatus !== 'approved').length };
    STATUS_ORDER.forEach(s => { c[s] = rows.filter(r => r.status === s).length; });
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter(r => filter === 'all' ? true : filter === 'restricted' ? r.accessStatus !== 'approved' : r.status === filter)
      .filter(r => !q || r.fullName.toLowerCase().includes(q) || r.username.toLowerCase().includes(q) || r.email.toLowerCase().includes(q))
      .sort((a, b) => {
        const va = a[sort.key] ?? -1, vb = b[sort.key] ?? -1;
        if (typeof va === 'string' || typeof vb === 'string') return String(va).localeCompare(String(vb), 'pt-BR') * sort.dir;
        return ((va as number) - (vb as number)) * sort.dir;
      });
  }, [rows, filter, search, sort]);

  const exportCsv = () => {
    const header = ['Nome', 'Usuário', 'E-mail', 'Situação', 'Acesso', 'Último acesso', 'Dias sem usar', 'Acessos 30d', 'Minutos 30d', 'Exercícios 30d', 'Exercícios 30d anteriores', 'Nota média 30d (%)', 'Total de exercícios', 'XP', 'Ofensiva', 'Habilidade favorita', 'PRO'];
    const body = visible.map(r => [r.fullName, r.username, r.email, STATUS_META[r.status].label, ACCESS_LABEL[r.accessStatus] || r.accessStatus,
      r.lastSeen ? new Date(r.lastSeen).toLocaleString('pt-BR') : '', r.daysAway, r.sessions30, r.minutes30, r.exercises30, r.exercisesPrev30, r.avgPct30, r.totalExercises, r.xp, r.streak, r.favoriteTheme, r.isPro ? 'sim' : 'não']);
    const blob = new Blob([toCsv([header, ...body])], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `alunos-freedomapp-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const Th: React.FC<{ k: SortKey; children: React.ReactNode; right?: boolean }> = ({ k, children, right }) => (
    <th className={`px-3 py-3 ${right ? 'text-right' : 'text-left'}`}>
      <button onClick={() => setSort(s => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : (k === 'fullName' ? 1 : -1) }))}
        className={`inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest hover:text-white ${sort.key === k ? 'text-[#f7931e]' : 'text-gray-500'}`}>
        {children}{sort.key === k && (sort.dir === 1 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
      </button>
    </th>
  );

  const chip = (key: typeof filter, label: string, hint?: string) => (
    <button key={key} onClick={() => setFilter(key)} title={hint}
      className={`px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${filter === key ? 'bg-[#f7931e] text-[#222222] border-[#f7931e]' : 'bg-[#222222] text-gray-400 border-white/5 hover:text-white'}`}>
      {label} <span className="opacity-70 tabular-nums">{counts[key] ?? 0}</span>
    </button>
  );

  return (
    <Section title="Todos os alunos" icon={<Users className="w-4 h-4 text-[#f7931e]" />}
      hint="Clique no título de uma coluna para ordenar e em um aluno para abrir a ficha completa. Os números de 30 dias comparam com os 30 dias anteriores."
      right={<button onClick={exportCsv} className="px-4 py-2.5 bg-[#222222] border border-white/5 rounded-xl text-[10px] font-black text-gray-300 uppercase tracking-widest flex items-center gap-2 hover:border-[#f7931e]/50 hover:text-white transition-all"><Download className="w-3.5 h-3.5" /> Exportar planilha</button>}>
      <div className="flex flex-wrap gap-2 mb-5">
        {chip('all', 'Todos')}
        {STATUS_ORDER.map(s => chip(s, STATUS_META[s].label, STATUS_META[s].hint))}
        {counts.restricted > 0 && chip('restricted', 'Sem acesso liberado', 'aguardando, recusados ou bloqueados')}
      </div>

      {visible.length === 0 ? <Empty text="Nenhum aluno com estes filtros." /> : (
        <div className="overflow-x-auto custom-scrollbar -mx-2">
          <table className="w-full min-w-[980px] border-separate border-spacing-y-1.5 px-2">
            <thead>
              <tr>
                <Th k="fullName">Aluno</Th>
                <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-widest text-gray-500">Situação</th>
                <Th k="lastSeen">Último acesso</Th>
                <Th k="sessions30" right>Acessos 30d</Th>
                <Th k="minutes30" right>Tempo 30d</Th>
                <Th k="exercises30" right>Exercícios 30d</Th>
                <Th k="avgPct30" right>Nota 30d</Th>
                <Th k="totalExercises" right>Total</Th>
                <Th k="xp" right>XP</Th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map(r => (
                <tr key={r.userId} onClick={() => onSelect(r.userId)} className="bg-[#222222] hover:bg-[#2f2f2f] cursor-pointer transition-colors group">
                  <td className="px-3 py-3 rounded-l-2xl">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar photo={photoBy.get(r.userId)} name={r.fullName} size="w-9 h-9" />
                      <div className="min-w-0">
                        <p className="text-xs font-black text-white truncate max-w-[200px]">{r.fullName}{r.isPro && <span className="ml-1.5 text-[8px] bg-[#f7931e] text-[#222222] px-1.5 py-0.5 rounded font-black align-middle">PRO</span>}</p>
                        <p className="text-[10px] font-bold text-gray-500 truncate max-w-[200px]">{r.username}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    {r.accessStatus !== 'approved'
                      ? <Pill kind={r.accessStatus}>{ACCESS_LABEL[r.accessStatus] || r.accessStatus}</Pill>
                      : <Pill kind={r.status} title={STATUS_META[r.status].hint}>{STATUS_META[r.status].label}</Pill>}
                  </td>
                  <td className="px-3 py-3 text-xs font-bold text-gray-300 whitespace-nowrap">{fmtAgo(r.lastSeen)}</td>
                  <td className="px-3 py-3 text-right text-xs font-black text-white tabular-nums">{r.sessions30}</td>
                  <td className="px-3 py-3 text-right text-xs font-bold text-gray-300 tabular-nums whitespace-nowrap">{r.minutes30 ? fmtMinutes(r.minutes30) : '—'}</td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex items-center justify-end gap-2"><Delta value={r.trend} compact /><span className="text-xs font-black text-white tabular-nums">{r.exercises30}</span></div>
                  </td>
                  <td className="px-3 py-3 text-right text-xs font-bold text-gray-300 tabular-nums">{r.avgPct30 !== null ? `${r.avgPct30}%` : '—'}</td>
                  <td className="px-3 py-3 text-right text-xs font-bold text-gray-300 tabular-nums">{r.totalExercises}</td>
                  <td className="px-3 py-3 text-right text-xs font-bold text-gray-300 tabular-nums">{r.xp.toLocaleString('pt-BR')}</td>
                  <td className="px-3 py-3 rounded-r-2xl text-right"><ChevronRight className="w-4 h-4 text-gray-700 group-hover:text-[#f7931e] inline" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
};

export default StudentsTab;
