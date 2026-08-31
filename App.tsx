import React, { useState, useEffect, useCallback, useRef } from 'react';
import Header from './components/Header';
import SelectionScreen from './components/SelectionScreen';
import QuizScreen from './components/QuizScreen';
import WritingScreen from './components/WritingScreen';
import ResultsScreen from './components/ResultsScreen';
import LoginScreen from './components/LoginScreen';
import KeywordScreen from './components/KeywordScreen';
import StudyPlanSetup from './components/StudyPlanSetup';
import DashboardScreen from './components/DashboardScreen';
import GuideSelectionScreen from './components/GuideSelectionScreen';
import GuideChat from './components/GuideChat';
import PlacementTestScreen from './components/PlacementTestScreen';
import PlacementHubScreen from './components/PlacementHubScreen';
import PlacementSkillTestScreen from './components/PlacementSkillTestScreen';
import PlacementResultScreen from './components/PlacementResultScreen';
import MyActivitiesScreen from './components/MyActivitiesScreen';
import ProfileScreen from './components/ProfileScreen';
import AdminPanel from './components/AdminPanel';
import ChallengesScreen from './components/ChallengesScreen';
import ChatScreen from './components/ChatScreen';
import RankingHistoryScreen from './components/RankingHistoryScreen';
import JourneyScreen from './components/JourneyScreen';
import GapFillScreen from './components/GapFillScreen';
import { AppState, Level, Theme, VoiceGender, VoiceAccent, StudyPlan, ActivityRecord, UserSession, GeneratedContent, UserTier, UserChallenge, AccessType } from './types';
import { JourneyId, JourneyKind, JourneyNode, KIND_META, SEASONS, NextJourneyTarget, buildSeasonNodes, getNextJourneyTarget, seasonsSkippedByPlacement } from './journeys';
import { generateQuizContent } from './services/geminiService';
import { api } from './services/api';
import { Loader2, Star, Sword, PartyPopper, Sparkles, AlertTriangle, Zap, Coins } from 'lucide-react';
import { ToastHost, showToast } from './components/Toast';
import { DAILY_LIMIT, EXTRA_DAILY_COST, getDailyUsage, getDailyAllowance } from './dailyLimit';

// Quantas versões diferentes de cada tópico o banco acumula antes de
// passar a reaproveitar em vez de gerar. Mais versões = menos repetição
// de texto e de personagem para o aluno; o custo é gerar algumas vezes
// a mais no começo da vida de cada tópico.
const ACTIVITY_VARIATIONS = 3;
const INACTIVITY_LIMIT = 15 * 60 * 1000;

// ── PALAVRA-CHAVE: validade em dias ───────────────────────────
// O aluno valida a palavra-chave uma vez e não precisa digitar de
// novo até passarem KEYWORD_VALIDITY_DAYS dias. A data fica gravada
// no localStorage do navegador (não no Firestore).
const KEYWORD_VALIDITY_DAYS = 30;

// Verifica se o usuário PRECISA ver a tela de palavra-chave.
// Retorna true se precisa mostrar, false se pode pular.
const needsKeywordCheck = (userId: string): boolean => {
  const lastCheck = localStorage.getItem(`keyword_validated_${userId}`);
  if (!lastCheck) return true;                 // nunca validou → mostra
  const lastDate = parseInt(lastCheck, 10);
  if (isNaN(lastDate)) return true;            // dado corrompido → mostra por segurança
  const daysSince = (Date.now() - lastDate) / (1000 * 60 * 60 * 24);
  return daysSince >= KEYWORD_VALIDITY_DAYS;   // passou da validade → mostra de novo
};

// Recupera o accessType salvo na última validação (para quem pula a tela).
// Se não houver nada salvo, retorna FULL como padrão seguro.
const getStoredAccessType = (userId: string): AccessType => {
  const stored = localStorage.getItem(`keyword_access_${userId}`);
  if (stored === AccessType.CHALLENGE_ONLY) return AccessType.CHALLENGE_ONLY;
  return AccessType.FULL;
};

// Decide o status pós-login de um usuário comum (não-admin),
// levando em conta se a palavra-chave ainda é necessária.
const resolvePostLoginStatus = (user: UserSession): AppState['status'] => {
  if (user.username === 'admin' || user.isAdmin) {
    return user.guide ? 'selection' : 'guide_selection';
  }
  if (needsKeywordCheck(user.userId)) {
    return 'keyword_check';
  }
  // Já validado dentro da validade → segue o destino normal pós-validação
  return user.guide ? 'selection' : 'guide_selection';
};

