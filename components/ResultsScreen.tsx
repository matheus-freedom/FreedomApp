
import React, { useEffect, useState } from 'react';
import { RotateCcw, Award, ThumbsUp, Frown, Trophy, Repeat, Zap, Home, Coins, Map as MapIcon, ArrowRight, PartyPopper, Loader2 } from 'lucide-react';
import { NextJourneyTarget } from '../journeys';

interface ResultsScreenProps {
  score: number;
  totalQuestions: number;
  onRetry: () => void;
  onHome: () => void;
  xpGained?: number;
  frGained?: number;
  wasRepeat?: boolean;
  // Quando o exercício veio da Journey, o botão principal volta para o
  // MAPA da trilha (e não para o menu), para o aluno emendar o próximo.
  journeyLabel?: string;
  // A continuação natural dentro da trilha (próximo exercício, próximo
  // Step, próxima Season...), calculada pelo App após salvar o resultado.
  journeyNext?: NextJourneyTarget | null;
  // Inicia o alvo acima. Devolve false quando o início foi recusado
  // (cota diária estourada abre o modal de compra) — aí o botão destrava
  // e o aluno continua nesta tela.
  onJourneyNext?: () => Promise<boolean>;
}

const formatFR = (value: number) => {
  return "FR$ " + (value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const ResultsScreen: React.FC<ResultsScreenProps> = ({ score, totalQuestions, onRetry, onHome, xpGained = 0, frGained = 0, wasRepeat = false, journeyLabel, journeyNext, onJourneyNext }) => {
  const percentage = Math.round((score / (totalQuestions || 1)) * 100);

  // Trava do botão "Próximo": evita clique duplo e mostra o spinner
  // enquanto o exercício seguinte é preparado. Se o início for recusado
  // (ex.: cota do dia estourada), destrava para o aluno decidir.
  const [startingNext, setStartingNext] = useState(false);
  const handleNext = async () => {
    if (!onJourneyNext || startingNext) return;
    setStartingNext(true);
    const started = await onJourneyNext();
    if (!started) setStartingNext(false);
  };

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

      {/* ── Continuação da trilha ──────────────────────────────────
          Mensagens de "e agora?" quando o exercício veio da Journey:
          Step fechado, Season fechada, média abaixo de 60% ou o fim
          da trilha inteira. O botão laranja logo abaixo executa a ação. */}
      {journeyNext?.type === 'step' && (
        <div className="bg-gradient-to-br from-[#f7931e]/15 to-transparent border border-[#f7931e]/40 p-6 rounded-2xl max-w-md text-center mb-8 z-10 shadow-xl animate-pop">
          <div className="flex items-center justify-center gap-2 mb-2">
            <PartyPopper className="w-6 h-6 text-[#f7931e]" />
            <p className="text-white font-black uppercase tracking-tighter text-xl">Step concluído!</p>
          </div>
          <p className="text-gray-300 text-sm leading-relaxed">Parabéns, você fechou todos os exercícios deste Step! Quer já emendar o próximo?</p>
        </div>
      )}
      {journeyNext?.type === 'season' && (
        <div className="bg-gradient-to-br from-yellow-400/15 to-transparent border border-yellow-400/40 p-6 rounded-2xl max-w-md text-center mb-8 z-10 shadow-xl animate-pop">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Trophy className="w-6 h-6 text-yellow-400" />
            <p className="text-white font-black uppercase tracking-tighter text-xl">Season concluída!</p>
          </div>
          <p className="text-gray-300 text-sm leading-relaxed">Você fechou a Season inteira — isso é um marco de verdade. A próxima já está desbloqueada. Vamos nessa?</p>
        </div>
      )}
      {journeyNext?.type === 'redo' && (
        <div className="bg-[#333333] border border-[#f7931e]/30 p-6 rounded-2xl max-w-md text-center mb-8 z-10 shadow-xl">
          <p className="text-white font-black uppercase tracking-tighter mb-2">Quase lá!</p>
          <p className="text-gray-300 text-sm leading-relaxed">
            Você completou o Step, mas a média ficou em <span className="text-white font-black">{journeyNext.pct}%</span> — precisa de <span className="text-[#f7931e] font-black">60%</span> para destravar o próximo.
            O caminho mais curto é refazer o exercício de menor nota: <span className="text-white font-black">{journeyNext.label}</span>.
          </p>
        </div>
      )}
      {journeyNext?.type === 'journey_end' && (
        <div className="bg-gradient-to-br from-yellow-400/20 to-transparent border border-yellow-400/50 p-6 rounded-2xl max-w-md text-center mb-8 z-10 shadow-xl animate-pop">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Trophy className="w-6 h-6 text-yellow-400" />
            <p className="text-white font-black uppercase tracking-tighter text-xl">Trilha concluída!</p>
          </div>
          <p className="text-gray-300 text-sm leading-relaxed">Você completou TODAS as Seasons desta jornada. Isso é para pouquíssimos alunos — parabéns! 🏆</p>
        </div>
      )}

      <div className="flex flex-col gap-4 w-full max-w-md z-10">
          {journeyNext && journeyNext.type !== 'journey_end' && onJourneyNext && (
            <button
              onClick={handleNext}
              disabled={startingNext}
              className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-[#f7931e] text-[#222222] rounded-xl font-black hover:bg-[#e08215] transition-all transform hover:scale-105 shadow-lg shadow-[#f7931e]/20 uppercase tracking-tighter text-sm disabled:opacity-60 disabled:scale-100 disabled:cursor-wait"
            >
              {startingNext ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
              {startingNext ? 'Preparando...'
                : journeyNext.type === 'exercise' ? `Próximo exercício: ${journeyNext.label}`
                : journeyNext.type === 'step' ? `Iniciar ${journeyNext.label}`
                : journeyNext.type === 'season' ? `Começar: ${journeyNext.label}`
                : `Refazer ${journeyNext.label} agora`}
            </button>
          )}
          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={onRetry}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-[#333333] text-white border border-[#444444] rounded-xl font-bold hover:bg-[#444444] hover:border-gray-500 transition-all"
            >
              <Repeat className="w-5 h-5" />
              Refazer
            </button>
            {/* Com o botão laranja de "próximo" na tela, o "Voltar à trilha"
                vira secundário (cinza) para não disputar a atenção do aluno. */}
            <button
              onClick={onHome}
              className={journeyNext && journeyNext.type !== 'journey_end'
                ? "flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-[#333333] text-white border border-[#444444] rounded-xl font-bold hover:bg-[#444444] hover:border-gray-500 transition-all uppercase tracking-tighter text-xs"
                : "flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-[#f7931e] text-[#222222] rounded-xl font-bold hover:bg-[#e08215] transition-all transform hover:scale-105 shadow-lg uppercase tracking-tighter text-xs"}
            >
              {journeyLabel ? <MapIcon className="w-5 h-5" /> : <Home className="w-5 h-5" />}
              {journeyLabel ? 'Voltar à trilha' : 'Menu principal'}
            </button>
          </div>
      </div>
    </div>
  );
};

export default ResultsScreen;
