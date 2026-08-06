import React, { useState, useEffect, useRef } from 'react';
import {
  UserSession, PlacementSkill, PlacementBankEntry, PlacementQuestion, Level,
  PLACEMENT_LEVEL_ORDER, QUESTIONS_PER_LEVEL, PLACEMENT_PASS_THRESHOLD,
} from '../types';
import { api } from '../services/api';
import { generatePlacementVariation, evaluateWritingPlacement } from '../services/geminiService';
import {
  Loader2, Brain, BookOpen, Volume2, PenTool, Home, HelpCircle,
  Sparkles, Send,
} from 'lucide-react';

interface PlacementSkillTestScreenProps {
  user: UserSession;
  skill: PlacementSkill;
  onHome: () => void;
  onComplete: (result: { level: Level; score: number; resumeFromLevel: Level }) => void;
}

const SKILL_META: Record<PlacementSkill, { label: string; icon: React.ReactNode }> = {
  [PlacementSkill.Grammar]:   { label: 'Gramática', icon: <Brain className="w-3 h-3" /> },
  [PlacementSkill.Reading]:   { label: 'Leitura',   icon: <BookOpen className="w-3 h-3" /> },
  [PlacementSkill.Writing]:   { label: 'Escrita',   icon: <PenTool className="w-3 h-3" /> },
  [PlacementSkill.Listening]: { label: 'Audição',   icon: <Volume2 className="w-3 h-3" /> },
};

// Mínimo de palavras exigido na redação do nivelamento de escrita.
const WRITING_MIN_WORDS = 40;

type Phase =
  | 'loading' | 'testing' | 'transition' | 'done' | 'error'
  | 'writing_input' | 'writing_evaluating';

