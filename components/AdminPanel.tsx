import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ShieldAlert, Search, BarChart2, Users, HeartPulse, KeyRound, Trophy, GraduationCap, RefreshCw, Loader2, AlertTriangle } from 'lucide-react';
import { UserSession, StudyPlan } from '../types';
import { api } from '../services/api';
import { ASession, AHistory, AUser, PeriodKey, PERIOD_LABEL, periodRange, buildOverview, buildStudentRows, buildEngagement, fmtAgo } from '../services/analytics';
import OverviewTab from './admin/OverviewTab';
import StudentsTab from './admin/StudentsTab';
import StudentDetail from './admin/StudentDetail';
import EngagementTab from './admin/EngagementTab';
import AccessTab from './admin/AccessTab';
import ChallengeTab from './admin/ChallengeTab';
import FredAdminSection from './FredAdminSection';

// ════════════════════════════════════════════════════════════════
// PAINEL ADMINISTRATIVO
// ────────────────────────────────────────────────────────────────
// Este arquivo é só a "casca": carrega os dados UMA vez, guarda o
// período escolhido e decide qual aba mostrar. As contas ficam em
// services/analytics.ts e cada aba tem o próprio arquivo em
// components/admin/ — assim nenhum arquivo vira um monstro de 700
// linhas de novo, e mexer numa aba não arrisca quebrar as outras.
//
// CUSTO: abrir o painel lê os alunos + 180 dias de acessos e de
// histórico (180 e não 90 porque o período de 90 dias compara com os
// 90 anteriores). Trocar de aba ou de período NÃO lê nada de novo:
// tudo é recalculado na memória. Só o botão Atualizar relê o banco.
// ════════════════════════════════════════════════════════════════

interface AdminPanelProps { onBack: () => void }

type Tab = 'overview' | 'students' | 'engagement' | 'access' | 'challenge' | 'fred';
const LOAD_DAYS = 180;
const isStudent = (u: UserSession) => !u.isAdmin && u.username.toLowerCase() !== 'admin';