const TIER_THRESHOLDS = [
  { tier: UserTier.Starter, min: 0, max: 5000 },
  { tier: UserTier.Warrior, min: 5001, max: 15000 },
  { tier: UserTier.Genius, min: 15001, max: 35000 },
  { tier: UserTier.Pro, min: 35001, max: 60000 },
  { tier: UserTier.Legend, min: 60001, max: Infinity },
];

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    status: 'loading',
    user: null,
    level: null,
    theme: null,
    subTopic: null,
    content: null,
    currentQuestionIndex: 0,
    score: 0,
    studyPlan: null,
    activityHistory: []
  });

  const [showDailyLimitModal, setShowDailyLimitModal] = useState(false);
  // Modal do pacote extra de exercícios (+8 por FR$10) e trava da compra.
  const [showExtraModal, setShowExtraModal] = useState(false);
  const [buyingExtra, setBuyingExtra] = useState(false);
  const [pendingChallenge, setPendingChallenge] = useState<UserChallenge | null>(null);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Muda a cada exercício de trilha concluído: é o sinal para a
  // JourneyScreen reler o progresso no servidor ao voltar do exercício.
  const [journeyReload, setJourneyReload] = useState(0);
  // O "e agora?" calculado ao terminar um exercício da trilha: é o
  // que a tela de resultados usa para oferecer "Próximo exercício",
  // "Iniciar próximo Step" etc. sem obrigar a volta ao mapa.
  const [journeyNext, setJourneyNext] = useState<NextJourneyTarget | null>(null);

  // ── TRAVA ANTI-CLIQUE-DUPLO ───────────────────────────────────
  // useRef é síncrono: bloqueia instantaneamente, antes mesmo do
  // React re-renderizar a tela. Diferente do useState, que agenda
  // a atualização e deixa uma janela de tempo para cliques extras.
  const isStartingRef = useRef(false);

  const handleLogout = useCallback(async () => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    // Libera a trava de início: o logout não recarrega a página, então
    // uma trava esquecida aqui deixaria o botão "Iniciar Prática"
    // permanentemente morto para o próximo login na mesma aba.
    isStartingRef.current = false;
    localStorage.removeItem('freedom_postgres_session');
    await api.logout();
    setState(p => ({ ...p, user: null, status: 'login', studyPlan: null, activityHistory: [] }));
  }, []);

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    if (state.user) {
      inactivityTimerRef.current = setTimeout(() => {
        showToast("Sessão expirada por inatividade. Faça login de novo.", 'info', 7000);
        handleLogout();
      }, INACTIVITY_LIMIT);
    }
  }, [state.user, handleLogout]);

  useEffect(() => {
    const unsubscribe = api.subscribeToAuthChanges(async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userProfile = await api.getUserProfile(firebaseUser.uid);
          if (userProfile) {
            const [plan, history, challenges] = await Promise.all([
              api.getPlan(userProfile.userId),
              api.getHistory(userProfile.userId),
              api.getChallenges()
            ]);
            const invite = challenges.find(c => c.status === 'active' && (c.pendingInvites || []).includes(userProfile.userId));
            if (invite) setPendingChallenge(invite);

            // Se vai pular a palavra-chave, recupera o accessType salvo
            // para não deixar a permissão indefinida.
            const willSkipKeyword = !(userProfile.username === 'admin' || userProfile.isAdmin) && !needsKeywordCheck(userProfile.userId);
            const recoveredUser = willSkipKeyword
              ? { ...userProfile, accessType: getStoredAccessType(userProfile.userId) }
              : userProfile;

            setState(prev => ({
              ...prev, user: recoveredUser, studyPlan: plan, activityHistory: history,
              status: resolvePostLoginStatus(userProfile)
            }));
          } else { setState(prev => ({ ...prev, status: 'login' })); }
        } catch (e) { setState(prev => ({ ...prev, status: 'login' })); }
      } else {
        const savedSession = localStorage.getItem('freedom_postgres_session');
        if (savedSession) {
           const storedUser = JSON.parse(savedSession);
           if (storedUser.username === 'admin') {
             const admin = await api.login('admin', 'f1');
             if (admin) {
                const [plan, history] = await Promise.all([api.getPlan(admin.userId), api.getHistory(admin.userId)]);
                setState(prev => ({ ...prev, user: admin, studyPlan: plan, activityHistory: history, status: 'selection' }));
                return;
             }
           }
        }
        setState(prev => ({ ...prev, status: 'login' }));
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (state.user) {
      window.addEventListener('mousemove', resetInactivityTimer);
      window.addEventListener('mousedown', resetInactivityTimer);
      window.addEventListener('keydown', resetInactivityTimer);
      window.addEventListener('touchstart', resetInactivityTimer);
      resetInactivityTimer();
    }
    return () => {
      window.removeEventListener('mousemove', resetInactivityTimer);
      window.removeEventListener('mousedown', resetInactivityTimer);
      window.removeEventListener('keydown', resetInactivityTimer);
      window.removeEventListener('touchstart', resetInactivityTimer);
    };
  }, [state.user, resetInactivityTimer]);

  const handleHome = useCallback(() => {
    if (state.user) {
      // Libera a trava ao voltar para a tela inicial
      isStartingRef.current = false;
      setState(prev => ({ ...prev, status: 'selection', content: null, level: null, theme: null, subTopic: null, newTierReached: null, journeyContext: null }));
    }
  }, [state.user]);

  // ── Sair de um exercício ──────────────────────────────────────
  // Se o exercício veio da trilha, o destino natural é o MAPA da
  // trilha (com o progresso recarregado), não o menu principal —
  // devolver o aluno ao início a cada exercício quebraria o ritmo
  // que a Journey existe para criar.
  const handleExitActivity = useCallback(() => {
    isStartingRef.current = false;
    if (state.journeyContext) {
      setJourneyReload(n => n + 1);
      setState(prev => ({ ...prev, status: 'journey', content: null, journeyContext: null, newTierReached: null }));
    } else {
      handleHome();
    }
  }, [state.journeyContext, handleHome]);

  // Devolve TRUE quando o exercício realmente começou a ser preparado e
  // FALSE quando o pedido foi ignorado (trava, limite diário, sem aluno).
  // Quem chamou usa isso para destravar o próprio botão — sem esse
  // retorno, um pedido recusado deixaria a tela presa em "Gerando...".
  const handleStart = async (level: Level, theme: Theme, subTopic: string, voiceGender: VoiceGender = 'Female', voiceAccent: VoiceAccent = 'American'): Promise<boolean> => {
    if (!state.user) return false;

    // ── VERIFICAÇÃO DA TRAVA ──────────────────────────────────────
    // Se já está processando um clique anterior, ignora completamente.
    // isStartingRef.current é lido e escrito de forma síncrona,
    // então não existe janela de tempo para um segundo clique passar.
    if (isStartingRef.current) return false;
    isStartingRef.current = true;

    const today = new Date().toISOString().split('T')[0];
    const dailyCount = getDailyUsage(state.user.gamification);
    if (!state.user.gamification.isPro && dailyCount >= getDailyAllowance(state.user.gamification)) {
      // Em vez do popup do navegador: oferece o pacote extra de exercícios.
      setShowExtraModal(true);
      isStartingRef.current = false;
      return false;
    }

    setState(prev => ({ ...prev, status: 'loading', level, theme, subTopic, errorMessage: undefined, journeyContext: null, loadingMessage: undefined }));
    try {
      // Só reaproveita do banco quando o tópico já tem ACTIVITY_VARIATIONS
      // versões diferentes. Até lá, gera uma nova a cada vez, para o
      // banco acumular variedade de textos e personagens.
      const cached = await api.getRandomActivityFromBank(level, theme, subTopic, ACTIVITY_VARIATIONS);
      let content: GeneratedContent;

      if (cached) {
        content = cached.content;
      } else {
        content = await generateQuizContent(level, theme, subTopic, voiceGender, voiceAccent);
        await api.saveToActivityBank(level, theme, subTopic, content);
      }

      // ── CONTAGEM DO EXERCÍCIO ────────────────────────────────────
      // Conta AQUI, uma única vez, e só depois que o exercício ficou
      // pronto. Antes a soma acontecia na SelectionScreen, no clique,
      // fora desta trava — por isso cada clique repetido durante o
      // delay da IA virava um exercício a mais na cota do aluno.
      // Se a geração falhar (catch abaixo), nada é contado.
      const newCount = await api.incrementActivityCount(state.user.userId);

      // A atualização parte de prev.user (e não do state.user capturado
      // no clique). A geração leva dezenas de segundos; nesse intervalo
      // outra parte do app pode ter mexido no perfil, e usar a cópia
      // antiga desfaria essa mudança.
      const applyCount = (prev: AppState): UserSession | null => prev.user && ({
        ...prev.user,
        gamification: { ...prev.user.gamification, dailyActivitiesCount: newCount, lastActivityDate: today },
      });

      // Trava liberada aqui: a janela do clique repetido terminou (o
      // exercício está na tela). Manter travado impediria o aluno de
      // iniciar outra atividade pelo guia Fred/Frida sem voltar ao início.
      isStartingRef.current = false;

      if (theme === Theme.Writing) setState(prev => ({ ...prev, user: applyCount(prev), status: 'writing', content, score: 0 }));
      else setState(prev => ({ ...prev, user: applyCount(prev), status: 'quiz', content, score: 0, currentQuestionIndex: 0 }));
      return true;
    } catch (error) {
      // Em caso de erro, libera a trava para o usuário poder tentar de novo
      isStartingRef.current = false;
      setState(prev => ({ ...prev, status: 'error', errorMessage: error instanceof Error ? error.message : "Erro ao carregar atividade." }));
      return false;
    }
  };

  // ── Início de um exercício da JOURNEY TO FLUENCY ──────────────
  // Diferente do handleStart (prática livre), aqui o aluno não
  // escolhe nível/tema/tópico: eles vêm da posição na trilha. O
  // conteúdo é pedido à function journey-content, que devolve do
  // banco compartilhado quando já existe — só o primeiro aluno a
  // chegar em cada exercício gasta crédito de IA.
  const handleStartJourney = async (journeyId: JourneyId, season: number, node: JourneyNode, kind: JourneyKind): Promise<boolean> => {
    if (!state.user) return false;
    if (isStartingRef.current) return false;
    isStartingRef.current = true;

    const today = new Date().toISOString().split('T')[0];
    const dailyCount = getDailyUsage(state.user.gamification);
    if (!state.user.gamification.isPro && dailyCount >= getDailyAllowance(state.user.gamification)) {
      // Em vez do popup do navegador: oferece o pacote extra de exercícios.
      setShowExtraModal(true);
      isStartingRef.current = false;
      return false;
    }

    const level = SEASONS[season].level;
    const theme = KIND_META[kind].theme;
    // O "tópico" que aparece na tela e no histórico: vocabulário usa o
    // tema de vocabulário; os demais usam o tópico gramatical do Step.
    const subTopic = kind === 'vocabulary' ? node.vocabTheme : node.grammarTopic;

    setState(prev => ({
      ...prev, status: 'loading', level, theme, subTopic, errorMessage: undefined,
      journeyContext: { journeyId, season, node: node.index, kind },
      loadingMessage: 'Preparando seu exercício...',
    }));

    try {
      const { content } = await api.getJourneyExercise(journeyId, season, node.index, kind);
      const newCount = await api.incrementActivityCount(state.user.userId);
      const applyCount = (prev: AppState): UserSession | null => prev.user && ({
        ...prev.user,
        gamification: { ...prev.user.gamification, dailyActivitiesCount: newCount, lastActivityDate: today },
      });

      isStartingRef.current = false;

      // Escrita das Seasons 1 e 2 vem como lacunas (gapItems) e usa a
      // tela própria; das Seasons 3+ é texto livre na tela de escrita.
      const nextStatus: AppState['status'] =
        kind === 'writing' ? (content.gapItems?.length ? 'gapfill' : 'writing') : 'quiz';

      setState(prev => ({
        ...prev, user: applyCount(prev), status: nextStatus, content,
        score: 0, currentQuestionIndex: 0, loadingMessage: undefined,
      }));
      return true;
    } catch (error) {
      isStartingRef.current = false;
      setState(prev => ({
        ...prev, status: 'error', loadingMessage: undefined,
        errorMessage: error instanceof Error ? error.message : 'Não consegui preparar este exercício. Tente novamente.',
      }));
      return false;
    }
  };

  const handleFinish = async (finalScore: number, total: number) => {
    if (!state.user) return;
    setState(prev => ({ ...prev, status: 'loading' }));
    try {
      // O servidor calcula o XP, aplica "só na 1ª vez" e o teto diário,
      // e grava histórico + gamificação. Repetir a mesma atividade
      // (Refazer ou pela aba Histórico) volta com xpGained = 0.
      const { totalXp, xpGained, frGained, totalFr, isRepeat, journeyProgressSaved } = await api.completeActivity({
        level: state.level!,
        theme: state.theme!,
        topic: state.subTopic!,
        // Escrita por lacunas é corrigida no navegador e chega aqui com
        // acertos/total, igual a um quiz — por isso vai como 'quiz'.
        type: state.theme === Theme.Writing && !state.content?.gapItems?.length ? 'writing' : 'quiz',
        score: finalScore,
        total,
        // Quando o exercício veio da trilha, o servidor também grava o
        // progresso do Step (melhor nota e estrelas).
        journey: state.journeyContext || undefined,
      });
      let nextTarget: NextJourneyTarget | null = null;
      if (state.journeyContext) {
        setJourneyReload(n => n + 1);
        // O XP entrou, mas o progresso do Step não foi gravado. Se
        // ficarmos calados, o aluno volta ao mapa, vê o exercício ainda
        // "não iniciado" e refaz — gastando um exercício da cota dele
        // à toa. Melhor avisar na hora.
        if (journeyProgressSaved === false) {
          showToast('Seu XP foi registrado, mas não consegui salvar o progresso deste exercício na trilha. Se ele continuar como não feito, refaça-o (o XP já está garantido).', 'error', 10000);
        } else {
          // Relê o progresso (já com este exercício gravado pelo
          // servidor) e calcula a continuação natural para a tela de
          // resultados oferecer. Se a leitura falhar, nada quebra: a
          // tela apenas mostra os botões de sempre.
          try {
            const progressDoc = await api.getJourneyProgress(state.user.userId);
            const skipped = seasonsSkippedByPlacement(state.user.gamification.placementResults as any, state.user.gamification.lastPlacementLevel);
            nextTarget = getNextJourneyTarget(state.journeyContext.journeyId, state.journeyContext.season, state.journeyContext.node, progressDoc, skipped);
          } catch { /* segue sem sugestão */ }
        }
      }
      setJourneyNext(nextTarget);

      const calculateTier = (xp: number) => TIER_THRESHOLDS.find(t => xp >= t.min && xp <= t.max)?.tier || UserTier.Starter;
      const prevTier = calculateTier(state.user.gamification.xp);
      const newTier = calculateTier(totalXp);
      const leveledUp = newTier !== prevTier;

      const updatedHistory = await api.getHistory(state.user.userId);
      const today = new Date().toISOString().split('T')[0];
      const newDailyXp = (state.user.gamification.lastXpGainDate === today ? state.user.gamification.dailyXpEarned : 0) + xpGained;

      const updatedUser = {
        ...state.user,
        gamification: {
          ...state.user.gamification,
          xp: totalXp,
          frBalance: totalFr,
          dailyXpEarned: newDailyXp,
          lastXpGainDate: today
        }
      };

      setState(prev => ({
        ...prev, status: leveledUp ? 'level_up' : 'results', score: finalScore, activityHistory: updatedHistory,
        user: updatedUser, lastXpGained: xpGained, lastFrGained: frGained, newTierReached: leveledUp ? newTier : null,
        lastWasRepeat: isRepeat
      }));

      // A contagem já foi somada quando o exercício abriu, então NÃO se
      // soma 1 de novo aqui: com o "+1" o modal de meta concluída
      // aparecia já no 7º de 8 exercícios, mandando o aluno embora com
      // um exercício ainda disponível.
      if (!state.user.gamification.isPro && state.user.gamification.dailyActivitiesCount >= getDailyAllowance(state.user.gamification)) setShowDailyLimitModal(true);
    } catch (error) {
      // Falha de rede/servidor: mostra erro em vez de travar no "Loading".
      setState(prev => ({ ...prev, status: 'error', errorMessage: error instanceof Error ? error.message : 'Não consegui registrar sua atividade. Tente novamente.' }));
    }
  };

  // ── Botão "Próximo exercício" da tela de resultados ───────────
  // Reconstrói o nó da trilha a partir do alvo calculado e reaproveita
  // o handleStartJourney inteiro — trava de clique duplo, cota diária
  // (abre o modal do pacote extra se estourou) e banco compartilhado.
  // Devolve false quando o início foi recusado, para o botão destravar.
  const handleJourneyNext = async (): Promise<boolean> => {
    const target = journeyNext;
    const ctx = state.journeyContext;
    if (!target || !ctx || target.type === 'journey_end') return false;
    const node = buildSeasonNodes(ctx.journeyId, target.season)[target.nodeIndex];
    if (!node) return false;
    return handleStartJourney(ctx.journeyId, target.season, node, target.kind);
  };

  const handlePlacementFinish = async (level: Level) => {
    if (!state.user) return;
    const updatedUser = await api.savePlacementResult(state.user.userId, level);
    setState(p => ({ ...p, user: updatedUser, status: 'selection' }));
  };

  const handleUserUpdate = (updatedUser: UserSession) => { setState(p => ({ ...p, user: updatedUser })); };

  // ── Compra do pacote extra de exercícios (+8 hoje, FR$10) ─────
  // A transação na API é atômica: ou desconta e credita, ou não faz
  // nada (saldo insuficiente vira uma mensagem amigável no toast).
  const handleBuyExtraDaily = async () => {
    if (!state.user || buyingExtra) return;
    setBuyingExtra(true);
    try {
      const { user } = await api.purchaseExtraDaily(state.user.userId);
      setState(p => p.user ? ({ ...p, user: { ...p.user, gamification: user.gamification } }) : p);
      setShowExtraModal(false);
      setShowDailyLimitModal(false);
      showToast('Pacote comprado! Você ganhou +8 exercícios para hoje. 🎉', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Não consegui concluir a compra. Tente novamente.', 'error', 7000);
    }
    setBuyingExtra(false);
  };

  // Rótulo "Season 1 · Step 3 · Gramática" mostrado durante o
  // exercício e no resultado, para o aluno nunca perder a noção de
  // onde está dentro da trilha.
  const journeyLabel = state.journeyContext
    ? `${SEASONS[state.journeyContext.season].title} · ${KIND_META[state.journeyContext.kind].label}`
    : undefined;

  return (
    <div className="min-h-screen bg-[#222222] text-white font-sans selection:bg-[#f7931e] selection:text-[#222222]">
      <ToastHost />
      {state.status !== 'admin_panel' && (
        <Header onLogout={handleLogout} onHome={handleHome} onOpenChat={(userId) => setState(p => ({ ...p, status: 'chat', activeChatUserId: userId }))} user={state.user} />
      )}
      {showDailyLimitModal && (
        <div className="fixed inset-0 z-[500] bg-[#222222]/95 backdrop-blur-2xl flex flex-col items-center justify-center p-8 text-center animate-fade-in">
            <div className="relative mb-8"><Star className="w-24 h-24 text-yellow-400 animate-pulse" /><PartyPopper className="absolute -top-4 -right-4 w-12 h-12 text-[#f7931e] animate-bounce" /></div>
            <h2 className="text-4xl md:text-5xl font-black text-white uppercase tracking-tighter mb-4 animate-pop">Meta do Dia Concluída!</h2>
            <p className="text-gray-300 max-w-lg text-lg md:text-xl font-medium leading-relaxed animate-fade-in delay-200">Parabéns! Você atingiu o máximo de atividades por hoje. <br/><span className="text-[#f7931e] font-black">Isso mostra o quanto você está focado!</span></p>
            <button onClick={() => { setShowDailyLimitModal(false); handleHome(); }} className="mt-12 px-12 py-5 bg-[#f7931e] text-[#222222] rounded-2xl font-black text-xl hover:scale-110 transition-all uppercase tracking-widest shadow-2xl shadow-[#f7931e]/30">Sensacional!</button>
            <button onClick={() => { setShowDailyLimitModal(false); setShowExtraModal(true); }} className="mt-4 px-8 py-4 bg-[#333333] text-white rounded-2xl font-black text-sm hover:bg-[#3d3d3d] hover:scale-105 transition-all uppercase tracking-widest border border-[#f7931e]/30 flex items-center gap-2">
              <Zap className="w-4 h-4 text-[#f7931e]" /> Quero continuar: +8 exercícios por FR$ {EXTRA_DAILY_COST.toFixed(2)}
            </button>
        </div>
      )}
      {showExtraModal && state.user && (
        <div className="fixed inset-0 z-[600] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4" onClick={() => !buyingExtra && setShowExtraModal(false)}>
          <div className="bg-[#2a2a2a] w-full max-w-md rounded-[2.5rem] border-2 border-[#f7931e]/50 p-8 text-center space-y-5 animate-pop shadow-[0_0_50px_rgba(247,147,30,0.2)]" onClick={e => e.stopPropagation()}>
            <div className="w-20 h-20 bg-[#f7931e]/10 rounded-full flex items-center justify-center mx-auto"><Zap className="w-10 h-10 text-[#f7931e]" /></div>
            <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Pacote Extra de Exercícios</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              Você já usou seus <span className="text-white font-black">{getDailyAllowance(state.user.gamification)} exercícios</span> de hoje.
              Compre um pacote de <span className="text-[#f7931e] font-black">+8 exercícios</span> — válido só para hoje — e continue praticando agora.
            </p>
            <div className="flex items-center justify-between bg-[#222222] rounded-2xl px-5 py-3 border border-white/5">
              <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Seu saldo</span>
              <span className="flex items-center gap-2 text-[#f7931e] font-black text-lg"><Coins className="w-5 h-5" /> FR$ {(state.user.gamification.frBalance || 0).toFixed(2)}</span>
            </div>
            <button
              onClick={handleBuyExtraDaily}
              disabled={buyingExtra || (state.user.gamification.frBalance || 0) < EXTRA_DAILY_COST}
              className="w-full py-4 bg-[#f7931e] text-[#222222] rounded-2xl font-black uppercase tracking-widest hover:scale-105 transition-transform disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100 flex items-center justify-center gap-2">
              {buyingExtra ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
              {buyingExtra ? 'Processando...' : `Comprar +8 por FR$ ${EXTRA_DAILY_COST.toFixed(2)}`}
            </button>
            {(state.user.gamification.frBalance || 0) < EXTRA_DAILY_COST && (
              <p className="text-[10px] font-black text-red-400 uppercase tracking-widest">Saldo insuficiente — complete exercícios para ganhar FR$</p>
            )}
            <button onClick={() => setShowExtraModal(false)} disabled={buyingExtra} className="w-full py-3 bg-[#333333] text-gray-400 rounded-2xl font-black uppercase tracking-widest text-xs hover:text-white transition-all">Deixar para amanhã</button>
          </div>
        </div>
      )}
      {state.status === 'level_up' && state.newTierReached && (
        <div className="fixed inset-0 z-[300] bg-[#222222]/95 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center animate-fade-in">
            <div className="relative mb-8"><PartyPopper className="w-24 h-24 text-yellow-400 animate-bounce" /><Sparkles className="absolute -top-4 -right-4 w-12 h-12 text-[#f7931e] animate-pulse" /></div>
            <h2 className="text-5xl font-black text-white uppercase tracking-tighter mb-4 animate-pop">Nova Patente Freedom!</h2>
            <div className="bg-[#f7931e] text-[#222222] px-8 py-4 rounded-3xl text-3xl font-black shadow-2xl shadow-[#f7931e]/30 mb-8 transform rotate-2 animate-pop delay-100">{state.newTierReached}</div>
            <p className="text-gray-400 max-w-md text-xl font-medium leading-relaxed italic animate-fade-in delay-200">"Você acumulou {state.user?.gamification.xp.toLocaleString()} XP. Sua fluência está cada vez mais próxima!"</p>
            <button onClick={() => setState(p => ({ ...p, status: 'results' }))} className="mt-12 px-12 py-5 bg-white text-[#222222] rounded-2xl font-black text-xl hover:scale-110 transition-all uppercase tracking-widest shadow-xl">Ver Resultados</button>
        </div>
      )}
      {pendingChallenge && state.user && (
        <div className="fixed inset-0 z-[700] bg-[#222222]/95 backdrop-blur-2xl flex items-center justify-center p-6">
          <div className="bg-[#2a2a2a] w-full max-w-lg rounded-[3rem] border border-white/10 p-10 shadow-2xl text-center animate-pop">
            <div className="w-20 h-20 bg-[#f7931e]/10 rounded-full flex items-center justify-center mx-auto mb-6"><Sword className="w-10 h-10 text-[#f7931e]" /></div>
            <h3 className="text-2xl font-black text-white uppercase tracking-tighter mb-4">Novo Convite de Desafio!</h3>
            <p className="text-gray-300 mb-8 leading-relaxed">O usuário <span className="text-[#f7931e] font-black">@{pendingChallenge.creatorId}</span> está te convidando a participar do desafio <span className="font-black text-white">"{pendingChallenge.name}"</span>. Você aceita?</p>
            <div className="bg-[#222222] p-6 rounded-3xl border border-white/5 mb-8 text-left">
              <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Regras do Desafio</p>
              <p className="text-sm text-gray-300 italic">"{pendingChallenge.rules}"</p>
              <div className="mt-4 flex gap-4"><div className="flex-1"><p className="text-[8px] font-black text-gray-500 uppercase">Duração</p><p className="text-xs font-black text-white">{pendingChallenge.durationDays} dias</p></div><div className="flex-1"><p className="text-[8px] font-black text-gray-500 uppercase">Foco</p><p className="text-xs font-black text-white">{pendingChallenge.focus}</p></div></div>
            </div>
            <div className="grid grid-cols-1 gap-4">
              <button onClick={async () => { const updated = { ...pendingChallenge }; updated.pendingInvites = updated.pendingInvites.filter(id => id !== state.user!.userId); updated.participantIds.push(state.user!.userId); updated.participantStats[state.user!.userId] = { xpGained: 0, activitiesDone: 0 }; await api.saveChallenge(updated); setPendingChallenge(null); showToast("Você entrou no desafio! Boa sorte! ⚔️", 'success'); }} className="w-full py-5 bg-[#f7931e] text-[#222222] rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:scale-105 transition-all shadow-xl shadow-[#f7931e]/20">Quero participar ⚔️</button>
              <button onClick={async () => { const updated = { ...pendingChallenge }; updated.pendingInvites = updated.pendingInvites.filter(id => id !== state.user!.userId); await api.saveChallenge(updated); setPendingChallenge(null); }} className="w-full py-5 bg-[#333333] text-gray-400 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:text-white transition-all">Não quero participar 💔</button>
            </div>
          </div>
        </div>
      )}
      {state.status === 'loading' && (
        <div className="fixed inset-0 z-[150] bg-[#222222]/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center"><Loader2 className="w-20 h-20 text-[#f7931e] animate-spin mb-6" /><h3 className="text-2xl font-black text-[#f7931e] mb-2 uppercase tracking-tighter">Loading...</h3><p className="text-gray-400 max-w-xs text-sm font-medium">Please wait a moment.</p></div>
      )}
      {state.status === 'error' && (
        <div className="max-w-md mx-auto mt-20 p-8 bg-[#333333] border-2 border-red-500/30 rounded-3xl text-center animate-pop"><AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" /><p className="text-gray-400 mb-6">{state.errorMessage}</p><button onClick={handleHome} className="w-full py-4 bg-[#f7931e] text-[#222222] font-black rounded-2xl">Voltar ao Início</button></div>
      )}
      <main className="container mx-auto px-4">
        {state.status === 'login' && <LoginScreen onLogin={async (user) => {
          setState(p => ({ ...p, status: 'loading' }));
          const [plan, history] = await Promise.all([api.getPlan(user.userId), api.getHistory(user.userId)]);
          localStorage.setItem('freedom_postgres_session', JSON.stringify(user));

          // Se vai pular a palavra-chave, recupera o accessType salvo.
          const willSkipKeyword = !(user.username === 'admin' || user.isAdmin) && !needsKeywordCheck(user.userId);
          const recoveredUser = willSkipKeyword
            ? { ...user, accessType: getStoredAccessType(user.userId) }
            : user;

          setState(p => ({ ...p, user: recoveredUser, studyPlan: plan, activityHistory: history, status: resolvePostLoginStatus(user) }));
        }} />}
        {state.status === 'keyword_check' && (
          <KeywordScreen onSuccess={(accessType) => {
            if (state.user) {
              // Carimba a data da validação e o tipo de acesso para os próximos 30 dias.
              localStorage.setItem(`keyword_validated_${state.user.userId}`, Date.now().toString());
              localStorage.setItem(`keyword_access_${state.user.userId}`, accessType);
              const updatedUser = { ...state.user, accessType };
              setState(p => ({ ...p, user: updatedUser, status: updatedUser.guide ? 'selection' : 'guide_selection' }));
            }
          }} onLogout={handleLogout} />
        )}
        {state.status === 'guide_selection' && <GuideSelectionScreen onHome={handleHome} userName={state.user?.userName || ""} onSelect={async (g) => { if (state.user) { await api.updateGuide(state.user.userId, g); const updated = { ...state.user, guide: g }; setState(p => ({ ...p, user: updated, status: 'selection' })); } }} />}
        {state.status === 'selection' && state.user && (
          <SelectionScreen
            user={state.user}
            onStart={handleStart}
            onOpenStudyPlan={() => setState(p => ({ ...p, status: state.studyPlan ? 'dashboard' : 'plan_setup' }))}
            onStartPlacement={() => setState(p => ({ ...p, status: 'placement_hub' }))}
            onOpenActivities={() => setState(p => ({ ...p, status: 'my_activities' }))}
            onOpenProfile={() => setState(p => ({ ...p, status: 'profile' }))}
            onOpenAdmin={() => setState(p => ({ ...p, status: 'admin_panel' }))}
            onOpenChallenges={() => setState(p => ({ ...p, status: 'challenges' }))}
            onOpenChat={(userId) => setState(p => ({ ...p, status: 'chat', activeChatUserId: userId }))}
            onOpenRankingHistory={() => setState(p => ({ ...p, status: 'ranking_history' }))}
            onOpenJourney={() => { setJourneyReload(n => n + 1); setState(p => ({ ...p, status: 'journey' })); }}
            isLoading={state.status === 'loading'}
            hasActivePlan={!!state.studyPlan}
            onUserUpdate={handleUserUpdate}
            onBuyExtra={() => setShowExtraModal(true)}
          />
        )}
        {state.status === 'ranking_history' && <RankingHistoryScreen onHome={handleHome} />}
        {state.status === 'challenges' && state.user && <ChallengesScreen user={state.user} onHome={handleHome} onUserUpdate={handleUserUpdate} />}
        {state.status === 'chat' && state.user && <ChatScreen user={state.user} onHome={handleHome} activeChatUserId={state.activeChatUserId} />}
        {state.status === 'admin_panel' && (state.user?.username.toLowerCase() === 'admin' || state.user?.isAdmin) && <AdminPanel onBack={handleHome} />}
        {state.status === 'profile' && state.user && <ProfileScreen user={state.user} onHome={handleHome} onUpdate={handleUserUpdate} />}
        {state.status === 'my_activities' && state.user && <MyActivitiesScreen user={state.user} history={state.activityHistory} onHome={handleHome} onRedoActivity={handleStart} />}
        {state.status === 'placement_hub' && state.user && (
          <PlacementHubScreen
            user={state.user}
            onHome={handleHome}
            onStartSkill={(skill) => setState(p => ({ ...p, status: 'placement_test', activePlacementSkill: skill }))}
            onUserUpdate={handleUserUpdate}
          />
        )}
        {state.status === 'placement_test' && state.user && state.activePlacementSkill && (
          <PlacementSkillTestScreen
            user={state.user}
            skill={state.activePlacementSkill}
            onHome={handleHome}
            onComplete={async (result) => {
              // Grava o resultado da habilidade e navega para a tela de resultado.
              try {
                if (state.user && state.activePlacementSkill) {
                  const skill = state.activePlacementSkill;
                  const updatedUser = await api.saveSkillPlacementResult(state.user.userId, skill, {
                    skill,
                    level: result.level,
                    score: result.score,
                    completedAt: Date.now(),
                    resumeFromLevel: result.resumeFromLevel,
                  });
                  setState(p => ({
                    ...p,
                    user: updatedUser,
                    status: 'placement_result',
                    placementResultLevel: result.level,
                    placementResultScore: result.score,
                  }));
                }
              } catch (e) {
                console.error('Erro ao salvar resultado do nivelamento:', e);
                // Mesmo se a gravação falhar, mostra o resultado ao aluno.
                setState(p => ({
                  ...p,
                  status: 'placement_result',
                  placementResultLevel: result.level,
                  placementResultScore: result.score,
                }));
              }
            }}
          />
        )}
        {state.status === 'placement_test' && !state.activePlacementSkill && (
          <PlacementTestScreen onFinish={handlePlacementFinish} onHome={handleHome} />
        )}
        {state.status === 'placement_result' && state.activePlacementSkill && state.placementResultLevel && (
          <PlacementResultScreen
            skill={state.activePlacementSkill}
            level={state.placementResultLevel}
            score={state.placementResultScore ?? 0}
            onBackToHub={() => setState(p => ({ ...p, status: 'placement_hub', activePlacementSkill: null, placementResultLevel: null, placementResultScore: null }))}
          />
        )}
        {state.status === 'plan_setup' && state.user && <StudyPlanSetup user={state.user} onCancel={handleHome} onPlanGenerated={async (newPlan) => { if (state.user) await api.savePlan(state.user.userId, newPlan); setState(prevState => ({ ...prevState, studyPlan: newPlan, status: 'dashboard' })); }} />}
        {state.status === 'dashboard' && state.studyPlan && state.user && <DashboardScreen plan={state.studyPlan} user={state.user} history={state.activityHistory} onUpdatePlan={async (updatedPlan) => { if (state.user) await api.savePlan(state.user.userId, updatedPlan); setState(prevState => ({ ...prevState, studyPlan: updatedPlan })); }} onHome={handleHome} onResetPlan={async () => { await api.deletePlan(state.user!.userId); setState(p => ({ ...p, studyPlan: null, status: 'plan_setup' })); }} onStartTask={(t) => handleStart(state.studyPlan!.inputs.level, t.relatedTheme!, t.description)} />}
        {state.status === 'journey' && state.user && (
          <JourneyScreen
            user={state.user}
            onHome={handleHome}
            onStartExercise={handleStartJourney}
            reloadToken={journeyReload}
          />
        )}
        {/* Enquanto a Frida está desativada, passamos 'Fred' fixo em vez de
            state.user.guide: assim até quem escolheu Frida no passado vê o
            Fred. Quando a Frida for lançada, basta voltar para state.user.guide. */}
        {state.status === 'quiz' && state.content && <QuizScreen content={state.content} onFinish={handleFinish} onHome={handleExitActivity} level={state.level!} theme={state.theme!} topic={state.subTopic!} guide={'Fred'} userName={state.user?.userName} journeyLabel={journeyLabel} />}
        {state.status === 'gapfill' && state.content && state.user && <GapFillScreen content={state.content} level={state.level!} theme={state.theme!} topic={state.subTopic!} onFinish={handleFinish} onHome={handleExitActivity} guide={'Fred'} userName={state.user.userName} />}
        {state.status === 'writing' && state.content && <WritingScreen content={state.content} level={state.level!} theme={state.theme!} topic={state.subTopic!} onFinish={(s) => handleFinish(s, 100)} onHome={handleExitActivity} />}
        {state.status === 'results' && (
          <ResultsScreen
            score={state.score}
            totalQuestions={state.theme === Theme.Writing && !state.content?.gapItems?.length ? 100 : (state.content?.gapItems?.length || state.content?.questions.length || 10)}
            onRetry={() => setState(p => ({ ...p, status: p.content?.gapItems?.length ? 'gapfill' : (state.theme === Theme.Writing ? 'writing' : 'quiz') }))}
            onHome={handleExitActivity}
            xpGained={state.lastXpGained}
            frGained={state.lastFrGained}
            wasRepeat={state.lastWasRepeat}
            journeyLabel={journeyLabel}
            journeyNext={state.journeyContext ? journeyNext : null}
            onJourneyNext={handleJourneyNext}
          />
        )}
      </main>
      <a href="https://wa.me/message/JZDOD5MBRXEAO1" target="_blank" rel="noopener noreferrer" className="fixed bottom-6 left-6 z-50 flex items-center gap-2 text-gray-500 hover:text-[#f7931e] transition-all bg-[#1a1a1a]/50 p-2.5 rounded-xl backdrop-blur-sm group border border-white/5 hover:border-[#f7931e]/30 shadow-2xl" title="Reportar Erro"><AlertTriangle className="w-5 h-5" /><span className="text-[10px] font-black uppercase tracking-widest hidden group-hover:inline-block animate-fade-in pr-1">Reportar Erro</span></a>
      {state.user && state.user.guide && state.status !== 'login' && state.status !== 'loading' && state.status !== 'keyword_check' && (
        <div className="fixed bottom-0 right-0 z-[200] pointer-events-none">
          <div className="pointer-events-auto">
             {/* guide fixo em 'Fred' enquanto a Frida não é lançada (ver comentário acima) */}
             <GuideChat guide={'Fred'} userName={state.user.userName} user={state.user} onUserUpdate={handleUserUpdate} onGenerateActivity={handleStart} />
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
