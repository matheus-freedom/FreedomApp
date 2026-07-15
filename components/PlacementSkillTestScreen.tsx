import React, { useState, useEffect, useRef } from 'react';
import {
  UserSession, PlacementSkill, PlacementBankEntry, PlacementQuestion, Level,
  PLACEMENT_LEVEL_ORDER, QUESTIONS_PER_LEVEL, PLACEMENT_PASS_THRESHOLD,
} from '../types';
import { api } from '../services/api';
import { generatePlacementVariation } from '../services/geminiService';
import {
  Loader2, Brain, BookOpen, Volume2, PenTool, Home, HelpCircle,
  Sparkles, ChevronRight,
} from 'lucide-react';

interface PlacementSkillTestScreenProps {
  user: UserSession;
  skill: PlacementSkill;
  onHome: () => void;
  // Chamado quando o teste termina, com o nível classificado, a pontuação
  // e o nível de retomada (checkpoint). A GRAVAÇÃO fica na Sub-etapa 4.3.
  onComplete: (result: { level: Level; score: number; resumeFromLevel: Level }) => void;
}

const SKILL_META: Record<PlacementSkill, { label: string; icon: React.ReactNode }> = {
  [PlacementSkill.Grammar]:   { label: 'Gramática', icon: <Brain className="w-3 h-3" /> },
  [PlacementSkill.Reading]:   { label: 'Leitura',   icon: <BookOpen className="w-3 h-3" /> },
  [PlacementSkill.Writing]:   { label: 'Escrita',   icon: <PenTool className="w-3 h-3" /> },
  [PlacementSkill.Listening]: { label: 'Audição',   icon: <Volume2 className="w-3 h-3" /> },
};

type Phase = 'loading' | 'testing' | 'transition' | 'done' | 'error';

