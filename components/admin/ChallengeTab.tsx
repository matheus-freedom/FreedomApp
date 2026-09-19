import React, { useMemo } from 'react';
import { Users, Activity, TrendingUp, ShieldAlert, Trophy, Heart, ChevronRight } from 'lucide-react';
import { UserSession, StudyPlan } from '../../types';
import { spParts } from '../../services/analytics';
import { Section, Avatar, Empty } from './ui';

// ════════════════════════════════════════════════════════════════
// ABA "DESAFIO" — acompanhamento do Easter Challenge (planos de
// estudo marcados como desafio): progresso e vidas de cada
// participante. Clicar num participante abre a ficha completa.
// ════════════════════════════════════════════════════════════════

interface Props { users: UserSession[]; plans: Record<string, StudyPlan>; onSelect: (userId: string) => void }

const ChallengeTab: React.FC<Props> = ({ users, plans, onSelect }) => {
  const participants = useMemo(() => users.filter(u => plans[u.userId]?.isChallenge), [users, plans]);
  const stats = useMemo(() => {
    const today = spParts(Date.now()).day;
    const progress = participants.map(u => (plans[u.userId].completedTasks || 0) / (plans[u.userId].totalTasks || 1));
    return {
      total: participants.length,
      activeToday: participants.filter(u => u.gamification.lastLoginDate === today).length,
      avgProgress: participants.length ? Math.round((progress.reduce((a, b) => a + b, 0) / participants.length) * 100) : 0,
      disqualified: participants.filter(u => (plans[u.userId].lives ?? 3) <= 0).length,
    };
  }, [participants, plans]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { i: <Users className="w-5 h-5" />, v: stats.total, l: 'Participantes' },
          { i: <Activity className="w-5 h-5" />, v: stats.activeToday, l: 'Ativos hoje' },
          { i: <TrendingUp className="w-5 h-5" />, v: `${stats.avgProgress}%`, l: 'Progresso médio' },
          { i: <ShieldAlert className="w-5 h-5" />, v: stats.disqualified, l: 'Desclassificados' },
        ].map(k => (
          <div key={k.l} className="bg-[#2a2a2a] p-5 rounded-[1.75rem] border border-white/5 shadow-xl">
            <div className="w-10 h-10 rounded-xl bg-[#f7931e]/10 flex items-center justify-center text-[#f7931e] mb-3">{k.i}</div>
            <p className="text-3xl font-black text-white tabular-nums leading-none">{k.v}</p>
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mt-2">{k.l}</p>
          </div>
        ))}
      </div>

      <Section title="Participantes" icon={<Trophy className="w-4 h-4 text-[#f7931e]" />} hint="Progresso no plano do desafio e vidas restantes.">
        {participants.length === 0 ? <Empty text="Ninguém está em um desafio no momento." /> : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {participants.map(u => {
              const plan = plans[u.userId];
              const pct = Math.round(((plan.completedTasks || 0) / (plan.totalTasks || 1)) * 100);
              const lives = plan.lives ?? 3;
              return (
                <button key={u.userId} onClick={() => onSelect(u.userId)} className="flex items-center gap-3 bg-[#222222] hover:bg-[#2f2f2f] border border-white/5 rounded-2xl p-3.5 text-left transition-colors group">
                  <Avatar photo={u.profilePhoto} name={u.fullName} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-white truncate">{u.fullName}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="flex-1 h-1.5 bg-[#333333] rounded-full overflow-hidden"><div className="h-full bg-[#f7931e] rounded-full" style={{ width: `${pct}%` }} /></div>
                      <span className="text-[10px] font-black text-gray-300 tabular-nums">{pct}%</span>
                    </div>
                  </div>
                  <div className="flex gap-0.5 shrink-0" title={`${lives} vida${lives === 1 ? '' : 's'}`}>
                    {[1, 2, 3].map(i => <Heart key={i} className={`w-3.5 h-3.5 ${i <= lives ? 'text-red-500 fill-red-500' : 'text-gray-700'}`} />)}
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-700 group-hover:text-[#f7931e] shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
};

export default ChallengeTab;
