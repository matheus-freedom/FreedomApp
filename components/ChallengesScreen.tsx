
import React, { useState, useEffect } from 'react';
import { showToast } from './Toast';
import { UserSession, UserChallenge, Level } from '../types';
import { api } from '../services/api';
import { 
  ArrowLeft, Trophy, Users, Calendar, Target, Plus, 
  Sword, Heart, Info, Loader2, Check, X, Search,
  TrendingUp, TrendingDown, History, Activity,
  BarChart3, PieChart
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart as RePieChart, Pie, Cell
} from 'recharts';

interface ChallengesScreenProps {
  user: UserSession;
  onHome: () => void;
  onUserUpdate: (user: UserSession) => void;
}

const ChallengesScreen: React.FC<ChallengesScreenProps> = ({ user, onHome, onUserUpdate }) => {
  const [challenges, setChallenges] = useState<UserChallenge[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [inviteUsername, setInviteUsername] = useState('');
  const [invitedUsers, setInvitedUsers] = useState<UserSession[]>([]);
  
  // Create Form State
  const [challengeName, setChallengeName] = useState('');
  const [duration, setDuration] = useState(7);
  const [focus, setFocus] = useState('Geral');
  const [rules, setRules] = useState('');

  useEffect(() => {
    const loadChallenges = async () => {
      const data = await api.getChallenges();
      setChallenges(data.filter(c => (c.participantIds || []).includes(user.userId) || c.creatorId === user.userId));
      setIsLoading(false);
    };
    loadChallenges();
  }, [user.userId]);

  const handleAddInvite = async () => {
    if (!inviteUsername) return;
    const cleanUsername = inviteUsername.startsWith('@') ? inviteUsername : `@${inviteUsername}`;
    const allUsers = await api.admin_getAllUsers();
    const target = allUsers.find(u => u.username.toLowerCase() === cleanUsername.toLowerCase());
    
    if (!target) {
      showToast("Usuário não encontrado.", 'error');
      return;
    }
    if (target.userId === user.userId) {
      showToast("Você não pode convidar a si mesmo.", 'info');
      return;
    }
    if (invitedUsers.some(u => u.userId === target.userId)) {
      showToast("Usuário já convidado.", 'info');
      return;
    }
    setInvitedUsers([...invitedUsers, target]);
    setInviteUsername('');
  };

  const handleCreateChallenge = async () => {
    if (!challengeName || !rules) {
      showToast("Preencha todos os campos.", 'info');
      return;
    }

    const activeCount = challenges.filter(c => c.status === 'active' && (c.participantIds || []).includes(user.userId)).length;
    if (activeCount >= 5) {
      showToast("Você já possui 5 desafios ativos. Aguarde algum se encerrar.", 'info');
      return;
    }

    const newChallenge: UserChallenge = {
      id: crypto.randomUUID(),
      name: challengeName,
      creatorId: user.userId,
      participantIds: [user.userId],
      pendingInvites: invitedUsers.map(u => u.userId),
      startDate: Date.now(),
      endDate: Date.now() + (duration * 24 * 60 * 60 * 1000),
      durationDays: duration,
      focus,
      rules,
      status: 'active',
      participantStats: {
        [user.userId]: { xpGained: 0, activitiesDone: 0 }
      }
    };

    await api.saveChallenge(newChallenge);
    setChallenges([...challenges, newChallenge]);
    setShowCreateModal(false);
    setInvitedUsers([]);
    setChallengeName('');
    setRules('');
    showToast("Desafio criado com sucesso! Os convites foram enviados. ⚔️", 'success');
  };

  const activeChallenges = challenges.filter(c => c.status === 'active');
  const closedChallenges = challenges.filter(c => c.status === 'closed');
  
  // Calculate Trophies
  const trophies = closedChallenges.reduce((acc, challenge) => {
    const participants = (challenge.participantIds || []).map(pid => ({
      id: pid,
      xp: challenge.participantStats[pid]?.xpGained || 0
    })).sort((a, b) => b.xp - a.xp);

    const myRank = participants.findIndex(p => p.id === user.userId);
    if (myRank === 0) acc.gold++;
    else if (myRank === 1) acc.silver++;
    else if (myRank === 2) acc.bronze++;
    
    return acc;
  }, { gold: 0, silver: 0, bronze: 0 });

  const wonChallenges = closedChallenges.filter(c => {
    const participants = (c.participantIds || []).map(pid => ({
      id: pid,
      xp: c.participantStats[pid]?.xpGained || 0
    })).sort((a, b) => b.xp - a.xp);
    return participants[0]?.id === user.userId;
  });

  const lostChallenges = closedChallenges.filter(c => {
    const participants = (c.participantIds || []).map(pid => ({
      id: pid,
      xp: c.participantStats[pid]?.xpGained || 0
    })).sort((a, b) => b.xp - a.xp);
    return participants[0]?.id !== user.userId;
  });

  const chartData = [
    { name: 'Ganhos', value: trophies.gold, color: '#f7931e' },
    { name: 'Prata', value: trophies.silver, color: '#94a3b8' },
    { name: 'Bronze', value: trophies.bronze, color: '#92400e' },
    { name: 'Ativos', value: activeChallenges.length, color: '#3b82f6' },
  ];

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 pb-24 animate-fade-in space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={onHome} 
            className="p-3 bg-[#333333] text-gray-400 rounded-2xl border border-white/5 hover:text-white hover:border-[#f7931e]/50 transition-all"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Meus Desafios</h2>
            <p className="text-gray-400 text-sm font-medium">Compita com seus amigos e acelere sua fluência.</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Trophy Display */}
          <div className="flex items-center gap-2 bg-[#2a2a2a] p-2 rounded-2xl border border-white/5">
            {trophies.gold > 0 && (
              <div className="flex items-center gap-1 px-3 py-1 bg-yellow-400/10 rounded-xl border border-yellow-400/20">
                <Trophy className="w-4 h-4 text-yellow-400" />
                <span className="text-xs font-black text-yellow-400">
                  {trophies.gold > 1 ? `x${trophies.gold}` : ''}
                </span>
              </div>
            )}
            {trophies.silver > 0 && (
              <div className="flex items-center gap-1 px-3 py-1 bg-slate-400/10 rounded-xl border border-slate-400/20">
                <Trophy className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-black text-slate-400">
                  {trophies.silver > 1 ? `x${trophies.silver}` : ''}
                </span>
              </div>
            )}
            {trophies.bronze > 0 && (
              <div className="flex items-center gap-1 px-3 py-1 bg-amber-800/10 rounded-xl border border-amber-800/20">
                <Trophy className="w-4 h-4 text-amber-800" />
                <span className="text-xs font-black text-amber-800">
                  {trophies.bronze > 1 ? `x${trophies.bronze}` : ''}
                </span>
              </div>
            )}
          </div>

          <button 
            onClick={() => setShowCreateModal(true)}
            className="px-6 py-4 bg-[#f7931e] text-[#222222] rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-[#e08215] transition-all shadow-xl shadow-[#f7931e]/20"
          >
            <Plus className="w-5 h-5" /> Criar Desafio
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Stats Column */}
        <div className="space-y-6">
          <div className="bg-[#2a2a2a] p-8 rounded-[2.5rem] border border-white/5 shadow-xl">
            <h3 className="text-xl font-black text-white mb-6 flex items-center gap-2 uppercase tracking-tighter">
              <BarChart3 className="w-6 h-6 text-[#f7931e]" /> Desempenho
            </h3>
            
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RePieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#222', border: 'none', borderRadius: '12px', color: '#fff' }}
                    itemStyle={{ color: '#fff' }}
                  />
                </RePieChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-6">
              {chartData.map((stat, idx) => (
                <div key={idx} className="p-4 bg-[#222222] rounded-2xl border border-white/5">
                  <p className="text-[10px] font-black text-gray-500 uppercase mb-1">{stat.name}</p>
                  <p className="text-2xl font-black text-white">{stat.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[#2a2a2a] p-8 rounded-[2.5rem] border border-white/5 shadow-xl">
            <h3 className="text-xl font-black text-white mb-6 flex items-center gap-2 uppercase tracking-tighter">
              <TrendingUp className="w-6 h-6 text-green-500" /> Histórico Recente
            </h3>
            <div className="space-y-4">
              {closedChallenges.length > 0 ? (
                closedChallenges.slice(0, 5).map(c => (
                  <div key={c.id} className="flex items-center justify-between p-4 bg-[#222222] rounded-2xl border border-white/5">
                    <div>
                      <p className="text-sm font-black text-white">{c.name}</p>
                      <p className="text-[10px] text-gray-500 font-bold uppercase">{new Date(c.endDate).toLocaleDateString()}</p>
                    </div>
                    {c.winnerId === user.userId ? (
                      <span className="text-green-500 font-black text-xs uppercase tracking-widest">Vitória</span>
                    ) : (
                      <span className="text-red-500 font-black text-xs uppercase tracking-widest">Derrota</span>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-sm text-center py-4">Nenhum desafio encerrado ainda.</p>
              )}
            </div>
          </div>
        </div>

        {/* Active Challenges Column */}
        <div className="lg:col-span-2 space-y-6">
          <h3 className="text-2xl font-black text-white flex items-center gap-3 uppercase tracking-tighter">
            <Activity className="w-8 h-8 text-[#f7931e]" /> Desafios Ativos
          </h3>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-12 h-12 text-[#f7931e] animate-spin" />
            </div>
          ) : activeChallenges.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {activeChallenges.map(challenge => {
                const timeLeft = Math.max(0, challenge.endDate - Date.now());
                const daysLeft = Math.ceil(timeLeft / (1000 * 60 * 60 * 24));
                const myStats = challenge.participantStats[user.userId] || { xpGained: 0, activitiesDone: 0 };
                
                return (
                  <div key={challenge.id} className="bg-[#2a2a2a] p-6 rounded-[2.5rem] border border-white/5 shadow-xl hover:border-[#f7931e]/30 transition-all group">
                    <div className="flex justify-between items-start mb-4">
                      <div className="p-3 bg-[#f7931e]/10 rounded-2xl text-[#f7931e]">
                        <Trophy className="w-6 h-6" />
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Expira em</p>
                        <p className="text-sm font-black text-white">{daysLeft} dias</p>
                      </div>
                    </div>
                    
                    <h4 className="text-xl font-black text-white mb-2 group-hover:text-[#f7931e] transition-colors">{challenge.name}</h4>
                    <div className="flex items-center gap-2 mb-6">
                      <span className="px-3 py-1 bg-[#333333] rounded-full text-[10px] font-black text-gray-400 uppercase tracking-widest border border-white/5">
                        {challenge.focus}
                      </span>
                      <span className="flex items-center gap-1 text-[10px] font-black text-gray-500 uppercase tracking-widest">
                        <Users className="w-3 h-3" /> {(challenge.participantIds || []).length} participantes
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-6">
                      <div className="p-3 bg-[#222222] rounded-2xl border border-white/5">
                        <p className="text-[9px] font-black text-gray-500 uppercase mb-1">Seu XP</p>
                        <p className="text-lg font-black text-white">{myStats.xpGained} XP</p>
                      </div>
                      <div className="p-3 bg-[#222222] rounded-2xl border border-white/5">
                        <p className="text-[9px] font-black text-gray-500 uppercase mb-1">Atividades</p>
                        <p className="text-lg font-black text-white">{myStats.activitiesDone}</p>
                      </div>
                    </div>

                    <button className="w-full py-4 bg-[#333333] text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-[#444444] transition-all border border-white/5">
                      Ver Ranking do Desafio
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-[#2a2a2a] p-20 rounded-[2.5rem] border border-white/5 shadow-xl text-center">
              <Sword className="w-16 h-16 text-gray-600 mx-auto mb-6" />
              <h4 className="text-xl font-black text-white mb-2 uppercase tracking-tighter">Nenhum desafio ativo</h4>
              <p className="text-gray-500 max-w-xs mx-auto text-sm font-medium">Você ainda não está participando de nenhum desafio. Que tal criar um agora?</p>
              <button 
                onClick={() => setShowCreateModal(true)}
                className="mt-8 px-8 py-4 bg-[#f7931e] text-[#222222] rounded-2xl font-black uppercase tracking-widest hover:scale-105 transition-all"
              >
                Começar agora
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Create Challenge Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[600] bg-[#222222]/95 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="bg-[#2a2a2a] w-full max-w-2xl rounded-[3rem] border border-white/10 shadow-2xl overflow-hidden animate-pop">
            <div className="p-8 border-b border-white/5 flex justify-between items-center">
              <h3 className="text-2xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
                <Plus className="w-8 h-8 text-[#f7931e]" /> Novo Desafio
              </h3>
              <button 
                onClick={() => setShowCreateModal(false)}
                className="p-2 text-gray-500 hover:text-white transition-colors"
              >
                <X className="w-8 h-8" />
              </button>
            </div>

            <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Nome do Desafio</label>
                <input 
                  type="text" 
                  value={challengeName}
                  onChange={(e) => setChallengeName(e.target.value)}
                  className="w-full bg-[#222222] border border-[#333333] text-white rounded-2xl py-4 px-6 focus:border-[#f7931e] outline-none text-sm"
                  placeholder="Ex: Mestres da Gramática"
                />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Duração (Dias - Máx 30)</label>
                  <input 
                    type="number" 
                    min="1" 
                    max="30"
                    value={duration}
                    onChange={(e) => setDuration(Math.min(30, parseInt(e.target.value) || 1))}
                    className="w-full bg-[#222222] border border-[#333333] text-white rounded-2xl py-4 px-6 focus:border-[#f7931e] outline-none text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Foco do Desafio</label>
                  <select 
                    value={focus}
                    onChange={(e) => setFocus(e.target.value)}
                    className="w-full bg-[#222222] border border-[#333333] text-white rounded-2xl py-4 px-6 focus:border-[#f7931e] outline-none text-sm appearance-none"
                  >
                    <option value="Geral">Geral</option>
                    <option value="Gramática">Gramática</option>
                    <option value="Vocabulário">Vocabulário</option>
                    <option value="Business">Business</option>
                    <option value="Reading">Reading</option>
                    <option value="Listening">Listening</option>
                    <option value="Escrita">Escrita</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Regras e Descrição</label>
                <textarea 
                  value={rules}
                  onChange={(e) => setRules(e.target.value)}
                  className="w-full bg-[#222222] border border-[#333333] text-white rounded-2xl py-4 px-6 focus:border-[#f7931e] outline-none text-sm min-h-[100px] resize-none"
                  placeholder="Descreva as regras do desafio aqui..."
                />
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Convidar Participantes</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input 
                      type="text" 
                      value={inviteUsername}
                      onChange={(e) => setInviteUsername(e.target.value)}
                      className="w-full bg-[#222222] border border-[#333333] text-white rounded-2xl py-4 pl-12 pr-4 focus:border-[#f7931e] outline-none text-sm"
                      placeholder="Digite o @ do usuário"
                    />
                  </div>
                  <button 
                    onClick={handleAddInvite}
                    className="px-6 bg-[#333333] text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-[#444444] transition-all border border-white/5"
                  >
                    Convidar
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {invitedUsers.map(u => (
                    <div key={u.userId} className="flex items-center gap-2 px-3 py-2 bg-[#f7931e]/10 border border-[#f7931e]/30 rounded-xl">
                      <span className="text-xs font-black text-[#f7931e]">{u.username}</span>
                      <button 
                        onClick={() => setInvitedUsers(invitedUsers.filter(iu => iu.userId !== u.userId))}
                        className="text-[#f7931e] hover:text-white"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-8 bg-[#222222] flex gap-4">
              <button 
                onClick={handleCreateChallenge}
                className="flex-1 py-5 bg-[#f7931e] text-[#222222] rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-[#e08215] transition-all shadow-xl shadow-[#f7931e]/20"
              >
                <Sword className="w-5 h-5" /> Criar Desafio Agora
              </button>
              <button 
                onClick={() => setShowCreateModal(false)}
                className="px-8 py-5 bg-[#333333] text-white rounded-2xl font-black uppercase tracking-widest hover:bg-[#444444] transition-all border border-white/5"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChallengesScreen;
