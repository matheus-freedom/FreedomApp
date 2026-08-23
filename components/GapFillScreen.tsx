import React, { useMemo, useRef, useState } from 'react';
import { GeneratedContent, GapItem, Level, Theme, GuideCharacter } from '../types';
import GuideReaction, { ReactionEvent } from './GuideReaction';
import { Home, Check, X, ArrowRight, Lightbulb, Languages, Sparkles, PenLine } from 'lucide-react';

// ══════════════════════════════════════════════════════════════
// EXERCÍCIO DE ESCRITA POR LACUNAS (Seasons 1 e 2)
// ──────────────────────────────────────────────────────────────
// O aluno digita a palavra que falta e a correção acontece AQUI, no
// navegador. Duas vantagens: o feedback é instantâneo (nada de
// esperar a IA) e não gasta um único token para corrigir.
//
// A comparação é tolerante de propósito — o objetivo é testar a
// estrutura gramatical, não a digitação: ignora maiúsculas, espaços
// extras, pontuação final e aceita tanto ' quanto ’ nas contrações.
// Cada frase ainda traz uma lista de respostas alternativas geradas
// junto com o exercício (ex.: "is not" e "isn't").
// ══════════════════════════════════════════════════════════════

const normalize = (s: string): string =>
  String(s || '')
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")     // apóstrofos "bonitos" viram o simples
    .replace(/[.,!?;:]+$/g, '')  // pontuação no fim não reprova ninguém
    .replace(/\s+/g, ' ')
    .trim();

const isCorrectAnswer = (typed: string, item: GapItem): boolean => {
  const t = normalize(typed);
  if (!t) return false;
  const accepted = [item.answer, ...(item.alternatives || [])].map(normalize).filter(Boolean);
  return accepted.includes(t);
};

interface GapFillScreenProps {
  content: GeneratedContent;
  level: Level;
  theme: Theme;
  topic: string;
  onFinish: (score: number, total: number) => void;
  onHome: () => void;
  guide?: GuideCharacter;
  userName?: string;
}