const AdminPanel: React.FC<AdminPanelProps> = ({ onBack }) => {
  const [users, setUsers] = useState<UserSession[]>([]);
  const [plans, setPlans] = useState<Record<string, StudyPlan>>({});
  const [sessions, setSessions] = useState<ASession[]>([]);
  const [history, setHistory] = useState<AHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [period, setPeriod] = useState<PeriodKey>('30d');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  const load = useCallback(async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true);
    const since = Date.now() - LOAD_DAYS * 24 * 60 * 60 * 1000;
    const problems: string[] = [];
    // Cada leitura falha sozinha: se as regras do Firestore ainda não
    // liberaram `sessions`, o resto do painel continua funcionando.
    const safe = async <T,>(p: Promise<T>, fallback: T, what: string): Promise<T> => {
      try { return await p; } catch (e) { console.error(what, e); problems.push(what); return fallback; }
    };
    const [u, p, s, h] = await Promise.all([
      safe(api.admin_getAllUsers(), [] as UserSession[], 'alunos'),
      safe(api.admin_getAllPlans(), {} as Record<string, StudyPlan>, 'planos'),
      safe(api.admin_getSessionsSince(since), [] as any[], 'acessos'),
      safe(api.admin_getHistorySince(since), [] as any[], 'histórico'),
    ]);
    setUsers(u.filter(isStudent)); setPlans(p); setSessions(s as ASession[]); setHistory(h as AHistory[]);
    setWarning(problems.length ? `Não consegui ler: ${problems.join(', ')}. Se for "acessos", falta publicar as novas regras do Firestore.` : null);
    setLoadedAt(Date.now());
    setLoading(false); setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => api.subscribePendingAccess(list => setPendingCount(list.length)), []);

  // Só entram nas estatísticas os acessos/exercícios de ALUNOS (o
  // histórico de testes da conta admin ficaria distorcendo as médias).
  const studentIds = useMemo(() => new Set(users.map(u => u.userId)), [users]);
  const sSessions = useMemo(() => sessions.filter(s => studentIds.has(s.userId)), [sessions, studentIds]);
  const sHistory = useMemo(() => history.filter(h => studentIds.has(h.userId)), [history, studentIds]);

  const rows = useMemo(() => buildStudentRows(users as unknown as AUser[], sSessions, sHistory), [users, sSessions, sHistory]);
  const overview = useMemo(() => buildOverview(sSessions, sHistory, users.length, periodRange(period)), [sSessions, sHistory, users.length, period]);
  const engagement = useMemo(() => buildEngagement(users as unknown as AUser[], rows, sSessions, sHistory), [users, rows, sSessions, sHistory]);

  const selectedUser = selectedId ? users.find(u => u.userId === selectedId) || null : null;
  const openStudent = (userId: string) => { setSelectedId(userId); setTab('students'); window.scrollTo({ top: 0 }); };

  const tabs: { key: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { key: 'overview', label: 'Visão geral', icon: <BarChart2 className="w-4 h-4" /> },
    { key: 'students', label: 'Alunos', icon: <Users className="w-4 h-4" /> },
    { key: 'engagement', label: 'Engajamento', icon: <HeartPulse className="w-4 h-4" /> },
    { key: 'access', label: 'Acessos', icon: <KeyRound className="w-4 h-4" />, badge: pendingCount },
    { key: 'challenge', label: 'Desafio', icon: <Trophy className="w-4 h-4" /> },
    { key: 'fred', label: 'Fred explica', icon: <GraduationCap className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-[#222222] p-4 md:p-6 animate-fade-in pb-32">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Cabeçalho */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-3 bg-[#333333] rounded-2xl border border-white/5 hover:border-[#f7931e]/50 text-gray-400 hover:text-white transition-all" title="Voltar ao app">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
                <ShieldAlert className="w-7 h-7 text-[#f7931e]" /> Painel Administrativo
              </h1>
              <p className="text-gray-500 font-bold uppercase tracking-widest text-[10px] flex items-center gap-2">
                {users.length} alunos · dados de {fmtAgo(loadedAt)}
                <button onClick={() => load(true)} disabled={refreshing} className="inline-flex items-center gap-1 text-[#f7931e] hover:underline disabled:opacity-50">
                  <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} /> atualizar
                </button>
              </p>
            </div>
          </div>
          <div className="flex-1 lg:max-w-sm relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input type="text" placeholder="Buscar aluno por nome, e-mail ou @usuário..." value={search}
              onChange={(e) => { setSearch(e.target.value); if (e.target.value) { setTab('students'); setSelectedId(null); } }}
              className="w-full bg-[#2a2a2a] border border-white/5 rounded-2xl py-3.5 pl-12 pr-4 text-white text-sm outline-none focus:border-[#f7931e]/50 transition-all" />
          </div>
        </div>

        {/* Abas + período */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1">
            {tabs.map(t => (
              <button key={t.key} onClick={() => { setTab(t.key); setSelectedId(null); }}
                className={`px-4 py-2.5 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all flex items-center gap-2 whitespace-nowrap ${tab === t.key ? 'bg-[#f7931e] text-[#222222]' : 'bg-[#333333] text-gray-400 hover:text-white'}`}>
                {t.icon} {t.label}
                {!!t.badge && <span className="min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">{t.badge}</span>}
              </button>
            ))}
          </div>
          {tab === 'overview' && (
            <div className="flex gap-1 bg-[#2a2a2a] border border-white/5 rounded-xl p-1 self-start">
              {(Object.keys(PERIOD_LABEL) as PeriodKey[]).map(p => (
                <button key={p} onClick={() => setPeriod(p)}
                  className={`px-3.5 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${period === p ? 'bg-white text-[#222222]' : 'text-gray-400 hover:text-white'}`}>
                  {PERIOD_LABEL[p]}
                </button>
              ))}
            </div>
          )}
        </div>

        {warning && (
          <div className="flex items-start gap-3 bg-yellow-400/10 border border-yellow-400/30 rounded-2xl p-4">
            <AlertTriangle className="w-5 h-5 text-yellow-300 shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-100 leading-relaxed">{warning}</p>
          </div>
        )}

        {loading ? (
          <div className="py-32 text-center"><Loader2 className="w-10 h-10 animate-spin mx-auto text-[#f7931e]" /><p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mt-4">Carregando dados dos alunos...</p></div>
        ) : tab === 'overview' ? (
          <OverviewTab data={overview} period={period} totalStudents={users.length} />
        ) : tab === 'students' ? (
          selectedUser
            ? <StudentDetail key={selectedUser.userId} user={selectedUser} row={rows.find(r => r.userId === selectedUser.userId)} onBack={() => setSelectedId(null)} onChanged={() => load(true)} />
            : <StudentsTab rows={rows} users={users} search={search} onSelect={openStudent} />
        ) : tab === 'engagement' ? (
          <EngagementTab data={engagement} rows={rows} onSelect={openStudent} />
        ) : tab === 'access' ? (
          <AccessTab users={users} onChanged={() => load(true)} onSelect={openStudent} />
        ) : tab === 'challenge' ? (
          <ChallengeTab users={users} plans={plans} onSelect={openStudent} />
        ) : (
          <FredAdminSection />
        )}
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.05); }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #333333; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #f7931e; }
      `}</style>
    </div>
  );
};

export default AdminPanel;