const PlacementSkillTestScreen: React.FC<PlacementSkillTestScreenProps> = ({ user, skill, onHome, onComplete }) => {
  const [phase, setPhase] = useState<Phase>('loading');
  const [loadingMsg, setLoadingMsg] = useState('Preparando seu teste...');
  const [errorMsg, setErrorMsg] = useState('');

  const [bankEntry, setBankEntry] = useState<PlacementBankEntry | null>(null);

  const [startLevelIdx, setStartLevelIdx] = useState(0);
  const [levelIdx, setLevelIdx] = useState(0);
  const [qInLevel, setQInLevel] = useState(0);
  const [correctInLevel, setCorrectInLevel] = useState(0);
  const [highestPassedIdx, setHighestPassedIdx] = useState(-1);

  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);

  // Writing: texto do aluno.
  const [essayText, setEssayText] = useState('');

  const initedRef = useRef(false);

  const resolveStartLevel = (): number => {
    const results = user.gamification.placementResults || {};
    const prev = results[skill];
    const lastAny = user.gamification.lastAnyPlacementAt;
    const SIX_MONTHS = 1000 * 60 * 60 * 24 * 30 * 6;
    const resetByTime = lastAny ? (Date.now() - lastAny > SIX_MONTHS) : false;
    if (!prev || resetByTime || !prev.resumeFromLevel) return 0;
    const idx = PLACEMENT_LEVEL_ORDER.indexOf(prev.resumeFromLevel);
    return idx >= 0 ? idx : 0;
  };

  useEffect(() => {
    if (initedRef.current) return;
    initedRef.current = true;

    const init = async () => {
      try {
        setPhase('loading');

        const nextVar = await api.getNextVariationToGenerate(skill);
        if (nextVar !== null) {
          setLoadingMsg(skill === PlacementSkill.Listening
            ? 'Gerando seu teste e os áudios pela primeira vez (pode levar 1-2 minutos)...'
            : 'Gerando seu teste pela primeira vez...');
          await generatePlacementVariation(skill, nextVar, (m) => setLoadingMsg(m));
        }

        const entry = await api.getRandomPlacementVariation(skill);

        // Validação POR HABILIDADE: writing usa enunciado, as demais usam questões.
        if (skill === PlacementSkill.Writing) {
          if (!entry || !entry.writingPrompt) {
            throw new Error('Não foi possível carregar o tema da redação. Tente novamente.');
          }
          setBankEntry(entry);
          setPhase('writing_input');
          return;
        }

        if (!entry || !entry.questions || entry.questions.length === 0) {
          throw new Error('Não foi possível carregar as questões. Tente novamente.');
        }
        setBankEntry(entry);

        const start = resolveStartLevel();
        setStartLevelIdx(start);
        setLevelIdx(start);
        setHighestPassedIdx(start - 1);
        setQInLevel(0);
        setCorrectInLevel(0);
        setPhase('testing');
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : 'Erro ao carregar o teste.');
        setPhase('error');
      }
    };
    init();
  }, []);

  const getQuestionsForLevel = (idx: number): PlacementQuestion[] => {
    if (!bankEntry) return [];
    const level = PLACEMENT_LEVEL_ORDER[idx];
    return bankEntry.questions.filter(q => q.level === level).slice(0, QUESTIONS_PER_LEVEL);
  };

  const currentLevelQuestions = getQuestionsForLevel(levelIdx);
  const currentQuestion = currentLevelQuestions[qInLevel];
  const currentLevel = PLACEMENT_LEVEL_ORDER[levelIdx];

  // Áudio do nível atual (listening): um áudio compartilhado pelas 10 questões.
  const currentLevelAudioUrl: string | null =
    skill === PlacementSkill.Listening
      ? (bankEntry?.levelAudios?.[currentLevel] ?? null)
      : null;

  const finishTest = (passedThisLevel: boolean) => {
    const lastPassedIdx = passedThisLevel ? levelIdx : highestPassedIdx;
    const classifiedIdx = Math.max(0, lastPassedIdx);
    const classifiedLevel = PLACEMENT_LEVEL_ORDER[classifiedIdx];

    let resumeIdx: number;
    if (passedThisLevel) {
      resumeIdx = Math.min(levelIdx + 1, PLACEMENT_LEVEL_ORDER.length - 1);
    } else {
      resumeIdx = levelIdx;
    }
    const resumeFromLevel = PLACEMENT_LEVEL_ORDER[resumeIdx];

    const totalLastLevel = getQuestionsForLevel(levelIdx).length || 1;
    const score = Math.round((correctInLevel / totalLastLevel) * 100);

    setPhase('done');
    onComplete({ level: classifiedLevel, score, resumeFromLevel });
  };

  const handleAnswer = (idx: number | 'unknown') => {
    if (answered || !currentQuestion) return;
    const isUnknown = idx === 'unknown';
    setSelectedOption(isUnknown ? -1 : (idx as number));
    setAnswered(true);

    const correct = !isUnknown && currentQuestion.correctAnswerIndex === idx;
    const newCorrect = correct ? correctInLevel + 1 : correctInLevel;
    if (correct) setCorrectInLevel(newCorrect);

    setTimeout(() => {
      const nextQ = qInLevel + 1;
      if (nextQ < currentLevelQuestions.length) {
        setQInLevel(nextQ);
        setAnswered(false);
        setSelectedOption(null);
      } else {
        const totalInLevel = currentLevelQuestions.length || 1;
        const passed = (newCorrect / totalInLevel) >= PLACEMENT_PASS_THRESHOLD;
        const isLastLevel = levelIdx >= PLACEMENT_LEVEL_ORDER.length - 1;

        if (passed && !isLastLevel) {
          setHighestPassedIdx(levelIdx);
          setPhase('transition');
          setTimeout(() => {
            setLevelIdx(levelIdx + 1);
            setQInLevel(0);
            setCorrectInLevel(0);
            setAnswered(false);
            setSelectedOption(null);
            setPhase('testing');
          }, 1400);
        } else {
          finishTest(passed);
        }
      }
    }, 700);
  };

  // ── Writing: enviar a redação para avaliação ───────────────────
  const wordCount = essayText.trim().split(/\s+/).filter(Boolean).length;

  const handleSubmitEssay = async () => {
    if (wordCount < WRITING_MIN_WORDS || !bankEntry) return;
    try {
      setPhase('writing_evaluating');
      const result = await evaluateWritingPlacement(
        bankEntry.writingPrompt || '',
        essayText.trim()
      );
      setPhase('done');
      // Writing não tem progressão de níveis: a IA classifica direto.
      // O checkpoint aponta para o próprio nível classificado.
      onComplete({ level: result.level, score: result.score, resumeFromLevel: result.level });
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Erro ao avaliar sua redação.');
      setPhase('error');
    }
  };

  const meta = SKILL_META[skill];

  // ── Renders ────────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
        <Loader2 className="w-16 h-16 text-[#f7931e] animate-spin" />
        <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Preparando {meta.label}</h2>
        <p className="text-gray-400 max-w-sm">{loadingMsg}</p>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
        <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Ops!</h2>
        <p className="text-gray-400 max-w-sm">{errorMsg}</p>
        <button onClick={onHome} className="px-8 py-4 bg-[#f7931e] text-[#222222] rounded-2xl font-black uppercase tracking-widest">
          Voltar
        </button>
      </div>
    );
  }

  if (phase === 'transition') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6 animate-fade-in">
        <div className="inline-block p-4 bg-[#f7931e]/10 border border-[#f7931e]/40 rounded-full">
          <Sparkles className="w-12 h-12 text-[#f7931e]" />
        </div>
        <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Nível {currentLevel} concluído!</h2>
        <p className="text-gray-400 max-w-sm">Você passou. Subindo a dificuldade...</p>
      </div>
    );
  }

  if (phase === 'done' || phase === 'writing_evaluating') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
        <Loader2 className="w-12 h-12 text-[#f7931e] animate-spin" />
        <p className="text-gray-400">
          {phase === 'writing_evaluating' ? 'Avaliando sua redação...' : 'Salvando seu resultado...'}
        </p>
      </div>
    );
  }

  // ── Writing: tela de redação ───────────────────────────────────
  if (phase === 'writing_input' && bankEntry) {
    const canSubmit = wordCount >= WRITING_MIN_WORDS;
    return (
      <div className="w-full max-w-4xl mx-auto p-4 md:p-6 pb-32 animate-fade-in">
        <div className="w-full flex justify-between items-end border-b border-[#333333] pb-6 mb-8">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[#f7931e] font-black uppercase text-[10px] tracking-widest">
              {meta.icon} {meta.label}
            </div>
            <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Sua Redação</h2>
          </div>
          <button onClick={onHome} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#333333] text-gray-400 hover:text-white font-black uppercase text-[10px] tracking-widest transition-all shrink-0">
            <Home className="w-4 h-4" /> Sair
          </button>
        </div>

        {/* Enunciado (português + inglês) */}
        <div className="bg-[#2a2a2a] rounded-3xl p-6 border border-white/5 mb-6 space-y-3">
          {bankEntry.writingPromptPT && (
            <p className="text-white font-bold text-lg leading-relaxed">{bankEntry.writingPromptPT}</p>
          )}
          {bankEntry.writingPrompt && (
            <p className="text-gray-500 text-sm italic leading-relaxed">{bankEntry.writingPrompt}</p>
          )}
          <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest">
            Escreva em INGLÊS • mínimo de {WRITING_MIN_WORDS} palavras • quanto mais completo e rico o texto, melhor a avaliação
          </p>
        </div>

        {/* Área de texto */}
        <textarea
          value={essayText}
          onChange={(e) => setEssayText(e.target.value)}
          placeholder="Write your text here, in English..."
          className="w-full min-h-[280px] bg-[#222222] border border-white/10 focus:border-[#f7931e]/50 rounded-3xl p-6 text-white text-lg font-medium leading-relaxed outline-none transition-all resize-y"
        />

        {/* Contador + enviar */}
        <div className="flex items-center justify-between mt-4">
          <span className={`text-[11px] font-black uppercase tracking-widest ${canSubmit ? 'text-green-400' : 'text-gray-500'}`}>
            {wordCount} {wordCount === 1 ? 'palavra' : 'palavras'} {!canSubmit && `(mínimo ${WRITING_MIN_WORDS})`}
          </span>
          <button
            onClick={handleSubmitEssay}
            disabled={!canSubmit}
            className={`flex items-center gap-3 px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-sm transition-all ${
              canSubmit
                ? 'bg-[#f7931e] text-[#222222] hover:bg-[#ffa733]'
                : 'bg-[#333333] text-gray-600 cursor-not-allowed'
            }`}
          >
            <Send className="w-5 h-5" /> Enviar para avaliação
          </button>
        </div>
      </div>
    );
  }

  // ── Múltipla escolha (grammar / reading / listening) ───────────
  return (
    <div className="w-full max-w-4xl mx-auto p-4 md:p-6 pb-32 animate-fade-in flex flex-col items-center">
      <div className="w-full flex justify-between items-end border-b border-[#333333] pb-6 mb-8">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[#f7931e] font-black uppercase text-[10px] tracking-widest">
            {meta.icon} {meta.label} • Nível {currentLevel}
          </div>
          <h2 className="text-3xl font-black text-white uppercase tracking-tighter">
            Questão {qInLevel + 1} de {currentLevelQuestions.length}
          </h2>
        </div>
        <button
          onClick={onHome}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#333333] text-gray-400 hover:text-white font-black uppercase text-[10px] tracking-widest transition-all shrink-0"
        >
          <Home className="w-4 h-4" /> Sair
        </button>
      </div>

      <div className="w-full h-1.5 bg-[#333333] rounded-full overflow-hidden mb-8">
        <div
          className="h-full bg-[#f7931e] shadow-[0_0_8px_rgba(247,147,30,0.4)] transition-all duration-500"
          style={{ width: `${(qInLevel / (currentLevelQuestions.length || 1)) * 100}%` }}
        />
      </div>

      {/* LISTENING: player do áudio do nível (compartilhado pelas questões) */}
      {skill === PlacementSkill.Listening && (
        <div className="w-full bg-[#2a2a2a] rounded-3xl p-6 border border-white/5 mb-8">
          <div className="flex items-center gap-2 text-[#f7931e] font-black uppercase text-[10px] tracking-widest mb-4">
            <Volume2 className="w-3.5 h-3.5" /> Ouça o áudio do nível {currentLevel} e responda as questões
          </div>
          {currentLevelAudioUrl ? (
            <audio controls src={currentLevelAudioUrl} className="w-full" preload="auto">
              Seu navegador não suporta a reprodução de áudio.
            </audio>
          ) : (
            <p className="text-red-400 text-sm font-bold">
              O áudio deste nível não está disponível. Saia e tente novamente — se persistir, avise a escola.
            </p>
          )}
        </div>
      )}

      {/* READING: texto-base do nível */}
      {skill === PlacementSkill.Reading && currentQuestion?.readingText && (
        <div className="w-full bg-[#2a2a2a] rounded-3xl p-6 border border-white/5 mb-8 max-h-[300px] overflow-y-auto">
          <div className="flex items-center gap-2 text-[#f7931e] font-black uppercase text-[10px] tracking-widest mb-4">
            <BookOpen className="w-3.5 h-3.5" /> Leia o texto e responda
          </div>
          <p className="text-gray-200 text-base leading-relaxed whitespace-pre-line">{currentQuestion.readingText}</p>
        </div>
      )}

      {currentQuestion && (
        <div className="w-full space-y-6">
          <h3 className="text-2xl md:text-3xl font-black text-white leading-tight">{currentQuestion.question}</h3>
          {currentQuestion.questionPT && skill !== PlacementSkill.Grammar && (
            <p className="text-sm text-gray-500 italic font-medium">{currentQuestion.questionPT}</p>
          )}

          <div className="grid grid-cols-1 gap-3">
            {currentQuestion.options.map((opt, i) => (
              <button
                key={i}
                onClick={() => handleAnswer(i)}
                disabled={answered}
                className={`w-full p-6 rounded-3xl border-2 text-left font-bold text-lg transition-all ${
                  selectedOption === i
                    ? (i === currentQuestion.correctAnswerIndex ? 'bg-green-500/20 border-green-500 text-green-400' : 'bg-red-500/20 border-red-500 text-red-400')
                    : (answered && i === currentQuestion.correctAnswerIndex && selectedOption !== -1 ? 'bg-green-500/20 border-green-500 text-green-400' : 'bg-[#333333] border-transparent text-gray-300 hover:border-white/10')
                }`}
              >
                {opt}
              </button>
            ))}

            <button
              onClick={() => handleAnswer('unknown')}
              disabled={answered}
              className={`w-full mt-4 p-6 rounded-3xl border-4 font-black text-lg uppercase tracking-widest transition-all flex items-center justify-center gap-4 ${
                selectedOption === -1
                  ? 'bg-red-500 text-white border-red-400'
                  : 'bg-[#333333] border-transparent text-gray-500 hover:border-gray-600'
              }`}
            >
              <HelpCircle className="w-6 h-6" /> Não sei a resposta
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlacementSkillTestScreen;