const GapFillScreen: React.FC<GapFillScreenProps> = ({ content, level, topic, onFinish, onHome, guide, userName }) => {
  const items = useMemo(() => content.gapItems || [], [content.gapItems]);
  const [idx, setIdx] = useState(0);
  const [typed, setTyped] = useState('');
  const [checked, setChecked] = useState(false);
  const [score, setScore] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [reaction, setReaction] = useState<ReactionEvent>(null);
  const streaks = useRef({ correct: 0, wrong: 0, seq: 0 });
  const inputRef = useRef<HTMLInputElement>(null);

  const item = items[idx];
  const isLast = idx === items.length - 1;
  const wasCorrect = checked && item ? isCorrectAnswer(typed, item) : false;

  if (!item) {
    return (
      <div className="max-w-lg mx-auto mt-20 p-8 bg-[#2a2a2a] rounded-3xl border border-white/10 text-center">
        <p className="text-gray-300 mb-6">Este exercício de escrita não pôde ser carregado.</p>
        <button onClick={onHome} className="px-8 py-4 bg-[#f7931e] text-[#222222] rounded-2xl font-black uppercase tracking-widest">Voltar</button>
      </div>
    );
  }

  const handleCheck = () => {
    if (checked || !typed.trim()) return;
    const correct = isCorrectAnswer(typed, item);
    setChecked(true);
    if (correct) setScore(s => s + 1);
    streaks.current.correct = correct ? streaks.current.correct + 1 : 0;
    streaks.current.wrong = correct ? 0 : streaks.current.wrong + 1;
    streaks.current.seq += 1;
    if (guide) {
      setReaction({
        seq: streaks.current.seq, correct,
        correctStreak: streaks.current.correct, wrongStreak: streaks.current.wrong,
        isLast, perfect: correct && score + 1 === items.length,
      });
    }
  };

  const handleNext = () => {
    if (isLast) { onFinish(score, items.length); return; }
    setIdx(i => i + 1);
    setTyped(''); setChecked(false); setShowHint(false); setShowTranslation(false);
    setTimeout(() => inputRef.current?.focus(), 60);
  };

  // Divide a frase na lacuna para desenhar o campo de digitação no
  // lugar exato do "____", em vez de jogar o input embaixo do texto.
  const [before, after] = item.sentence.split(/_{2,}/);

  return (
    <div className="w-full max-w-3xl mx-auto p-4 md:p-6 pb-40 animate-fade-in">
      {guide && <GuideReaction guide={guide} userName={userName || ''} event={reaction} />}

      <div className="flex justify-between items-start mb-8">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-[9px] md:text-[10px] font-black text-gray-500 uppercase tracking-widest bg-[#2a2a2a] px-3 py-1 rounded-lg border border-white/5">
            <span className="text-[#f7931e]">{level}</span>
            <span className="opacity-30">•</span>
            <span>Escrita</span>
            <span className="opacity-30">•</span>
            <span className="truncate max-w-[120px] md:max-w-[220px]">{topic}</span>
          </div>
          <button onClick={onHome} className="text-gray-400 hover:text-white flex items-center gap-1 text-xs mt-1 transition-colors"><Home className="w-3.5 h-3.5" /> Sair</button>
        </div>
        <div className="text-[#f7931e] font-black uppercase tracking-widest text-xs pt-1">{idx + 1} de {items.length}</div>
      </div>

      {/* Barra de progresso do exercício */}
      <div className="h-2 w-full bg-[#333333] rounded-full overflow-hidden border border-white/5 mb-8">
        <div className="h-full bg-[#f7931e] transition-all duration-500" style={{ width: `${((idx + (checked ? 1 : 0)) / items.length) * 100}%` }} />
      </div>

      <div className="bg-[#2a2a2a] rounded-[2.5rem] border border-white/5 p-6 md:p-10 shadow-xl">
        <p className="text-[10px] font-black text-[#f7931e] uppercase tracking-widest mb-6 flex items-center gap-2">
          <PenLine className="w-3.5 h-3.5" /> Complete a frase
        </p>

        <div className="text-xl md:text-2xl font-bold text-white leading-relaxed flex flex-wrap items-center gap-x-2 gap-y-4">
          <span>{before}</span>
          <input
            ref={inputRef}
            autoFocus
            value={typed}
            disabled={checked}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { checked ? handleNext() : handleCheck(); } }}
            placeholder="..."
            className={`min-w-[7rem] max-w-full px-4 py-2 rounded-xl bg-[#222222] border-2 text-center font-black outline-none transition-all ${
              !checked ? 'border-[#f7931e]/50 focus:border-[#f7931e] text-white'
                : wasCorrect ? 'border-green-500 text-green-400 bg-green-500/10'
                : 'border-red-500 text-red-400 bg-red-500/10'
            }`}
            style={{ width: `${Math.max(7, typed.length + 3)}ch` }}
          />
          <span>{after}</span>
        </div>

        {/* Ajudas: dica em PT (antes) e tradução (depois de responder) */}
        <div className="flex flex-wrap gap-2 mt-8">
          {!checked && item.hintPT && (
            <button onClick={() => setShowHint(h => !h)} className="flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-[#444444] text-gray-400 hover:text-white transition-all">
              <Lightbulb className="w-3.5 h-3.5" /> {showHint ? 'Ocultar dica' : 'Ver dica'}
            </button>
          )}
          {item.translationPT && (
            <button onClick={() => setShowTranslation(t => !t)} className="flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-[#444444] text-gray-400 hover:text-white transition-all">
              <Languages className="w-3.5 h-3.5" /> Tradução
            </button>
          )}
        </div>

        {showHint && !checked && (
          <div className="mt-4 p-4 bg-[#222222] rounded-2xl border border-[#f7931e]/20 text-[#f7931e]/90 text-sm italic animate-pop">{item.hintPT}</div>
        )}
        {showTranslation && (
          <div className="mt-4 p-4 bg-[#222222] rounded-2xl border border-white/10 text-gray-300 text-sm italic animate-pop">{item.translationPT}</div>
        )}

        {checked && (
          <div className={`mt-6 p-5 rounded-2xl border-2 animate-pop ${wasCorrect ? 'bg-green-500/10 border-green-500/40' : 'bg-red-500/10 border-red-500/40'}`}>
            <div className="flex items-center gap-3 mb-2">
              {wasCorrect ? <Check className="w-5 h-5 text-green-400" /> : <X className="w-5 h-5 text-red-400" />}
              <span className={`font-black uppercase tracking-widest text-xs ${wasCorrect ? 'text-green-400' : 'text-red-400'}`}>
                {wasCorrect ? 'Correto!' : 'Quase lá'}
              </span>
            </div>
            {!wasCorrect && (
              <p className="text-sm text-gray-300 leading-relaxed">
                A resposta é <span className="font-black text-white bg-white/10 px-2 py-0.5 rounded">{item.answer}</span>
                {item.alternatives && item.alternatives.length > 0 && (
                  <span className="text-gray-400"> (também vale: {item.alternatives.join(', ')})</span>
                )}
              </p>
            )}
            {wasCorrect && item.alternatives && item.alternatives.length > 0 && (
              <p className="text-xs text-gray-400">Outra forma correta: {item.alternatives.join(', ')}</p>
            )}
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#1a1a1a]/90 border-t border-[#333333] flex justify-center backdrop-blur z-[100]">
        {!checked ? (
          <button onClick={handleCheck} disabled={!typed.trim()}
            className={`px-12 py-4 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center gap-3 transition-all active:scale-95 ${typed.trim() ? 'bg-[#f7931e] text-[#222222] shadow-xl shadow-[#f7931e]/20' : 'bg-[#333333] text-gray-600 cursor-not-allowed'}`}>
            <Check className="w-4 h-4" /> Conferir
          </button>
        ) : (
          <button onClick={handleNext}
            className="px-12 py-4 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center gap-3 bg-[#f7931e] text-[#222222] shadow-xl shadow-[#f7931e]/20 transition-all active:scale-95">
            {isLast ? 'Finalizar Atividade' : 'Próxima Frase'}
            {isLast ? <Sparkles className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  );
};

export default GapFillScreen;