const PlacementSkillTestScreen: React.FC<PlacementSkillTestScreenProps> = ({ user, skill, onHome, onComplete }) => {
  const [phase, setPhase] = useState<Phase>('loading');
  const [loadingMsg, setLoadingMsg] = useState('Preparando seu teste...');
  const [errorMsg, setErrorMsg] = useState('');

  // Banco de questões (as 25 da variação sorteada).
  const [bankEntry, setBankEntry] = useState<PlacementBankEntry | null>(null);

  // Onde o teste começa (checkpoint). Índice dentro de PLACEMENT_LEVEL_ORDER.
  const [startLevelIdx, setStartLevelIdx] = useState(0);
  // Nível atual sendo testado (índice em PLACEMENT_LEVEL_ORDER).
  const [levelIdx, setLevelIdx] = useState(0);
  // Índice da questão dentro do nível atual (0..4).
  const [qInLevel, setQInLevel] = useState(0);
  // Acertos no nível atual.
  const [correctInLevel, setCorrectInLevel] = useState(0);

  // O maior nível que o aluno JÁ passou (>= 80%). Começa como o nível
  // anterior ao de partida (se começa no A1, ainda não passou nada).
  const [highestPassedIdx, setHighestPassedIdx] = useState(-1);

  // Estado de resposta da questão atual.
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);

  // Evita dupla inicialização (StrictMode / re-render).
  const initedRef = useRef(false);

  // ── Determina o nível de partida a partir do checkpoint ────────
  const resolveStartLevel = (): number => {
    const results = user.gamification.placementResults || {};
    const prev = results[skill];
    const lastAny = user.gamification.lastAnyPlacementAt;
    const SIX_MONTHS = 1000 * 60 * 60 * 24 * 30 * 6;

    // Reset global de 6 meses: se o último nivelamento de QUALQUER
    // habilidade foi há mais de 6 meses, recomeça do A1.
    const resetByTime = lastAny ? (Date.now() - lastAny > SIX_MONTHS) : false;

    if (!prev || resetByTime || !prev.resumeFromLevel) return 0; // A1
    const idx = PLACEMENT_LEVEL_ORDER.indexOf(prev.resumeFromLevel);
    return idx >= 0 ? idx : 0;
  };

  // ── Inicialização: obtém o banco e define o ponto de partida ───
  useEffect(() => {
    if (initedRef.current) return;
    initedRef.current = true;

    const init = async () => {
      try {
        setPhase('loading');

        // 1. Precisa gerar uma variação nova (preenchimento gradual)?
        const nextVar = await api.getNextVariationToGenerate(skill);
        if (nextVar !== null) {
          setLoadingMsg('Gerando seu teste pela primeira vez...');
          await generatePlacementVariation(skill, nextVar, (m) => setLoadingMsg(m));
        }

        // 2. Sorteia uma variação pronta do banco.
        const entry = await api.getRandomPlacementVariation(skill);
        if (!entry || !entry.questions || entry.questions.length === 0) {
          throw new Error('Não foi possível carregar as questões. Tente novamente.');
        }
        setBankEntry(entry);

        // 3. Define o ponto de partida (checkpoint).
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

  // ── Questões do nível atual (bloco de 5) ───────────────────────
  const getQuestionsForLevel = (idx: number): PlacementQuestion[] => {
    if (!bankEntry) return [];
    const level = PLACEMENT_LEVEL_ORDER[idx];
    return bankEntry.questions.filter(q => q.level === level).slice(0, QUESTIONS_PER_LEVEL);
  };

  const currentLevelQuestions = getQuestionsForLevel(levelIdx);
  const currentQuestion = currentLevelQuestions[qInLevel];

  // ── Classifica o nível final ao encerrar o teste ───────────────
  // O nível classificado é o maior nível que o aluno passou (>=80%).
  // Se não passou nenhum (travou já no primeiro), fica A1 (iniciante).
  const finishTest = (passedThisLevel: boolean) => {
    const lastPassedIdx = passedThisLevel ? levelIdx : highestPassedIdx;
    const classifiedIdx = Math.max(0, lastPassedIdx); // nunca abaixo de A1
    const classifiedLevel = PLACEMENT_LEVEL_ORDER[classifiedIdx];

    // Checkpoint de retomada: o nível onde travou (o atual, se não passou;
    // ou o próximo, se passou o último). Nunca abaixo de A1.
    let resumeIdx: number;
    if (passedThisLevel) {
      // passou o nível atual → retoma do próximo (se houver) ou do próprio C1
      resumeIdx = Math.min(levelIdx + 1, PLACEMENT_LEVEL_ORDER.length - 1);
    } else {
      // travou no nível atual → retoma dele mesmo
      resumeIdx = levelIdx;
    }
    const resumeFromLevel = PLACEMENT_LEVEL_ORDER[resumeIdx];

    // Pontuação: % de acerto do último nível tentado (0-100), sobre o
    // número REAL de questões daquele nível (resiliente a blocos parciais).
    const totalLastLevel = getQuestionsForLevel(levelIdx).length || 1;
    const score = Math.round((correctInLevel / totalLastLevel) * 100);

    setPhase('done');
    onComplete({ level: classifiedLevel, score, resumeFromLevel });
  };

  // ── Responde uma questão ───────────────────────────────────────
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
        // Próxima questão do mesmo nível.
        setQInLevel(nextQ);
        setAnswered(false);
        setSelectedOption(null);
      } else {
        // Fim do bloco — avalia a trava de 80% sobre o número REAL
        // de questões que existem neste nível (não a constante fixa),
        // para ser resiliente a blocos que vieram com menos questões.
        const totalInLevel = currentLevelQuestions.length || 1;
        const passed = (newCorrect / totalInLevel) >= PLACEMENT_PASS_THRESHOLD;
        const isLastLevel = levelIdx >= PLACEMENT_LEVEL_ORDER.length - 1;

        if (passed && !isLastLevel) {
          // Avança para o próximo nível.
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
          // Travou (não passou) ou passou o último nível (C1): encerra.
          finishTest(passed);
        }
      }
    }, 700);
  };

  const meta = SKILL_META[skill];
  const currentLevel = PLACEMENT_LEVEL_ORDER[levelIdx];

  // ── Renderização por fase ──────────────────────────────────────

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

  if (phase === 'done') {
    // A tela de resultado detalhada vem na 4.3; aqui só um estado neutro
    // enquanto o onComplete processa a navegação.
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
        <Loader2 className="w-12 h-12 text-[#f7931e] animate-spin" />
        <p className="text-gray-400">Salvando seu resultado...</p>
      </div>
    );
  }

  // phase === 'testing'
  return (
    <div className="w-full max-w-4xl mx-auto p-4 md:p-6 pb-32 animate-fade-in flex flex-col items-center">
      {/* Cabeçalho */}
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

      {/* Barra de progresso do bloco de 5 */}
      <div className="w-full h-1.5 bg-[#333333] rounded-full overflow-hidden mb-10">
        <div
          className="h-full bg-[#f7931e] shadow-[0_0_8px_rgba(247,147,30,0.4)] transition-all duration-500"
          style={{ width: `${(qInLevel / (currentLevelQuestions.length || 1)) * 100}%` }}
        />
      </div>

      {/* Questão de múltipla escolha (grammar) */}
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
