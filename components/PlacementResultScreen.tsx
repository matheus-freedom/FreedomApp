import React from 'react';
import { PlacementSkill, Level } from '../types';
import {
  Brain, BookOpen, Volume2, PenTool, Trophy, ArrowRight, Sparkles,
} from 'lucide-react';

interface PlacementResultScreenProps {
  skill: PlacementSkill;
  level: Level;
  score: number;
  onBackToHub: () => void;
}

const SKILL_META: Record<PlacementSkill, { label: string; icon: React.ReactNode }> = {
  [PlacementSkill.Grammar]:   { label: 'Gramática', icon: <Brain className="w-8 h-8" /> },
  [PlacementSkill.Reading]:   { label: 'Leitura',   icon: <BookOpen className="w-8 h-8" /> },
  [PlacementSkill.Writing]:   { label: 'Escrita',   icon: <PenTool className="w-8 h-8" /> },
  [PlacementSkill.Listening]: { label: 'Audição',   icon: <Volume2 className="w-8 h-8" /> },
};

// Descrição curta do que cada nível CEFR significa (em PT-BR).
const LEVEL_DESCRIPTION: Record<Level, string> = {
  [Level.A1]: 'Iniciante. Você entende e usa expressões cotidianas básicas e frases simples.',
  [Level.A2]: 'Básico. Você se comunica em tarefas simples e rotineiras sobre temas familiares.',
  [Level.B1]: 'Intermediário. Você lida com a maioria das situações de viagem e expressa opiniões sobre temas conhecidos.',
  [Level.B2]: 'Intermediário avançado. Você interage com fluência e naturalidade, e discute temas complexos com clareza.',
  [Level.C1]: 'Avançado. Você se expressa de forma espontânea e flexível, dominando estruturas complexas.',
};

// Rótulo amigável do nível (com "iniciante" no A1).
const levelLabel = (level: Level): string =>
  level === Level.A1 ? 'A1 (Iniciante)' : level;

const PlacementResultScreen: React.FC<PlacementResultScreenProps> = ({ skill, level, score, onBackToHub }) => {
  const meta = SKILL_META[skill];

  return (
    <div className="w-full max-w-2xl mx-auto p-4 md:p-6 min-h-[80vh] flex flex-col items-center justify-center text-center animate-fade-in">
      {/* Troféu / selo */}
      <div className="relative mb-8">
        <div className="absolute inset-0 bg-[#f7931e]/20 blur-3xl rounded-full" />
        <div className="relative w-28 h-28 rounded-full bg-gradient-to-br from-[#f7931e] to-[#e07b0a] flex items-center justify-center shadow-[0_0_40px_rgba(247,147,30,0.4)]">
          <Trophy className="w-14 h-14 text-[#222222]" />
        </div>
      </div>

      {/* Selo da habilidade */}
      <div className="flex items-center gap-2 text-[#f7931e] font-black uppercase text-[11px] tracking-widest mb-4">
        <Sparkles className="w-3.5 h-3.5" /> Resultado de {meta.label}
      </div>

      {/* Parabéns + nível */}
      <h1 className="text-4xl md:text-5xl font-black text-white uppercase tracking-tighter mb-2">
        Parabéns!
      </h1>
      <p className="text-xl text-gray-400 font-bold mb-8">
        Seu nível em {meta.label} é
      </p>

      {/* Nível gigante */}
      <div className="mb-8">
        <span className="text-7xl md:text-8xl font-black text-[#f7931e] drop-shadow-[0_0_25px_rgba(247,147,30,0.4)]">
          {levelLabel(level)}
        </span>
      </div>

      {/* Descrição do nível */}
      <p className="text-gray-400 text-base font-medium max-w-md mb-4 leading-relaxed">
        {LEVEL_DESCRIPTION[level]}
      </p>

      {/* Pontuação */}
      <div className="flex items-center gap-2 bg-[#2a2a2a] rounded-full px-5 py-2 mb-12 border border-white/5">
        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Pontuação no nível final</span>
        <span className="text-[#f7931e] font-black">{score}%</span>
      </div>

      {/* Botão voltar */}
      <button
        onClick={onBackToHub}
        className="group flex items-center gap-3 px-8 py-4 bg-[#f7931e] text-[#222222] rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-[#ffa733] transition-all"
      >
        Voltar ao nivelamento
        <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
      </button>
    </div>
  );
};

export default PlacementResultScreen;
