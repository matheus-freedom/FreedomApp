import React from 'react';
import { UserSession, PlacementSkill, Level } from '../types';
import { api } from '../services/api';
import {
  Brain, BookOpen, Volume2, PenTool, Home, Coins,
  Lock, CheckCircle2, Sparkles, ChevronRight, Clock
} from 'lucide-react';

interface PlacementHubScreenProps {
  user: UserSession;
  onHome: () => void;
  // Iniciar o teste de uma habilidade — ligado na Sub-etapa 4.2.
  // Deixado opcional aqui para o hub ser comitável e testável sozinho.
  onStartSkill?: (skill: PlacementSkill) => void;
}

// Metadados visuais de cada habilidade (rótulo PT + ícone).
const SKILL_META: Record<PlacementSkill, { label: string; icon: React.ReactNode }> = {
  [PlacementSkill.Grammar]:   { label: 'Gramática', icon: <Brain className="w-6 h-6" /> },
  [PlacementSkill.Reading]:   { label: 'Leitura',   icon: <BookOpen className="w-6 h-6" /> },
  [PlacementSkill.Writing]:   { label: 'Escrita',   icon: <PenTool className="w-6 h-6" /> },
  [PlacementSkill.Listening]: { label: 'Audição',   icon: <Volume2 className="w-6 h-6" /> },
};

// Ordem fixa de exibição dos quatro cards.
const SKILL_ORDER: PlacementSkill[] = [
  PlacementSkill.Grammar,
  PlacementSkill.Reading,
  PlacementSkill.Writing,
  PlacementSkill.Listening,
];

// ── Um card de habilidade no hub ───────────────────────────────
const SkillCard: React.FC<{
  skill: PlacementSkill;
  user: UserSession;
  onStart?: (skill: PlacementSkill) => void;
}> = ({ skill, user, onStart }) => {
  const meta = SKILL_META[skill];
  const status = api.getSkillPlacementStatus(user, skill);

  // Traduz o estado em rótulo/badge visual.
  // 'never'      → nunca fez, primeira vez é grátis
  // 'free_again' → passou dos 30 dias, refazer é grátis
  // 'cooldown'   → dentro dos 30 dias, refazer custa FR$10
  const isDone = status.result !== null;
  const level: Level | null = status.result?.level ?? null;
  const score = status.result?.score ?? null;

  let badge: React.ReactNode;
  if (status.state === 'never') {
    badge = (
      <span className="flex items-center gap-1.5 text-[#f7931e] font-black uppercase text-[9px] tracking-widest">
        <Sparkles className="w-3 h-3" /> Grátis
      </span>
    );
  } else if (status.state === 'free_again') {
    badge = (
      <span className="flex items-center gap-1.5 text-green-400 font-black uppercase text-[9px] tracking-widest">
        <CheckCircle2 className="w-3 h-3" /> Refazer grátis
      </span>
    );
  } else {
    // cooldown
    badge = (
      <span className="flex items-center gap-1.5 text-gray-400 font-black uppercase text-[9px] tracking-widest">
        <Coins className="w-3 h-3 text-[#f7931e]" /> FR$ {status.retakeCost} p/ refazer
      </span>
    );
  }

  return (
    <button
      onClick={() => onStart?.(skill)}
      className="group text-left bg-[#222222] p-6 rounded-3xl border border-white/5 hover:border-[#f7931e]/40 transition-all flex flex-col gap-5 min-h-[200px] relative overflow-hidden"
    >
      {/* Ícone decorativo grande ao fundo */}
      <div className="absolute -bottom-4 -right-4 opacity-5 group-hover:opacity-10 group-hover:scale-110 transition-all">
        {React.cloneElement(meta.icon as React.ReactElement<{ className?: string }>, { className: 'w-28 h-28' })}
      </div>

      {/* Topo: ícone + nome + badge de estado */}
      <div className="flex items-start justify-between relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#333333] text-[#f7931e] flex items-center justify-center group-hover:bg-[#f7931e] group-hover:text-[#222222] transition-all">
            {meta.icon}
          </div>
          <h3 className="text-xl font-black text-white uppercase tracking-tighter">{meta.label}</h3>
        </div>
        {badge}
      </div>

      {/* Corpo: nível atingido (se já fez) ou convite (se nunca fez) */}
      <div className="relative z-10 flex-1 flex flex-col justify-end">
        {isDone && level ? (
          <div className="space-y-3">
            <div className="flex items-end gap-3">
              <div>
                <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest block">Seu nível</span>
                <span className="text-4xl font-black text-[#f7931e] drop-shadow-[0_0_15px_rgba(247,147,30,0.3)]">
                  {level}{level === Level.A1 && score !== null && score === 0 ? '' : ''}
                </span>
              </div>
              {score !== null && (
                <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest pb-1">
                  {score} pts
                </span>
              )}
            </div>
            {status.state === 'cooldown' && (
              <div className="flex items-center gap-1.5 text-[9px] font-black text-gray-600 uppercase tracking-widest">
                <Clock className="w-3 h-3" /> Refazer grátis em {status.daysLeft} {status.daysLeft === 1 ? 'dia' : 'dias'}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-gray-500 font-bold text-sm group-hover:text-[#f7931e] transition-colors">
            <span>Descobrir meu nível</span>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        )}
      </div>
    </button>
  );
};

const PlacementHubScreen: React.FC<PlacementHubScreenProps> = ({ user, onHome, onStartSkill }) => {
  const frBalance = user.gamification.frBalance ?? 0;

  return (
    <div className="w-full max-w-4xl mx-auto p-4 md:p-6 pb-32 animate-fade-in">
      {/* Cabeçalho */}
      <div className="w-full flex justify-between items-end border-b border-[#333333] pb-6 mb-8">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[#f7931e] font-black uppercase text-[10px] tracking-widest">
            <Sparkles className="w-3 h-3" /> Nivelamento por Habilidade
          </div>
          <h2 className="text-3xl md:text-4xl font-black text-white uppercase tracking-tighter">
            Descubra seu Nível
          </h2>
        </div>
        <button
          onClick={onHome}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#333333] text-gray-400 hover:text-white font-black uppercase text-[10px] tracking-widest transition-all shrink-0"
        >
          <Home className="w-4 h-4" /> Início
        </button>
      </div>

      {/* Saldo de Freedom Coins */}
      <div className="flex items-center justify-between bg-[#2a2a2a] rounded-2xl px-5 py-3 mb-6 border border-white/5">
        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Seu saldo</span>
        <span className="flex items-center gap-2 text-[#f7931e] font-black text-lg">
          <Coins className="w-5 h-5" /> FR$ {frBalance.toFixed(2)}
        </span>
      </div>

      {/* Texto explicativo curto */}
      <p className="text-gray-500 text-sm font-medium mb-8 leading-relaxed">
        Escolha uma habilidade para avaliar. Cada uma é testada de forma independente,
        do nível A1 ao C1. A primeira avaliação de cada habilidade é gratuita.
      </p>

      {/* Grade dos quatro cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SKILL_ORDER.map(skill => (
          <SkillCard key={skill} skill={skill} user={user} onStart={onStartSkill} />
        ))}
      </div>
    </div>
  );
};

export default PlacementHubScreen;
