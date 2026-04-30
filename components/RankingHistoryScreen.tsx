import React, { useState, useEffect } from 'react';
import { RankingSnapshot } from '../types';
import { api } from '../services/api';
import { ArrowLeft, Trophy, Medal, Loader2, Calendar, Zap, Activity } from 'lucide-react';

interface RankingHistoryScreenProps {
  onHome: () => void;
}

const MEDAL_CONFIG = {
  1: { emoji: '🥇', color: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/40', label: '1º lugar' },
  2: { emoji: '🥈', color: 'text-slate-300', bg: 'bg-slate-300/10', border: 'border-slate-300/40', label: '2º lugar' },
  3: { emoji: '🥉', color: 'text-amber-600', bg: 'bg-amber-600/10', border: 'border-amber-600/40', label: '3º lugar' },
};

const RankingHistoryScreen: React.FC<RankingHistoryScreenProps> = ({ onHome }) => {
  const [activeTab, setActiveTab] = useState<'monthly' | 'weekly'>('monthly');
  const [monthlyHistory, setMonthlyHistory] = useState<RankingSnapshot[]>([]);
  const [weeklyHistory, setWeeklyHistory] = useState<RankingSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      const [monthly, weekly] = await Promise.all([
        api.getRankingHistory('monthly', 12),
        api.getRankingHistory('weekly', 8),
      ]);
      setMonthlyHistory(monthly);
      setWeeklyHistory(weekly);
      setIsLoading(false);
    };
    load();
  }, []);

  const history = activeTab === 'monthly' ? monthlyHistory : weeklyHistory;

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 pb-24 animate-fade-in space-y-8">

      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={onHome} className="p-3 bg-[#333333] text-gray-400 rounded-2xl border border-white/5 hover:text-white hover:border-[#f7931e]/50 transition-all">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div>
          <h2 className="text-3xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
            <Trophy className="w-8 h-8 text-yellow-400" /> Hall da Fama
          </h2>
          <p className="text-gray-400 text-sm font-medium">Os campeões que lideraram o ranking Freedom.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-3">
        <button
          onClick={() => setActiveTab('monthly')}
          className={`px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-xs transition-all flex items-center gap-2 ${activeTab === 'monthly' ? 'bg-[#f7931e] text-[#222222]' : 'bg-[#2a2a2a] text-gray-500 border border-white/5 hover:text-white'}`}
        >
          <Calendar className="w-4 h-4" /> Por Mês
        </button>
        <button
          onClick={() => setActiveTab('weekly')}
          className={`px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-xs transition-all flex items-center gap-2 ${activeTab === 'weekly' ? 'bg-[#f7931e] text-[#222222]' : 'bg-[#2a2a2a] text-gray-500 border border-white/5 hover:text-white'}`}
        >
          <Zap className="w-4 h-4" /> Por Semana
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-12 h-12 text-[#f7931e] animate-spin" />
        </div>
      ) : history.length === 0 ? (
        <div className="bg-[#2a2a2a] rounded-[2.5rem] border border-white/5 p-20 text-center space-y-4">
          <Trophy className="w-20 h-20 text-gray-700 mx-auto" />
          <h3 className="text-xl font-black text-gray-500 uppercase tracking-tighter">Nenhum histórico ainda</h3>
          <p className="text-gray-600 text-sm font-medium max-w-xs mx-auto">
            O histórico de campeões será registrado automaticamente ao final de cada {activeTab === 'monthly' ? 'mês' : 'semana'}.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {history.map((snapshot) => (
            <div key={snapshot.id} className="bg-[#2a2a2a] rounded-[2.5rem] border border-white/5 shadow-xl overflow-hidden">
              
              {/* Período header */}
              <div className="px-8 py-5 bg-[#222222] border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#f7931e]/10 rounded-xl flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-[#f7931e]" />
                  </div>
                  <div>
                    <h3 className="text-white font-black text-sm uppercase tracking-widest">{snapshot.label}</h3>
                    <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">
                      {snapshot.top3.length} campeão{snapshot.top3.length !== 1 ? 'ões' : ''} registrado{snapshot.top3.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">
                  {new Date(snapshot.savedAt).toLocaleDateString('pt-BR')}
                </span>
              </div>

              {/* Top 3 */}
              <div className="p-6 space-y-3">
                {snapshot.top3.map((entry) => {
                  const medal = MEDAL_CONFIG[entry.position];
                  return (
                    <div key={entry.userId}
                      className={`flex items-center gap-4 p-4 rounded-2xl border ${medal.border} ${medal.bg} transition-all`}>
                      
                      {/* Posição */}
                      <div className="text-2xl w-8 text-center flex-shrink-0">{medal.emoji}</div>

                      {/* Foto */}
                      <div className={`w-12 h-12 rounded-full border-2 ${medal.border} bg-[#222222] overflow-hidden flex-shrink-0`}>
                        {entry.profilePhoto
                          ? <img src={entry.profilePhoto} className="w-full h-full object-cover" alt={entry.username} />
                          : <div className={`w-full h-full flex items-center justify-center text-lg font-black ${medal.color}`}>
                              {entry.fullName.charAt(0).toUpperCase()}
                            </div>
                        }
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className={`font-black text-sm truncate ${medal.color}`}>{entry.username}</p>
                        <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest truncate">{entry.fullName}</p>
                      </div>

                      {/* Stats */}
                      <div className="text-right flex-shrink-0">
                        <div className="flex items-center gap-1 justify-end">
                          <Zap className={`w-3.5 h-3.5 ${medal.color}`} />
                          <span className={`font-black text-sm ${medal.color}`}>{entry.xp.toLocaleString()} XP</span>
                        </div>
                        {entry.activitiesCount > 0 && (
                          <div className="flex items-center gap-1 justify-end mt-0.5">
                            <Activity className="w-3 h-3 text-gray-500" />
                            <span className="text-[10px] font-bold text-gray-500 uppercase">{entry.activitiesCount} atividades</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default RankingHistoryScreen;
