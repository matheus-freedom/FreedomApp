
import React, { useState, useEffect, useMemo } from 'react';
import { showToast } from './Toast';
import { UserSession, ActivityRecord, Level, Theme, StudyPlan } from '../types';
import { api } from '../services/api';
import { 
  Users, BarChart2, Calendar, Settings, Search, ArrowLeft, 
  Mail, Key, Zap, Coins, Send, X, Filter, ChevronRight, 
  TrendingUp, Activity, CheckCircle, Clock, ShieldAlert,
  Edit, Trash2, MessageSquare, AlertTriangle, Loader2, AtSign,
  PenTool, Trophy, Heart
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';

interface AdminPanelProps {
  onBack: () => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ onBack }) => {
  const [users, setUsers] = useState<UserSession[]>([]);
  const [plans, setPlans] = useState<Record<string, StudyPlan>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserSession | null>(null);
  const [userHistory, setUserHistory] = useState<ActivityRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'general' | 'challenge'>('general');
  
  // Modais de Ação
  const [showResetModal, setShowResetModal] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showMessageModal, setShowMessageModal] = useState(false);
  
  // Form States
  const [newPassword, setNewPassword] = useState('');
  const [xpAdjustment, setXpAdjustment] = useState(0);
  const [frAdjustment, setFrAdjustment] = useState(0);
  const [adminMessage, setAdminMessage] = useState('');

  // Filtros de Atividade
  const [filterLevel, setFilterLevel] = useState<Level | 'All'>('All');
  const [filterTheme, setFilterTheme] = useState<Theme | 'All'>('All');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    const [allUsers, allPlans] = await Promise.all([
      api.admin_getAllUsers(),
      api.admin_getAllPlans()
    ]);
    setUsers(allUsers.filter(u => u.username.toLowerCase() !== 'admin'));
    setPlans(allPlans);
    setIsLoading(false);
  };

  const handleSelectUser = async (user: UserSession) => {
    setSelectedUser(user);
    const history = await api.admin_getUserHistory(user.userId);
    setUserHistory(history);
  };

  const filteredUsers = useMemo(() => {
    return users.filter(u => 
      u.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.username.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [users, searchTerm]);

  const filteredHistory = useMemo(() => {
    return userHistory.filter(rec => {
      const matchLevel = filterLevel === 'All' || rec.level === filterLevel;
      const matchTheme = filterTheme === 'All' || rec.theme === filterTheme;
      return matchLevel && matchTheme;
    });
  }, [userHistory, filterLevel, filterTheme]);

  const stats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const loggedToday = users.filter(u => u.gamification.lastLoginDate === today).length;
    const totalXp = users.reduce((acc, u) => acc + u.gamification.xp, 0);
    return {
      totalUsers: users.length,
      onlineToday: loggedToday,
      avgXp: users.length > 0 ? Math.round(totalXp / users.length) : 0
    };
  }, [users]);

  const challengeUsers = useMemo(() => {
    return users.filter(u => {
      const plan = plans[u.userId];
      return plan && plan.isChallenge;
    });
  }, [users, plans]);

  const challengeStats = useMemo(() => {
    if (challengeUsers.length === 0) return null;

    const total = challengeUsers.length;
    const activeToday = challengeUsers.filter(u => u.gamification.lastLoginDate === new Date().toISOString().split('T')[0]).length;
    
    let totalProgress = 0;
    let fullLives = 0;
    let disqualified = 0;

    challengeUsers.forEach(u => {
      const plan = plans[u.userId];
      if (plan) {
        const progress = (plan.completedTasks || 0) / (plan.totalTasks || 1);
        totalProgress += progress;
        if ((plan.lives ?? 3) === 3) fullLives++;
        if ((plan.lives ?? 3) <= 0) disqualified++;
      }
    });

    return {
      total,
      activeToday,
      avgProgress: Math.round((totalProgress / total) * 100),
      fullLives,
      disqualified
    };
  }, [challengeUsers, plans]);

  const handleUpdateStats = async () => {
    if (!selectedUser) return;
    await api.admin_updateUserGamification(selectedUser.userId, xpAdjustment, frAdjustment);
    showToast("Saldo atualizado com sucesso!", 'success');
    setXpAdjustment(0);
    setFrAdjustment(0);
    setShowStatsModal(false);
    loadData();
  };

  const handleResetPassword = async () => {
    if (!selectedUser || !newPassword) return;
    const success = await api.admin_resetUserPassword(selectedUser.email, newPassword);
    if (success) {
      showToast(`Senha para ${selectedUser.email} alterada!`, 'success');
      setNewPassword('');
      setShowResetModal(false);
    }
  };

  const handleSendMessage = async () => {
    if (!selectedUser || !adminMessage) return;
    await api.admin_sendNotification(selectedUser.userId, adminMessage);
    showToast("Mensagem enviada para o aluno!", 'success');
    setAdminMessage('');
    setShowMessageModal(false);
  };

  const formatFR = (val: number) => "FR$ " + val.toLocaleString('pt-BR', { minimumFractionDigits: 2 });

  return (
    <div className="min-h-screen bg-[#222222] p-6 animate-fade-in pb-32">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-3 bg-[#333333] rounded-2xl border border-white/5 hover:border-[#f7931e]/50 text-gray-400 hover:text-white transition-all">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-3xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
                <ShieldAlert className="w-8 h-8 text-[#f7931e]" /> Painel Administrativo
              </h1>
              <p className="text-gray-500 font-bold uppercase tracking-widest text-[10px]">Freedom Governance Console</p>
            </div>
          </div>

          <div className="flex-1 md:max-w-md relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input 
              type="text" 
              placeholder="Pesquisar por nome, email ou @username..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#2a2a2a] border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-white text-sm outline-none focus:border-[#f7931e]/50 transition-all shadow-inner"
            />
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-4 border-b border-white/10 pb-4">
          <button 
            onClick={() => { setActiveTab('general'); setSelectedUser(null); }}
            className={`px-6 py-3 rounded-xl font-black uppercase tracking-widest text-xs transition-all flex items-center gap-2 ${activeTab === 'general' ? 'bg-[#f7931e] text-[#222222]' : 'bg-[#333333] text-gray-500 hover:text-white'}`}
          >
            <BarChart2 className="w-4 h-4" /> Visão Geral
          </button>
          <button 
            onClick={() => { setActiveTab('challenge'); setSelectedUser(null); }}
            className={`px-6 py-3 rounded-xl font-black uppercase tracking-widest text-xs transition-all flex items-center gap-2 ${activeTab === 'challenge' ? 'bg-[#f7931e] text-[#222222]' : 'bg-[#333333] text-gray-500 hover:text-white'}`}
          >
            <Trophy className="w-4 h-4" /> Easter Challenge
          </button>
        </div>

        {activeTab === 'general' ? (
          <>
            {/* Global Stats Dashboard */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-[#2a2a2a] p-8 rounded-[2rem] border border-white/5 shadow-xl group hover:border-[#f7931e]/30 transition-colors">
             <div className="flex justify-between items-start mb-4">
               <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-400"><Users className="w-6 h-6" /></div>
               <TrendingUp className="w-4 h-4 text-gray-700" />
             </div>
             <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Total de Alunos</p>
             <h3 className="text-4xl font-black text-white">{stats.totalUsers}</h3>
          </div>
          <div className="bg-[#2a2a2a] p-8 rounded-[2rem] border border-white/5 shadow-xl group hover:border-green-500/30 transition-colors">
             <div className="flex justify-between items-start mb-4">
               <div className="w-12 h-12 bg-green-500/10 rounded-2xl flex items-center justify-center text-green-400"><Clock className="w-6 h-6" /></div>
               <CheckCircle className="w-4 h-4 text-green-700" />
             </div>
             <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Ativos Hoje</p>
             <h3 className="text-4xl font-black text-white">{stats.onlineToday}</h3>
          </div>
          <div className="bg-[#2a2a2a] p-8 rounded-[2rem] border border-white/5 shadow-xl group hover:border-orange-500/30 transition-colors">
             <div className="flex justify-between items-start mb-4">
               <div className="w-12 h-12 bg-orange-500/10 rounded-2xl flex items-center justify-center text-orange-400"><Zap className="w-6 h-6" /></div>
               <BarChart2 className="w-4 h-4 text-orange-700" />
             </div>
             <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Média de XP Aluno</p>
             <h3 className="text-4xl font-black text-white">{stats.avgXp.toLocaleString()}</h3>
          </div>
        </div>

        {/* Users Management Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* List Sidebar */}
          <div className="lg:col-span-1 bg-[#2a2a2a] rounded-[2rem] border border-white/5 shadow-xl overflow-hidden flex flex-col h-[700px]">
            <div className="p-6 border-b border-white/5 bg-[#333333]/30">
              <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#f7931e]" /> Alunos Registrados
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-white/5">
              {isLoading ? (
                <div className="p-20 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-[#f7931e]" /></div>
              ) : filteredUsers.length === 0 ? (
                <div className="p-20 text-center text-gray-600 font-bold italic">Nenhum aluno encontrado.</div>
              ) : (
                filteredUsers.map(u => (
                  <div 
                    key={u.userId}
                    onClick={() => handleSelectUser(u)}
                    className={`p-5 cursor-pointer transition-all flex items-center gap-4 border-l-4 ${selectedUser?.userId === u.userId ? 'bg-[#f7931e]/10 border-[#f7931e]' : 'hover:bg-white/5 border-transparent'}`}
                  >
                    <div className="w-12 h-12 rounded-full bg-[#222222] border border-white/10 flex items-center justify-center shrink-0 overflow-hidden shadow-inner">
                      {u.profilePhoto ? <img src={u.profilePhoto} className="w-full h-full object-cover" /> : <Users className="w-5 h-5 text-gray-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-black text-white truncate">{u.fullName}</h4>
                      <p className="text-[10px] text-gray-500 font-bold uppercase truncate">{u.username}</p>
                    </div>
                    <ChevronRight className={`w-4 h-4 transition-transform ${selectedUser?.userId === u.userId ? 'text-[#f7931e] translate-x-1' : 'text-gray-700'}`} />
                  </div>
                ))
              )}
            </div>
          </div>

          {/* User Details Area */}
          <div className="lg:col-span-2 space-y-6">
            {!selectedUser ? (
              <div className="bg-[#2a2a2a] rounded-[2rem] border border-white/5 border-dashed h-[700px] flex flex-col items-center justify-center text-center p-8">
                 <Users className="w-20 h-20 text-gray-800 mb-6" />
                 <h4 className="text-xl font-black text-gray-600 uppercase tracking-tighter">Central de Gestão Alunos</h4>
                 <p className="text-gray-700 font-bold uppercase text-[10px] tracking-widest mt-2 max-w-xs">
                    Selecione um aluno da lista ao lado para acessar os controles de histórico, saldo e segurança.
                 </p>
              </div>
            ) : (
              <div className="animate-fade-in space-y-6">
                
                {/* Summary Profile Header */}
                <div className="bg-[#2a2a2a] rounded-[2.5rem] border border-white/5 p-8 shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-8 opacity-5"><ShieldAlert className="w-32 h-32" /></div>
                  <div className="flex flex-col md:flex-row gap-8 items-start relative z-10">
                    <div className="w-32 h-32 rounded-[2rem] bg-[#222222] border-4 border-[#f7931e] flex items-center justify-center shrink-0 overflow-hidden shadow-2xl">
                       {selectedUser.profilePhoto ? <img src={selectedUser.profilePhoto} className="w-full h-full object-cover" /> : <Users className="w-12 h-12 text-gray-700" />}
                    </div>
                    <div className="flex-1 space-y-4">
                       <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                         <div>
                            <h2 className="text-2xl font-black text-white leading-tight">{selectedUser.fullName}</h2>
                            <p className="text-[#f7931e] text-[10px] font-black uppercase tracking-widest flex items-center gap-2 mt-1">
                              <AtSign className="w-3.5 h-3.5" /> {selectedUser.username} <span className="text-gray-700">•</span> {selectedUser.email}
                            </p>
                         </div>
                         <div className="flex flex-wrap gap-2">
                            <button onClick={() => setShowMessageModal(true)} className="px-4 py-2 bg-blue-500/10 text-blue-400 border border-blue-500/30 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 hover:bg-blue-500 hover:text-white transition-all shadow-lg">
                              <MessageSquare className="w-3.5 h-3.5" /> Mensagem
                            </button>
                            <button onClick={() => setShowResetModal(true)} className="px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/30 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 hover:bg-red-500 hover:text-white transition-all shadow-lg">
                              <Key className="w-3.5 h-3.5" /> Senha
                            </button>
                            <button onClick={() => setShowStatsModal(true)} className="px-4 py-2 bg-orange-500/10 text-orange-400 border border-orange-500/30 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 hover:bg-orange-500 hover:text-white transition-all shadow-lg">
                              <Zap className="w-3.5 h-3.5" /> Saldo
                            </button>
                         </div>
                       </div>

                       <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-white/5">
                          <div className="bg-[#222222] p-3 rounded-2xl border border-white/5">
                            <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1">XP Total</p>
                            <span className="text-lg font-black text-white">{selectedUser.gamification.xp.toLocaleString()}</span>
                          </div>
                          <div className="bg-[#222222] p-3 rounded-2xl border border-white/5">
                            <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1">Freedom Reais</p>
                            <span className="text-lg font-black text-[#f7931e]">{formatFR(selectedUser.gamification.frBalance)}</span>
                          </div>
                          <div className="bg-[#222222] p-3 rounded-2xl border border-white/5">
                            <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1">Login</p>
                            <span className="text-sm font-black text-gray-300">{selectedUser.gamification.lastLoginDate || 'Nunca'}</span>
                          </div>
                          <div className="bg-[#222222] p-3 rounded-2xl border border-white/5">
                            <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1">Status</p>
                            <span className="text-sm font-black text-green-500">{selectedUser.gamification.isPro ? 'PRO' : 'STUDENT'}</span>
                          </div>
                       </div>
                    </div>
                  </div>
                </div>

                {/* Activity Logs Dashboard */}
                <div className="bg-[#2a2a2a] rounded-[2rem] border border-white/5 p-8 shadow-xl space-y-6">
                   <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                          <Activity className="w-4 h-4 text-[#f7931e]" /> Registro de Atividades
                        </h3>
                        <p className="text-[9px] text-gray-500 font-bold uppercase tracking-wider mt-1">Total de {userHistory.length} práticas concluídas</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                         <select 
                           value={filterLevel} 
                           onChange={(e) => setFilterLevel(e.target.value as any)}
                           className="bg-[#222222] border border-white/5 text-gray-400 text-[10px] font-black p-2.5 rounded-xl outline-none focus:border-[#f7931e]/50"
                         >
                           <option value="All">Nível</option>
                           {Object.values(Level).map(l => <option key={l} value={l}>{l}</option>)}
                         </select>
                         <select 
                           value={filterTheme} 
                           onChange={(e) => setFilterTheme(e.target.value as any)}
                           className="bg-[#222222] border border-white/5 text-gray-400 text-[10px] font-black p-2.5 rounded-xl outline-none focus:border-[#f7931e]/50"
                         >
                           <option value="All">Habilidade</option>
                           {Object.values(Theme).map(t => <option key={t} value={t}>{t}</option>)}
                         </select>
                      </div>
                   </div>

                   <div className="bg-[#222222] rounded-2xl border border-white/5 overflow-hidden shadow-inner">
                      {filteredHistory.length === 0 ? (
                        <div className="p-20 text-center text-gray-700 font-bold italic text-sm">Nenhuma atividade com estes filtros.</div>
                      ) : (
                        <div className="max-h-[400px] overflow-y-auto custom-scrollbar divide-y divide-white/5">
                           {filteredHistory.map(rec => (
                             <div key={rec.id} className="p-5 flex items-center justify-between hover:bg-white/5 transition-all">
                                <div className="flex items-start gap-4">
                                   <div className={`w-10 h-10 rounded-xl bg-[#333333] flex items-center justify-center shrink-0 text-[#f7931e] border border-white/5`}>
                                      {rec.theme === Theme.Writing ? <PenTool className="w-5 h-5" /> : <Activity className="w-5 h-5" />}
                                   </div>
                                   <div>
                                      <h4 className="text-sm font-black text-white">{rec.topic}</h4>
                                      <div className="flex gap-3 text-[9px] font-black text-gray-500 uppercase tracking-tighter mt-1">
                                        <span className="text-[#f7931e]">{rec.level}</span>
                                        <span className="opacity-30">•</span>
                                        <span>{rec.theme}</span>
                                        <span className="opacity-30">•</span>
                                        <span>{new Date(rec.date).toLocaleDateString()} {new Date(rec.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                      </div>
                                   </div>
                                </div>
                                <div className="text-right">
                                   <p className={`text-xl font-black ${rec.score >= (rec.total || 1) * 0.7 ? 'text-green-500' : 'text-blue-400'}`}>
                                      {Math.round((rec.score / (rec.total || 1)) * 100)}%
                                   </p>
                                   <span className="text-[8px] font-black text-gray-600 uppercase tracking-widest">Acurácia</span>
                                </div>
                             </div>
                           ))}
                        </div>
                      )}
                   </div>
                </div>
              </div>
            )}
          </div>
        </div>
        </>
        ) : (
          <div className="space-y-8 animate-fade-in">
             {/* Challenge Stats */}
             <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-[#2a2a2a] p-6 rounded-[2rem] border border-white/5 shadow-xl">
                   <div className="flex items-center gap-4 mb-2">
                      <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400"><Users className="w-5 h-5" /></div>
                      <span className="text-2xl font-black text-white">{challengeStats?.total || 0}</span>
                   </div>
                   <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Participantes</p>
                </div>
                <div className="bg-[#2a2a2a] p-6 rounded-[2rem] border border-white/5 shadow-xl">
                   <div className="flex items-center gap-4 mb-2">
                      <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center text-green-400"><Activity className="w-5 h-5" /></div>
                      <span className="text-2xl font-black text-white">{challengeStats?.activeToday || 0}</span>
                   </div>
                   <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Ativos Hoje</p>
                </div>
                <div className="bg-[#2a2a2a] p-6 rounded-[2rem] border border-white/5 shadow-xl">
                   <div className="flex items-center gap-4 mb-2">
                      <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400"><TrendingUp className="w-5 h-5" /></div>
                      <span className="text-2xl font-black text-white">{challengeStats?.avgProgress || 0}%</span>
                   </div>
                   <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Progresso Médio</p>
                </div>
                <div className="bg-[#2a2a2a] p-6 rounded-[2rem] border border-white/5 shadow-xl">
                   <div className="flex items-center gap-4 mb-2">
                      <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center text-red-400"><ShieldAlert className="w-5 h-5" /></div>
                      <span className="text-2xl font-black text-white">{challengeStats?.disqualified || 0}</span>
                   </div>
                   <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Desclassificados</p>
                </div>
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Challenge User List */}
                <div className="lg:col-span-1 bg-[#2a2a2a] rounded-[2rem] border border-white/5 shadow-xl overflow-hidden flex flex-col h-[600px]">
                   <div className="p-6 border-b border-white/5 bg-[#333333]/30">
                      <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                        <Trophy className="w-4 h-4 text-[#f7931e]" /> Participantes
                      </h3>
                   </div>
                   <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-white/5">
                      {challengeUsers.length === 0 ? (
                        <div className="p-12 text-center text-gray-600 font-bold italic text-xs">Ninguém aceitou o desafio ainda.</div>
                      ) : (
                        challengeUsers.map(u => {
                           const plan = plans[u.userId];
                           const progress = plan ? Math.round(((plan.completedTasks || 0) / (plan.totalTasks || 1)) * 100) : 0;
                           const lives = plan?.lives ?? 3;
                           
                           return (
                              <div 
                                key={u.userId}
                                onClick={() => handleSelectUser(u)}
                                className={`p-4 cursor-pointer transition-all flex items-center gap-3 border-l-4 ${selectedUser?.userId === u.userId ? 'bg-[#f7931e]/10 border-[#f7931e]' : 'hover:bg-white/5 border-transparent'}`}
                              >
                                <div className="w-10 h-10 rounded-full bg-[#222222] border border-white/10 flex items-center justify-center shrink-0 overflow-hidden">
                                  {u.profilePhoto ? <img src={u.profilePhoto} className="w-full h-full object-cover" /> : <Users className="w-4 h-4 text-gray-600" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h4 className="text-xs font-black text-white truncate">{u.fullName}</h4>
                                  <div className="flex items-center gap-2 mt-1">
                                     <div className="flex gap-0.5">
                                        {[1,2,3].map(i => (
                                           <Heart key={i} className={`w-3 h-3 ${i <= lives ? 'text-red-500 fill-red-500' : 'text-gray-700'}`} />
                                        ))}
                                     </div>
                                     <span className="text-[9px] font-bold text-blue-400">{progress}%</span>
                                  </div>
                                </div>
                                <ChevronRight className={`w-4 h-4 transition-transform ${selectedUser?.userId === u.userId ? 'text-[#f7931e] translate-x-1' : 'text-gray-700'}`} />
                              </div>
                           );
                        })
                      )}
                   </div>
                </div>

                {/* Challenge User Details */}
                <div className="lg:col-span-2">
                   {!selectedUser ? (
                      <div className="bg-[#2a2a2a] rounded-[2rem] border border-white/5 border-dashed h-[600px] flex flex-col items-center justify-center text-center p-8">
                         <Trophy className="w-20 h-20 text-gray-800 mb-6" />
                         <h4 className="text-xl font-black text-gray-600 uppercase tracking-tighter">Detalhes do Desafiante</h4>
                         <p className="text-gray-700 font-bold uppercase text-[10px] tracking-widest mt-2 max-w-xs">
                            Selecione um participante para ver o progresso detalhado no Easter Challenge.
                         </p>
                      </div>
                   ) : (
                      <div className="space-y-6 animate-fade-in">
                         {/* User Header */}
                         <div className="bg-[#2a2a2a] rounded-[2rem] border border-white/5 p-6 shadow-xl flex items-center gap-6">
                            <div className="w-20 h-20 rounded-2xl bg-[#222222] border-2 border-[#f7931e] flex items-center justify-center shrink-0 overflow-hidden">
                               {selectedUser.profilePhoto ? <img src={selectedUser.profilePhoto} className="w-full h-full object-cover" /> : <Users className="w-8 h-8 text-gray-700" />}
                            </div>
                            <div>
                               <h2 className="text-xl font-black text-white">{selectedUser.fullName}</h2>
                               <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-2">@{selectedUser.username}</p>
                               <div className="flex gap-2">
                                  <span className="px-3 py-1 rounded-lg bg-[#333333] text-gray-400 text-[10px] font-black uppercase border border-white/5">
                                     Último Login: {selectedUser.gamification.lastLoginDate || 'N/A'}
                                  </span>
                                  <span className="px-3 py-1 rounded-lg bg-[#333333] text-gray-400 text-[10px] font-black uppercase border border-white/5">
                                     Nível: {plans[selectedUser.userId]?.inputs.level || 'N/A'}
                                  </span>
                               </div>
                            </div>
                         </div>

                         {/* Challenge Progress */}
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-[#2a2a2a] p-6 rounded-[2rem] border border-white/5 shadow-xl">
                               <h3 className="text-xs font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                                  <Activity className="w-4 h-4 text-[#f7931e]" /> Progresso do Desafio
                               </h3>
                               <div className="flex items-center justify-center h-40">
                                  <span className="text-2xl font-black text-white">
                                     {plans[selectedUser.userId] ? Math.round(((plans[selectedUser.userId].completedTasks || 0) / (plans[selectedUser.userId].totalTasks || 1)) * 100) : 0}%
                                  </span>
                               </div>
                            </div>

                            <div className="bg-[#2a2a2a] p-6 rounded-[2rem] border border-white/5 shadow-xl">
                               <h3 className="text-xs font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                                  <Heart className="w-4 h-4 text-red-500" /> Status de Vidas
                               </h3>
                               <div className="flex flex-col items-center justify-center h-40 gap-4">
                                  <div className="flex gap-2">
                                     {[1, 2, 3].map(i => {
                                        const lives = plans[selectedUser.userId]?.lives ?? 3;
                                        return (
                                            <Heart 
                                                key={i} 
                                                className={`w-10 h-10 ${i <= lives ? 'text-red-500 fill-red-500' : 'text-gray-700'}`} 
                                            />
                                        );
                                     })}
                                  </div>
                                  <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">
                                     {(plans[selectedUser.userId]?.lives ?? 3) > 0 ? 'Ainda no jogo' : 'Desclassificado'}
                                  </p>
                               </div>
                            </div>
                         </div>

                         {/* Recent Activities */}
                         <div className="bg-[#2a2a2a] rounded-[2rem] border border-white/5 p-6 shadow-xl">
                            <h3 className="text-xs font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                               <Clock className="w-4 h-4 text-blue-400" /> Histórico Recente
                            </h3>
                            <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                               {userHistory.length === 0 ? (
                                  <p className="text-gray-600 text-xs font-bold italic text-center py-4">Nenhuma atividade registrada.</p>
                               ) : (
                                  userHistory.slice(0, 10).map(rec => (
                                     <div key={rec.id} className="p-3 bg-[#222222] rounded-xl border border-white/5 flex justify-between items-center">
                                        <div>
                                           <p className="text-xs font-black text-white">{rec.topic}</p>
                                           <p className="text-[9px] text-gray-500 font-bold uppercase">{new Date(rec.date).toLocaleDateString()} • {rec.theme}</p>
                                        </div>
                                        <span className={`text-xs font-black ${rec.score >= (rec.total || 1) * 0.7 ? 'text-green-500' : 'text-blue-400'}`}>
                                           {Math.round((rec.score / (rec.total || 1)) * 100)}%
                                        </span>
                                     </div>
                                  ))
                               )}
                            </div>
                         </div>
                      </div>
                   )}
                </div>
             </div>
          </div>
        )}
      </div>

      {/* MODAL: RESET PASSWORD */}
      {showResetModal && selectedUser && (
        <div className="fixed inset-0 z-[1000] bg-black/90 flex items-center justify-center p-4 backdrop-blur-md animate-fade-in">
           <div className="bg-[#2a2a2a] w-full max-w-md rounded-[2.5rem] border border-red-500/30 p-8 shadow-2xl animate-pop">
              <div className="flex justify-between items-center mb-6">
                 <h3 className="text-xl font-black text-white flex items-center gap-3 uppercase tracking-tighter">
                   <Key className="w-6 h-6 text-red-500" /> Redefinir Senha
                 </h3>
                 <button onClick={() => setShowResetModal(false)} className="text-gray-500 hover:text-white"><X /></button>
              </div>
              <p className="text-gray-400 text-xs font-bold leading-relaxed mb-6 uppercase tracking-widest">
                Você está alterando a senha de acesso para: <br/>
                <span className="text-white text-sm font-black">{selectedUser.email}</span>
              </p>
              <div className="space-y-4">
                 <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Nova Senha Provisória</label>
                    <input 
                      type="text" 
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Ex: Freedom2024"
                      className="w-full bg-[#222222] border border-[#333333] text-white rounded-2xl py-4 px-4 focus:border-red-500 outline-none text-sm"
                    />
                 </div>
                 <button 
                   onClick={handleResetPassword}
                   className="w-full py-5 bg-red-500 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-red-600 transition-all shadow-xl shadow-red-500/10"
                 >
                   Confirmar Mudança
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* MODAL: ADJUST STATS */}
      {showStatsModal && selectedUser && (
        <div className="fixed inset-0 z-[1000] bg-black/90 flex items-center justify-center p-4 backdrop-blur-md animate-fade-in">
           <div className="bg-[#2a2a2a] w-full max-w-md rounded-[2.5rem] border border-orange-500/30 p-8 shadow-2xl animate-pop">
              <div className="flex justify-between items-center mb-6">
                 <h3 className="text-xl font-black text-white flex items-center gap-3 uppercase tracking-tighter">
                   <Zap className="w-6 h-6 text-orange-400" /> Ajuste de Saldo
                 </h3>
                 <button onClick={() => setShowStatsModal(false)} className="text-gray-500 hover:text-white"><X /></button>
              </div>
              <div className="space-y-6">
                 <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Adicionar/Remover XP</label>
                    <input 
                      type="number" 
                      value={xpAdjustment}
                      onChange={(e) => setXpAdjustment(parseInt(e.target.value) || 0)}
                      className="w-full bg-[#222222] border border-[#333333] text-white rounded-2xl py-4 px-4 focus:border-orange-500 outline-none text-sm"
                    />
                    <p className="text-[9px] text-gray-600 font-bold uppercase">Use valores negativos para remover XP.</p>
                 </div>
                 <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Adicionar/Remover FR$ (Freedom Coins)</label>
                    <input 
                      type="number" 
                      step="0.01"
                      value={frAdjustment}
                      onChange={(e) => setFrAdjustment(parseFloat(e.target.value) || 0)}
                      className="w-full bg-[#222222] border border-[#333333] text-white rounded-2xl py-4 px-4 focus:border-orange-500 outline-none text-sm"
                    />
                 </div>
                 <button 
                   onClick={handleUpdateStats}
                   className="w-full py-5 bg-orange-500 text-[#222222] rounded-2xl font-black uppercase tracking-widest hover:bg-orange-600 transition-all shadow-xl shadow-orange-500/10"
                 >
                   Salvar Alterações
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* MODAL: SEND MESSAGE */}
      {showMessageModal && selectedUser && (
        <div className="fixed inset-0 z-[1000] bg-black/90 flex items-center justify-center p-4 backdrop-blur-md animate-fade-in">
           <div className="bg-[#2a2a2a] w-full max-w-md rounded-[2.5rem] border border-blue-500/30 p-8 shadow-2xl animate-pop">
              <div className="flex justify-between items-center mb-6">
                 <h3 className="text-xl font-black text-white flex items-center gap-3 uppercase tracking-tighter">
                   <MessageSquare className="w-6 h-6 text-blue-400" /> Enviar Mensagem
                 </h3>
                 <button onClick={() => setShowMessageModal(false)} className="text-gray-500 hover:text-white"><X /></button>
              </div>
              <div className="space-y-4">
                 <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Conteúdo do Aviso</label>
                    <textarea 
                      value={adminMessage}
                      onChange={(e) => setAdminMessage(e.target.value)}
                      placeholder="Escreva sua mensagem oficial para o aluno..."
                      className="w-full bg-[#222222] border border-[#333333] text-white rounded-2xl p-4 h-40 focus:border-blue-500 outline-none text-sm resize-none"
                    />
                 </div>
                 <button 
                   onClick={handleSendMessage}
                   className="w-full py-5 bg-blue-500 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-blue-600 transition-all flex items-center justify-center gap-3 shadow-xl shadow-blue-500/10"
                 >
                   <Send className="w-4 h-4" /> Enviar Agora
                 </button>
              </div>
           </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #333333;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #f7931e;
        }
      `}</style>
    </div>
  );
};

export default AdminPanel;
