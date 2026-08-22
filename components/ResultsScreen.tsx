
import React, { useEffect } from 'react';
import { RotateCcw, Award, ThumbsUp, Frown, Trophy, Repeat, Zap, Home, Coins } from 'lucide-react';

interface ResultsScreenProps {
  score: number;
  totalQuestions: number;
  onRetry: () => void;
  onHome: () => void;
  xpGained?: number;
  frGained?: number;
  wasRepeat?: boolean;
}

const formatFR = (value: number) => {
  return "FR$ " + (value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const ResultsScreen: React.FC<ResultsScreenProps> = ({ score, totalQuestions, onRetry, onHome, xpGained = 0, frGained = 0, wasRepeat = false }) => {
  const percentage = Math.round((score / (totalQuestions || 1)) * 100);

  let resultType: 'gold' | 'silver' | 'bronze' | 'sad';
  let icon;
  let message;
  let colorClass;

  if (percentage >= 91) {
      resultType = 'gold';
      icon = <Trophy className="w-24 h-24 text-yellow-400 drop-shadow-[0_0_15px_rgba(250,204,21,0.5)]" />;
      message = "Incrível! Você dominou este tópico. Continue assim para alcançar a fluência!";
      colorClass = "text-yellow-400";
  } else if (percentage >= 70) {
      resultType = 'silver';
      icon = <Award className="w-24 h-24 text-[#f7931e] drop-shadow-[0_0_15px_rgba(247,147,30,0.5)]" />;
      message = "Muito bem! Você tem um ótimo conhecimento. Continue praticando para chegar à perfeição.";
      colorClass = "text-[#f7931e]";
  } else if (percentage >= 50) {
      resultType = 'bronze';
      icon = <ThumbsUp className="w-24 h-24 text-blue-400" />;
      message = "Bom esforço! Você está no caminho certo, mas um pouco mais de revisão fará toda a diferença.";
      colorClass = "text-blue-400";
  } else {
      resultType = 'sad';
      icon = <Frown className="w-24 h-24 text-gray-500" />;
      message = "Não desanime! Aprender uma língua exige persistência. Revise o material e tente novamente, você consegue!";
      colorClass = "text-gray-500";
  }

  useEffect(() => {
    const playResultSound = (type: 'gold' | 'silver' | 'bronze' | 'sad') => {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
    
        if (type === 'gold') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(523.25, now);
            osc.frequency.setValueAtTime(659.25, now + 0.1);
            osc.frequency.setValueAtTime(783.99, now + 0.2);
            osc.frequency.setValueAtTime(1046.50, now + 0.3);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
            osc.start(now);
            osc.stop(now + 1.5);
        } else if (type === 'silver') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.linearRampToValueAtTime(880, now + 0.1);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
            osc.start(now);
            osc.stop(now + 0.5);
        } else if (type === 'bronze') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(440, now);
            gain.gain.setValueAtTime(0.05, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
            osc.start(now);
            osc.stop(now + 0.3);
        } else {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(300, now);
            osc.frequency.linearRampToValueAtTime(150, now + 1);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.linearRampToValueAtTime(0, now + 1);
            osc.start(now);
            osc.stop(now + 1);
        }
    };

    playResultSound(resultType);
  }, [resultType]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fade-in p-6 relative overflow-hidden rounded-3xl">
      
      <div className="relative mb-6 z-10 animate-pop">
          {icon}
      </div>
      
      <h2 className={`text-5xl font-black mb-2 z-10 ${colorClass}`}>{percentage}%</h2>
      <p className="text-gray-400 mb-6 text-lg z-10 font-mono">
        Score: {score} / {totalQuestions}
      </p>

      <div className="flex flex-wrap justify-center gap-4 mb-8">
        {xpGained > 0 && (
          <div className="flex items-center gap-3 bg-[#333333] text-white border border-white/5 px-6 py-3 rounded-2xl font-black text-xl animate-pop shadow-xl">
            <Zap className="w-6 h-6 text-[#f7931e] fill-current" />
            + {xpGained.toLocaleString()} XP
          </div>
        )}

        {frGained > 0 && (
          <div className="flex items-center gap-3 bg-[#f7931e] text-[#222222] px-6 py-3 rounded-2xl font-black text-xl animate-pop shadow-xl shadow-[#f7931e]/20">
            <Coins className="w-6 h-6 fill-current" />
            + {formatFR(frGained)}
          </div>
        )}
      </div>

      {wasRepeat && (
        <div className="flex items-start gap-3 bg-[#333333] text-gray-300 border border-[#444444] px-5 py-3 rounded-2xl max-w-md mb-8 z-10">
          <RotateCcw className="w-5 h-5 text-[#f7931e] shrink-0 mt-0.5" />
          <p className="text-sm leading-relaxed text-left">
            Você já tinha feito esta atividade, então ela não vale XP desta vez — cada atividade só dá XP na <span className="font-bold text-white">primeira vez</span>. Refazer é ótimo para revisar! Para ganhar XP, escolha uma atividade nova.
          </p>
        </div>
      )}

      <div className="bg-[#333333] p-6 rounded-2xl border border-[#444444] max-w-md text-center mb-8 z-10 shadow-xl">
          <p className="text-white text-lg font-medium leading-relaxed">
              "{message}"
          </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md z-10">
          <button
            onClick={onRetry}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-[#333333] text-white border border-[#444444] rounded-xl font-bold hover:bg-[#444444] hover:border-gray-500 transition-all"
          >
            <Repeat className="w-5 h-5" />
            Refazer
          </button>
          <button
            onClick={onHome}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-[#f7931e] text-[#222222] rounded-xl font-bold hover:bg-[#e08215] transition-all transform hover:scale-105 shadow-lg uppercase tracking-tighter text-xs"
          >
            <Home className="w-5 h-5" />
            Menu principal
          </button>
      </div>
    </div>
  );
};

export default ResultsScreen;
