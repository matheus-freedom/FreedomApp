
import React, { useState, useMemo } from 'react';
import { ActivityRecord, Level, Theme, UserSession } from '../types';
import { 
  ArrowLeft, Search, Filter, RotateCcw, Award, Calendar, 
  BarChart2, Target, TrendingUp, ChevronDown, CheckCircle, 
  BookOpen, Brain, Volume2, PenTool, Layout, Layers, Coins, Zap
} from 'lucide-react';

interface MyActivitiesScreenProps {
  user: UserSession;
  history: ActivityRecord[];
  onHome: () => void;
  onRedoActivity: (level: Level, theme: Theme, topic: string) => void;
}

const formatFR = (value: number) => {
  return "FR$ " + (value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const MyActivitiesScreen: React.FC<MyActivitiesScreenProps> = ({ user, history, onHome, onRedoActivity }) => {
  const [filterLevel, setFilterLevel] = useState<Level | 'All'>('All');
  const [filterTheme, setFilterTheme] = useState<Theme | 'All'>('All');
  const [searchTerm, setSearchTerm] = useState('');

  const analytics = useMemo(() => {
    if (history.length === 0) return null;

    const totalXp = history.reduce((acc, rec) => acc + rec.xpGained, 0);
    const totalFr = history.reduce((acc, rec) => acc + (rec.frGained || 0), 0);
    const avgAccuracy = Math.round(
      (history.reduce((acc, rec) => acc + (rec.score / (rec.total || 1)), 0) / history.length) * 100
    );

    const themePerformance: Record<string, { total: number, score: number, count: number }> = {};
    Object.values(Theme).forEach(t => themePerformance[t] = { total: 0, score: 0, count: 0 });

    history.forEach(rec => {
      if (themePerformance[rec.theme]) {
        themePerformance[rec.theme].count++;
        themePerformance[rec.theme].score += rec.score;
        themePerformance[rec.theme].total += (rec.total || 1);
      }
    });

    const themeStats = Object.entries(themePerformance).map(([theme, data]) => ({
      theme,
      accuracy: data.count > 0 ? Math.round((data.score / data.total) * 100) : 0,
      count: data.count
    })).sort((a, b) => b.accuracy - a.accuracy);

    return { totalXp, totalFr, avgAccuracy, themeStats };
  }, [history]);

  const filteredHistory = useMemo(() => {
    return history.filter(rec => {
      const matchLevel = filterLevel === 'All' || rec.level === filterLevel;
      const matchTheme = filterTheme === 'All' || rec.theme === filterTheme;
      const matchSearch = rec.topic.toLowerCase().includes(searchTerm.toLowerCase());
      return matchLevel && matchTheme && matchSearch;
    });
  }, [history, filterLevel, filterTheme, searchTerm]);

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 pb-24 animate-fade-in space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={onHome} 
            className="p-3 bg-[#333333] text-gray-400 rounded-2xl border border-white/5 hover:text-white hover:border-[#f7931e]/50 transition-all"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Minhas Atividades</h2>
            <p className="text-gray-400 text-sm">Acompanhe seu progresso e revise seu histórico.</p>
          </div>
        </div>
      </div>

      {analytics && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 grid grid-cols-1 gap-4">
            <div className="bg-[#2a2a2a] p-6 rounded-3xl border border-white/5 shadow-xl relative overflow-hidden group">
              <div className="absolute -right-4 -top-4 opacity-5 transform group-hover:scale-110 transition-transform">
                <Target className="w-32 h-32 text-[#f7931e]" />
              </div>
              <p className="text-[10px] font-black text-[#f7931e] uppercase tracking-widest mb-1">Precisão Média</p>
              <h3 className="text-5xl font-black text-white">{analytics.avgAccuracy}%</h3>
              <div className="mt-4 h-2 w-full bg-[#222222] rounded-full overflow-hidden">
                <div 
                  className="h-full bg-[#f7931e] shadow-[0_0_15px_rgba(247,147,30,0.5)] transition-all duration-1000" 
                  style={{ width: `${analytics.avgAccuracy}%` }}
                />
              </div>
            </div>

            <div className="bg-[#2a2a2a] p-6 rounded-3xl border border-white/5 shadow-xl relative overflow-hidden group">
              <div className="absolute -right-4 -top-4 opacity-5 transform group-hover:scale-110 transition-transform">
                <Coins className="w-32 h-32 text-green-400" />
              </div>
              <p className="text-[10px] font-black text-green-400 uppercase tracking-widest mb-1">Ganhos em FR$</p>
              {/* Fix: use formatFR instead of formatFr */}
              <h3 className="text-3xl font-black text-white">{formatFR(analytics.totalFr)}</h3>
              <p className="text-xs text-gray-500 font-bold mt-2 uppercase tracking-widest">{analytics.totalXp.toLocaleString()} XP Total</p>
            </div>
          </div>

          <div className="lg:col-span-2 bg-[#2a2a2a] p-8 rounded-3xl border border-white/5 shadow-xl">
            <h4 className="text-white font-black text-sm uppercase tracking-widest mb-6 flex items-center gap-3">
              <BarChart2 className="w-5 h-5 text-[#f7931e]" /> Desempenho por Habilidade
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
              {analytics.themeStats.map((stat, idx) => (
                <div key={idx} className="space-y-2">
                  <div className="flex justify-between items-end">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-tighter flex items-center gap-2">
                       {stat.theme}
                    </span>
                    <span className={`text-xs font-black ${stat.accuracy > 70 ? 'text-[#f7931e]' : 'text-gray-500'}`}>
                      {stat.accuracy}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-[#222222] rounded-full overflow-hidden border border-white/5">
                    <div 
                      className={`h-full transition-all duration-1000 ${stat.accuracy > 70 ? 'bg-[#f7931e]' : 'bg-gray-600'}`} 
                      style={{ width: `${stat.accuracy}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <h3 className="text-xl font-black text-white flex items-center gap-3 uppercase tracking-tighter">
            <Calendar className="w-6 h-6 text-[#f7931e]" /> Histórico Completo
          </h3>
          
          <div className="flex flex-wrap gap-2 w-full md:w-auto">
            <div className="flex-1 md:w-64 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input 
                type="text" 
                placeholder="Buscar por tópico..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[#2a2a2a] border border-white/5 text-white pl-12 pr-4 py-3 rounded-2xl text-xs outline-none focus:border-[#f7931e]/50 transition-all"
              />
            </div>
          </div>
        </div>

        <div className="bg-[#2a2a2a] rounded-3xl border border-white/5 shadow-xl overflow-hidden">
          {filteredHistory.length === 0 ? (
            <div className="p-20 text-center text-gray-600 font-black italic uppercase tracking-widest text-sm">
               Nenhuma atividade encontrada.
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {filteredHistory.map((rec) => (
                <div key={rec.id} className="p-6 hover:bg-[#333333] transition-all flex flex-col md:flex-row md:items-center justify-between gap-6 group">
                  <div className="flex items-start gap-5 flex-1">
                    <div className="w-12 h-12 rounded-2xl bg-[#222222] border border-white/5 flex items-center justify-center flex-shrink-0 group-hover:border-[#f7931e]/50 transition-all">
                       {rec.theme === Theme.Writing ? <PenTool className="w-6 h-6 text-[#f7931e]" /> : <BookOpen className="w-6 h-6 text-green-400" />}
                    </div>
                    <div>
                       <div className="flex items-center gap-2 mb-1">
                         <span className="text-[10px] font-black text-[#f7931e] uppercase tracking-widest bg-[#f7931e]/10 px-2 py-0.5 rounded-md">{rec.level}</span>
                         <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{rec.theme}</span>
                       </div>
                       <h4 className="text-white font-black text-lg group-hover:text-[#f7931e] transition-colors">{rec.topic}</h4>
                       <div className="flex gap-4 mt-1">
                        <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> {new Date(rec.date).toLocaleDateString()} {new Date(rec.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </p>
                        <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest flex items-center gap-1">
                          <Zap className="w-3 h-3" /> {rec.xpGained.toLocaleString()} XP
                        </p>
                        <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest flex items-center gap-1">
                          <Coins className="w-3 h-3" /> {formatFR(rec.frGained)}
                        </p>
                       </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-8 border-t md:border-t-0 border-white/5 pt-4 md:pt-0">
                    <div className="text-right">
                       <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Precisão</p>
                       <span className={`text-2xl font-black ${rec.score >= (rec.total || 1) * 0.7 ? 'text-green-500' : 'text-blue-400'}`}>
                         {Math.round((rec.score / (rec.total || 1)) * 100)}%
                       </span>
                    </div>
                    
                    <button 
                      onClick={() => onRedoActivity(rec.level, rec.theme, rec.topic)}
                      className="p-4 bg-[#222222] text-[#f7931e] rounded-2xl border border-[#f7931e]/20 hover:bg-[#f7931e] hover:text-[#222222] transition-all flex items-center gap-2 font-black text-xs uppercase tracking-tighter"
                    >
                      <RotateCcw className="w-4 h-4" /> Refazer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MyActivitiesScreen;
