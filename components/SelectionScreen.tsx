import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Level, Theme, VoiceGender, VoiceAccent, UserTier, UserSession, AccessType } from '../types';
import { TOPICS } from '../constants';
import { api } from '../services/api';
import ProfileViewModal from './ProfileViewModal';
import { DAILY_LIMIT, EXTRA_DAILY_COST, getDailyAllowance } from '../dailyLimit';
import { 
  Brain, Target, Flame, Zap, Trophy, Crown, Shield, Info, Sparkles,
  User as UserIcon, X, Calendar, Globe, BookOpen, Sword,
  ArrowRight, AlertTriangle, Lock, Wallet, ShieldAlert, Compass, Play,
  Clock, Mic, Loader2, PenLine, History, Activity
} from 'lucide-react';

interface SelectionScreenProps {
  user: UserSession;
  // Devolve false quando o pedido foi recusado (limite, trava), para a
  // tela poder destravar o botão em vez de ficar presa em "Gerando...".
  onStart: (level: Level, theme: Theme, subTopic: string, voiceGender?: VoiceGender, voiceAccent?: VoiceAccent) => Promise<boolean> | void;
  onOpenStudyPlan: () => void;
  onStartPlacement: () => void;
  onOpenActivities: () => void;
  onOpenProfile: () => void;
  onOpenChallenges: () => void;
  onOpenChat: (userId: string) => void;
  onOpenAdmin?: () => void;
  onOpenRankingHistory: () => void;
  onOpenJourney: () => void;
  isLoading: boolean;
  initialLevel?: Level | null;
  initialTheme?: Theme | null;
  initialTopic?: string | null;
  hasActivePlan: boolean;
  onUserUpdate: (user: UserSession) => void;
  // Abre o modal central de compra do pacote extra (+8 por FR$10).
  onBuyExtra?: () => void;
}

const PLACEMENT_COOLDOWN_DAYS = 30;
const CUSTOM_TOPIC_VALUE = '__custom__';

const TIER_THRESHOLDS = [
  { tier: UserTier.Starter, min: 0, max: 5000, color: 'text-gray-400', bg: 'bg-gray-400/10', icon: <Shield className="w-5 h-5" /> },
  { tier: UserTier.Warrior, min: 5001, max: 15000, color: 'text-blue-400', bg: 'bg-blue-400/10', icon: <Zap className="w-5 h-5" /> },
  { tier: UserTier.Genius, min: 15001, max: 35000, color: 'text-purple-400', bg: 'bg-purple-400/10', icon: <Brain className="w-5 h-5" /> },
  { tier: UserTier.Pro, min: 35001, max: 60000, color: 'text-orange-400', bg: 'bg-orange-400/10', icon: <Target className="w-5 h-5" /> },
  { tier: UserTier.Legend, min: 60001, max: Infinity, color: 'text-yellow-400', bg: 'bg-yellow-400/10', icon: <Crown className="w-5 h-5" /> },
];

const THEME_META: Record<string, { icon: string; description: string }> = {
  'Gramática':   { icon: '📐', description: 'Estruturas e regras do inglês' },
  'Vocabulário': { icon: '📚', description: 'Palavras e expressões novas' },
  'Business':    { icon: '💼', description: 'Inglês para o ambiente profissional' },
  'Reading':     { icon: '📖', description: 'Interpretação de textos em inglês' },
  'Listening':   { icon: '🎧', description: 'Compreensão auditiva' },
  'Escrita':     { icon: '✍️', description: 'Produção textual em inglês' },
};

const LEVEL_META: Record<string, { icon: string; label: string }> = {
  A1: { icon: '🌱', label: 'Iniciante' },
  A2: { icon: '🌿', label: 'Básico' },
  B1: { icon: '⚡', label: 'Intermediário' },
  B2: { icon: '🔥', label: 'Avançado' },
  C1: { icon: '👑', label: 'Fluente' },
};

const formatFR = (value: number) =>
  "FR$ " + (value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PODIUM_CONFIG: Record<number, { emoji: string; color: string; bg: string; border: string; size: string }> = {
  1: { emoji: '🥇', color: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/50', size: 'w-14 h-14' },
  2: { emoji: '🥈', color: 'text-slate-300', bg: 'bg-slate-300/10', border: 'border-slate-300/50', size: 'w-12 h-12' },
  3: { emoji: '🥉', color: 'text-amber-600', bg: 'bg-amber-600/10', border: 'border-amber-600/50', size: 'w-12 h-12' },
};

const SelectionScreen: React.FC<SelectionScreenProps> = ({
  user, onStart, onOpenStudyPlan, onStartPlacement, onOpenActivities,
  onOpenProfile, onOpenChallenges, onOpenChat, onOpenAdmin, onOpenRankingHistory, onOpenJourney,
  isLoading, initialLevel = null, initialTheme = null, initialTopic = null,
  hasActivePlan, onUserUpdate, onBuyExtra
}) => {
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [selectedLevel, setSelectedLevel] = useState<Level | null>(initialLevel);
  const [selectedTheme, setSelectedTheme] = useState<Theme | null>(initialTheme);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(initialTopic);
  const [customTopicText, setCustomTopicText] = useState('');
  const [selectedMultiTopics, setSelectedMultiTopics] = useState<Set<string>>(new Set());
  const [voiceGender, setVoiceGender] = useState<VoiceGender>('Female');
  const [voiceAccent, setVoiceAccent] = useState<VoiceAccent>('American');
  const [leaderboardUsers, setLeaderboardUsers] = useState<{user: UserSession, periodXp: number, periodActivities: number}[]>([]);
  // Ranking abre no MÊS por padrão: o recorte anual premiava quem já
  // acumulou muito XP e deixava o aluno novo longe do topo, sem sensação
  // de disputa. O mês reinicia com frequência e mantém a corrida viva.
  // Semana e ano continuam disponíveis no seletor ao lado do título.
  const [leaderboardFilter, setLeaderboardFilter] = useState<'Weekly' | 'Monthly' | 'Annual'>('Monthly');
  // Trava contra clique repetido no "Iniciar Prática". O ref é lido e
  // escrito de forma síncrona (não espera re-render), então nenhum
  // clique extra passa; o state é só para o botão mudar na hora.
  const startingRef = useRef(false);
  const [isStarting, setIsStarting] = useState(false);

  const [showLimitModal, setShowLimitModal] = useState(false);
  const [showTiersModal, setShowTiersModal] = useState(false);
  const [showAccessAlert, setShowAccessAlert] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(
    user.accessType === AccessType.CHALLENGE_ONLY && !localStorage.getItem(`welcome_seen_${user.userId}`)
  );
  const [viewProfileId, setViewProfileId] = useState<string | null>(null);

  // ── Aviso da novidade (Journey to Fluency) ───────────────────
  // Aparece uma vez por aluno, na voz do guia dele. A chave termina
  // em "_v1": quando houver uma nova novidade para anunciar, basta
  // trocar para "_v2" que todo mundo vê o aviso de novo.
  const journeyNoticeKey = `journey_notice_v1_${user.userId}`;
  const [showJourneyNotice, setShowJourneyNotice] = useState(
    () => !localStorage.getItem(journeyNoticeKey)
  );
  const closeJourneyNotice = (openJourney: boolean) => {
    localStorage.setItem(journeyNoticeKey, Date.now().toString());
    setShowJourneyNotice(false);
    if (openJourney) onOpenJourney();
  };

  const isChallengeOnly = user.accessType === AccessType.CHALLENGE_ONLY;
  const isAdmin = user.username.toLowerCase() === 'admin' || user.isAdmin === true;
  const today = new Date().toISOString().split('T')[0];
  const dailyCount = user.gamification.lastActivityDate === today ? user.gamification.dailyActivitiesCount : 0;
  // A cota do dia: 8 + pacotes extras comprados hoje (dailyLimit.ts).
  const dailyAllowance = getDailyAllowance(user.gamification);
  const isLimitReached = !user.gamification.isPro && dailyCount >= dailyAllowance;

  // ── Progresso diário ─────────────────────────────────────────
  // Percentual de 0 a 100 para a barra
  const dailyProgressPercent = Math.min(100, Math.round((dailyCount / dailyAllowance) * 100));
  // Cor muda conforme o progresso: azul → laranja → verde (completo)
  const dailyProgressColor =
    dailyCount >= dailyAllowance ? 'bg-green-500' :
    dailyCount >= Math.ceil(dailyAllowance * 0.5) ? 'bg-[#f7931e]' :
    'bg-blue-400';

  const placementCooldownStatus = useMemo(() => {
    if (!user.gamification.lastPlacementDate) return { canTake: true, daysLeft: 0 };
    const daysSinceLast = (Date.now() - user.gamification.lastPlacementDate) / (1000 * 60 * 60 * 24);
    return { canTake: daysSinceLast >= PLACEMENT_COOLDOWN_DAYS, daysLeft: Math.ceil(PLACEMENT_COOLDOWN_DAYS - daysSinceLast) };
  }, [user.gamification.lastPlacementDate]);

  useEffect(() => {
    api.getLeaderboardData(leaderboardFilter).then(setLeaderboardUsers);
  }, [user.gamification.xp, leaderboardFilter]);

  useEffect(() => {
    setSelectedTopic(null);
    setSelectedMultiTopics(new Set());
    setCustomTopicText('');
  }, [selectedLevel, selectedTheme]);

  const availableThemes = useMemo(() => Object.values(Theme), []);
  const availableTopics = useMemo(() => {
    if (!selectedLevel || !selectedTheme) return [];
    return TOPICS[selectedLevel][selectedTheme] || [];
  }, [selectedLevel, selectedTheme]);

  const grammarTopics = useMemo(() => {
    if (!selectedLevel) return [];
    return TOPICS[selectedLevel][Theme.Grammar] || [];
  }, [selectedLevel]);

  const vocabTopics = useMemo(() => {
    if (!selectedLevel) return [];
    return TOPICS[selectedLevel][Theme.Vocabulary] || [];
  }, [selectedLevel]);

  const isMultiSelectTheme = selectedTheme === Theme.Reading || selectedTheme === Theme.Listening || selectedTheme === Theme.Writing;
  const needsVoiceConfig = selectedTheme === Theme.Listening || selectedTheme === Theme.Reading || selectedTheme === Theme.Business;

  const finalTopic = useMemo(() => {
    if (selectedTopic === CUSTOM_TOPIC_VALUE) return customTopicText.trim();
    if (isMultiSelectTheme) return Array.from(selectedMultiTopics).join(', ');
    return selectedTopic || '';
  }, [selectedTopic, customTopicText, isMultiSelectTheme, selectedMultiTopics]);

  const canStart = useMemo(() => {
    if (selectedTopic === CUSTOM_TOPIC_VALUE) return customTopicText.trim().length > 2;
    if (isMultiSelectTheme) return selectedMultiTopics.size > 0;
    return selectedTopic !== null;
  }, [selectedTopic, customTopicText, isMultiSelectTheme, selectedMultiTopics]);

  const currentTierIndex = useMemo(() =>
    TIER_THRESHOLDS.findIndex(t => user.gamification.xp >= t.min && user.gamification.xp <= t.max),
    [user.gamification.xp]
  );
  const currentTier = TIER_THRESHOLDS[currentTierIndex] || TIER_THRESHOLDS[0];
  const nextTier = TIER_THRESHOLDS[currentTierIndex + 1] || null;
  const progressPercentage = useMemo(() => {
    if (currentTier.tier === UserTier.Legend) return 100;
    return Math.min(100, Math.round(((user.gamification.xp - currentTier.min) / (currentTier.max - currentTier.min)) * 100));
  }, [currentTier, user.gamification.xp]);
  const xpToNextLevel = nextTier ? nextTier.min - user.gamification.xp : 0;
  const userRank = leaderboardUsers.findIndex(u => u.user.userId === user.userId) + 1;

  const toggleMultiTopic = (topic: string) => {
    const newSet = new Set(selectedMultiTopics);
    if (newSet.has(topic)) { newSet.delete(topic); }
    else { if (newSet.size >= 2) return; newSet.add(topic); }
    setSelectedMultiTopics(newSet);
  };

  // ── Início da prática ──────────────────────────────────────────
  // A contagem do exercício NÃO acontece mais aqui. Antes, este
  // handler somava +1 no Firestore ANTES de qualquer trava, então
  // cada clique repetido durante o delay da IA virava um exercício
  // a mais na cota do aluno ("só fiz um e a plataforma diz 3").
  // Agora quem conta é o App, uma única vez e só depois que o
  // exercício realmente abre. Aqui ficam apenas a trava síncrona
  // contra clique repetido e o feedback visual imediato.
  const handleStartClick = async () => {
    if (startingRef.current) return;   // 2º clique nem entra
    if (isChallengeOnly) { setShowAccessAlert(true); return; }
    if (isLimitReached) { setShowLimitModal(true); return; }
    startingRef.current = true;
    setIsStarting(true);

    // Se o App recusar o pedido, esta tela continua montada — então
    // precisa soltar a própria trava, senão o botão fica morto.
    const started = await onStart(selectedLevel!, selectedTheme!, finalTopic, voiceGender, voiceAccent);
    if (started === false) {
      startingRef.current = false;
      setIsStarting(false);
    }
  };

  // ── Progress Bar do Wizard (passos 1/2/3) ────────────────────
  const renderProgress = () => (
    <div className="flex items-center gap-2 mb-6">
      {[1, 2, 3].map((s) => (
        <React.Fragment key={s}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black border-2 transition-all ${
            wizardStep > s ? 'bg-[#f7931e]/20 border-[#f7931e] text-[#f7931e]'
            : wizardStep === s ? 'bg-[#f7931e] border-[#f7931e] text-[#222222] shadow-[0_0_12px_rgba(247,147,30,0.4)]'
            : 'bg-[#222222] border-[#444444] text-gray-600'
          }`}>
            {wizardStep > s ? '✓' : s}
          </div>
          {s < 3 && (
            <div className="flex-1 h-0.5 rounded-full bg-[#333333] overflow-hidden">
              <div className={`h-full bg-[#f7931e] transition-all duration-500 ${wizardStep > s ? 'w-full' : 'w-0'}`} />
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-8 animate-fade-in relative">

      {/* ── Welcome Modal ── */}
      {showWelcomeModal && (
        <div className="fixed inset-0 z-[500] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="bg-[#2a2a2a] w-full max-w-lg rounded-[2.5rem] border-2 border-[#f7931e]/50 p-10 text-center space-y-8 animate-pop shadow-[0_0_50px_rgba(247,147,30,0.3)]">
            <div className="w-24 h-24 bg-[#f7931e]/10 rounded-full flex items-center justify-center mx-auto">
              <Sparkles className="w-12 h-12 text-[#f7931e]" />
            </div>
            <div className="space-y-4">
              <h3 className="text-3xl font-black text-white uppercase tracking-tighter">Bem-vindo(a)!</h3>
              <p className="text-gray-300 text-sm leading-relaxed font-medium">
                Seja muito bem vindo(a) à plataforma de exercícios da Freedom. Como você não é nosso aluno, algumas funcionalidades estão limitadas, mas o Easter Challenge 40 dias está liberado para você!
              </p>
            </div>
            <button onClick={() => { setShowWelcomeModal(false); localStorage.setItem(`welcome_seen_${user.userId}`, 'true'); }}
              className="w-full py-5 bg-[#f7931e] text-[#222222] rounded-2xl font-black uppercase tracking-widest hover:scale-105 transition-transform shadow-xl shadow-[#f7931e]/20">
              Começar Agora
            </button>
          </div>
        </div>
      )}

      {/* ── Aviso da novidade, na voz do guia ── */}
      {showJourneyNotice && !showWelcomeModal && (
        <div className="fixed inset-0 z-[480] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="bg-[#2a2a2a] w-full max-w-lg rounded-[2.5rem] border-2 border-[#f7931e]/50 shadow-[0_0_60px_rgba(247,147,30,0.25)] overflow-hidden animate-pop max-h-[92vh] overflow-y-auto scrollbar-hide">
            <div className="relative p-8 bg-gradient-to-br from-[#f7931e] to-[#ff5e3a]">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-[#222222]/30 border-2 border-white/40 flex items-center justify-center backdrop-blur-sm shrink-0">
                  <span className="text-3xl">🧭</span>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/80">Novidade na plataforma</p>
                  <h3 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter leading-none">Journey to Fluency</h3>
                </div>
              </div>
            </div>

            <div className="p-8 space-y-5">
              <p className="text-gray-300 text-sm leading-relaxed">
                Oi, <span className="text-white font-black">{user.userName}</span>! Aqui é o <span className="text-[#f7931e] font-black">{user.guide}</span>. 👋
                Muita gente me diz que fica em dúvida sobre <span className="text-white font-bold">o que estudar hoje</span> com tantas opções. Então criamos uma trilha para você seguir sem pensar: a <span className="text-[#f7931e] font-black">Journey to Fluency</span>.
              </p>

              <div className="space-y-3">
                {[
                  { icon: '🏆', title: '5 Seasons, do A1 ao C1', text: 'Cada Season é um nível. Você avança como numa série: uma temporada de cada vez.' },
                  { icon: '📍', title: 'Steps na ordem da sua aula', text: 'Cada Step é um tópico de gramática, na mesma sequência que a gente usa na Freedom.' },
                  { icon: '🎯', title: '5 exercícios por Step', text: 'Gramática, vocabulário, leitura, áudio e escrita — todos combinando entre si.' },
                  { icon: '🚀', title: 'Já fez o nivelamento?', text: 'Então as Seasons do seu nível já vêm desbloqueadas. Você começa de onde está.' },
                ].map(item => (
                  <div key={item.title} className="flex items-start gap-3 bg-[#222222] p-4 rounded-2xl border border-white/5">
                    <span className="text-xl shrink-0">{item.icon}</span>
                    <div>
                      <p className="text-white font-black text-xs uppercase tracking-tight">{item.title}</p>
                      <p className="text-[11px] text-gray-400 leading-relaxed mt-0.5">{item.text}</p>
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-gray-400 text-xs leading-relaxed italic">
                Escolha entre 4 jornadas — <span className="text-white font-bold">Freedom</span>, <span className="text-white font-bold">Business</span>, <span className="text-white font-bold">Young</span> e <span className="text-white font-bold">Traveler</span> — e o conteúdo se adapta ao seu mundo. Vamos nessa? 💪
              </p>

              <div className="grid grid-cols-1 gap-3 pt-2">
                <button onClick={() => closeJourneyNotice(true)}
                  className="w-full py-5 bg-[#f7931e] text-[#222222] rounded-2xl font-black uppercase tracking-widest hover:scale-[1.02] transition-transform shadow-xl shadow-[#f7931e]/20 flex items-center justify-center gap-2">
                  <Compass className="w-5 h-5" /> Conhecer a trilha
                </button>
                <button onClick={() => closeJourneyNotice(false)}
                  className="w-full py-4 bg-transparent text-gray-500 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:text-white transition-all">
                  Agora não
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Access Alert ── */}
      {showAccessAlert && (
        <div className="fixed inset-0 z-[500] bg-black/80 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setShowAccessAlert(false)}>
          <div className="bg-[#2a2a2a] w-full max-w-sm rounded-[2rem] border border-red-500/30 p-8 text-center space-y-6 animate-pop" onClick={e => e.stopPropagation()}>
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto"><ShieldAlert className="w-8 h-8 text-red-500" /></div>
            <h4 className="text-xl font-black text-white uppercase tracking-tighter">Acesso Restrito</h4>
            <p className="text-gray-400 text-sm font-medium">Funcionalidade exclusiva para alunos Freedom</p>
            <button onClick={() => setShowAccessAlert(false)} className="w-full py-4 bg-white/5 text-white rounded-xl font-black uppercase tracking-widest hover:bg-white/10 transition-all">Fechar</button>
          </div>
        </div>
      )}

      {/* ── Admin Button ── */}
      {isAdmin && (
        <button onClick={onOpenAdmin} className="fixed bottom-6 left-24 z-50 bg-[#222222] border-2 border-[#f7931e] text-[#f7931e] px-6 py-3 rounded-2xl font-black uppercase tracking-widest flex items-center gap-2 hover:bg-[#f7931e] hover:text-[#222222] transition-all shadow-2xl">
          <ShieldAlert className="w-5 h-5" /> Painel Admin
        </button>
      )}

      {/* ── Tiers Modal ── */}
      {showTiersModal && (
        <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#2a2a2a] w-full max-w-lg rounded-[2.5rem] border border-white/5 shadow-2xl overflow-hidden animate-pop">
            <div className="p-8 border-b border-white/5 flex justify-between items-center bg-[#222222]">
              <h3 className="text-2xl font-black text-white flex items-center gap-3"><Shield className="w-6 h-6 text-[#f7931e]" /> Patentes Freedom</h3>
              <button onClick={() => setShowTiersModal(false)} className="text-gray-500 hover:text-white"><X className="w-6 h-6" /></button>
            </div>
            <div className="p-8 space-y-4 max-h-[60vh] overflow-y-auto scrollbar-hide">
              {TIER_THRESHOLDS.map((t, i) => (
                <div key={i} className="bg-[#222222] p-5 rounded-2xl border border-white/5 flex items-center gap-5">
                  <div className={`w-14 h-14 rounded-full ${t.bg} flex items-center justify-center ${t.color} border border-white/5`}>{t.icon}</div>
                  <div className="flex-1">
                    <h4 className={`font-black text-sm uppercase tracking-widest ${t.color}`}>{t.tier}</h4>
                    <p className="text-[10px] text-gray-500 font-bold uppercase mt-1">{t.min.toLocaleString()} XP — {t.max === Infinity ? '∞' : t.max.toLocaleString()} XP</p>
                  </div>
                  {user.gamification.xp >= t.min && user.gamification.xp <= t.max && (
                    <div className="bg-[#f7931e] text-[#222222] text-[8px] font-black px-2 py-1 rounded uppercase">Atual</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Limit Modal ── */}
      {showLimitModal && (
        <div className="fixed inset-0 z-[400] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="bg-[#2a2a2a] w-full max-w-md rounded-[2.5rem] border-2 border-[#f7931e]/50 p-8 text-center space-y-6 animate-pop shadow-[0_0_50px_rgba(247,147,30,0.2)]">
            <div className="w-20 h-20 bg-[#f7931e]/10 rounded-full flex items-center justify-center mx-auto"><Lock className="w-10 h-10 text-[#f7931e]" /></div>
            <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Limite Diário Atingido</h3>
            <p className="text-gray-400 text-sm leading-relaxed">Parabéns! Você usou seus {dailyAllowance} exercícios de hoje. Quer continuar agora? Compre um pacote extra de +8 exercícios, válido só para hoje.</p>
            {onBuyExtra && (
              <button onClick={() => { setShowLimitModal(false); onBuyExtra(); }} className="w-full py-4 bg-[#f7931e] text-[#222222] rounded-2xl font-black uppercase tracking-widest hover:scale-105 transition-transform flex items-center justify-center gap-2">
                <Zap className="w-5 h-5" /> Comprar +8 por FR$ {EXTRA_DAILY_COST.toFixed(2)}
              </button>
            )}
            <button onClick={() => setShowLimitModal(false)} className="w-full py-3 bg-[#333333] text-gray-400 rounded-2xl font-black uppercase tracking-widest text-xs hover:text-white transition-all">Voltar amanhã</button>
          </div>
        </div>
      )}

      {/* ── Stats Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <div className="lg:col-span-2 bg-[#2a2a2a] rounded-[2rem] border border-white/5 p-6 shadow-xl flex flex-col md:flex-row gap-6 items-center relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none transform group-hover:scale-110 transition-transform">
            <UserIcon className="w-32 h-32 text-white" />
          </div>
          <div className="relative cursor-pointer shrink-0" onClick={onOpenProfile}>
            <div className={`w-24 h-24 rounded-full border-4 ${currentTier.color.replace('text-', 'border-')} flex items-center justify-center bg-[#222222] shadow-lg overflow-hidden`}>
              {user.profilePhoto ? <img src={user.profilePhoto} alt="Profile" className="w-full h-full object-cover" /> : <div className={`${currentTier.color} transform scale-125`}>{currentTier.icon}</div>}
            </div>
            <div className="absolute -bottom-1 -right-1 bg-[#f7931e] text-[#222222] px-2 py-0.5 rounded-lg text-[9px] font-black shadow-lg">LV.{currentTierIndex + 1}</div>
            {user.gamification.weeklyBadge && (
              <div className="absolute -top-2 -left-2 text-xl" title={`${user.gamification.weeklyBadge.position}º lugar — ${user.gamification.weeklyBadge.weekLabel}`}>
                {user.gamification.weeklyBadge.position === 1 ? '👑' : user.gamification.weeklyBadge.position === 2 ? '🥈' : '🥉'}
              </div>
            )}
          </div>
          <div className="flex-1 space-y-4 w-full">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xl font-black text-white flex items-center gap-2 truncate">
                  {user.userName}
                  {user.gamification.isPro && <span className="text-[8px] bg-[#f7931e] text-[#222222] px-1.5 py-0.5 rounded-md font-black">{isAdmin ? 'ADMIN' : 'PRO'}</span>}
                </h3>
                <p className={`text-[10px] font-black uppercase tracking-[0.2em] ${currentTier.color}`}>{currentTier.tier}</p>
                {user.gamification.weeklyBadge && (
                  <p className="text-[9px] font-black text-yellow-400/80 uppercase tracking-widest mt-0.5">
                    {user.gamification.weeklyBadge.position === 1 ? '👑' : user.gamification.weeklyBadge.position === 2 ? '🥈' : '🥉'} Campeão — {user.gamification.weeklyBadge.weekLabel}
                  </p>
                )}
              </div>
              <button onClick={() => setShowTiersModal(true)} className="p-2 bg-white/5 rounded-xl text-gray-400 hover:text-[#f7931e] transition-all"><Info className="w-4 h-4" /></button>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-[8px] font-black uppercase tracking-widest text-gray-500">
                <span>{user.gamification.xp.toLocaleString()} XP</span>
                {nextTier && <span className="text-white/60">Faltam {xpToNextLevel.toLocaleString()} XP</span>}
              </div>
              <div className="h-2 w-full bg-black/40 rounded-full overflow-hidden border border-white/5">
                <div className="h-full bg-[#f7931e] transition-all duration-1000 shadow-[0_0_15px_rgba(247,147,30,0.3)]" style={{ width: `${progressPercentage}%` }} />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-[#2a2a2a] rounded-[2rem] border border-white/5 p-6 shadow-xl flex flex-col justify-between group">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center text-green-400"><Wallet className="w-5 h-5" /></div>
            <div className="text-right">
              <p className="text-[9px] font-black text-gray-500 uppercase">Ganho Hoje</p>
              <p className="text-xs font-black text-green-400">+{user.gamification.dailyXpEarned.toLocaleString()} XP</p>
            </div>
          </div>
          <div>
            <p className="text-[9px] font-black text-gray-500 uppercase mb-1">Saldo Freedom Reais</p>
            <span className="text-2xl font-black text-white">{formatFR(user.gamification.frBalance)}</span>
          </div>
        </div>

        <div className="bg-[#2a2a2a] rounded-[2rem] border border-white/5 p-6 shadow-xl flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400"><Flame className="w-5 h-5" /></div>
            <div className="text-right">
              <p className="text-[9px] font-black text-gray-500 uppercase">Ofensiva</p>
              <p className="text-xs font-black text-blue-400">Ativa</p>
            </div>
          </div>
          <div>
            <p className="text-[9px] font-black text-gray-500 uppercase mb-1">Dias Seguidos</p>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-white">{user.gamification.streak}</span>
              <span className="text-gray-500 text-xs font-bold">dias</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── JOURNEY TO FLUENCY ── */}
      {/* Fica ACIMA do wizard de propósito: a trilha é o caminho
          recomendado para quem não sabe o que estudar hoje — que era
          justamente onde o aluno se perdia entre tantas opções. */}
      <button onClick={onOpenJourney}
        className="group relative w-full overflow-hidden rounded-[2.5rem] border-2 border-[#f7931e]/40 hover:border-[#f7931e] bg-[#2a2a2a] p-6 md:p-8 text-left transition-all hover:-translate-y-0.5 shadow-xl">
        <div className="absolute -right-16 -top-20 w-80 h-80 rounded-full bg-gradient-to-br from-[#f7931e] to-[#ff5e3a] opacity-20 blur-3xl group-hover:opacity-30 transition-opacity" />
        <div className="absolute -left-10 -bottom-16 w-56 h-56 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 opacity-10 blur-3xl" />
        <div className="relative flex flex-col md:flex-row items-center gap-6">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#f7931e] to-[#ff5e3a] flex items-center justify-center text-4xl shadow-2xl shadow-[#f7931e]/30 shrink-0 group-hover:scale-105 transition-transform">
            🧭
          </div>
          <div className="flex-1 text-center md:text-left space-y-2">
            <div className="flex items-center gap-2 justify-center md:justify-start">
              <span className="text-[9px] font-black uppercase tracking-[0.2em] bg-[#f7931e] text-[#222222] px-2 py-0.5 rounded">Novo</span>
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-500">Trilha guiada</span>
            </div>
            <h3 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter">Journey to Fluency</h3>
            <p className="text-sm text-gray-400 font-medium leading-relaxed max-w-xl">
              Não sabe o que estudar hoje? Siga a trilha: <span className="text-white font-bold">5 Seasons</span> (A1 ao C1), divididas em Steps com gramática, vocabulário, leitura, áudio e escrita — na mesma ordem da sua aula na Freedom.
            </p>
          </div>
          <div className="shrink-0 flex items-center gap-2 px-6 py-4 bg-[#f7931e] text-[#222222] rounded-2xl font-black uppercase tracking-widest text-xs group-hover:scale-105 transition-transform shadow-lg">
            <Compass className="w-5 h-5" /> Abrir trilha
          </div>
        </div>
      </button>

      {/* ── Nav Buttons ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button onClick={onOpenStudyPlan} className={`p-5 rounded-[2rem] border-2 transition-all flex flex-col items-center justify-center gap-3 group relative overflow-hidden ${hasActivePlan ? 'bg-[#f7931e]/10 border-[#f7931e]/50 hover:bg-[#f7931e]/20' : 'bg-[#2a2a2a] border-white/5 hover:border-[#f7931e]/50'}`}>
          <div className={`p-4 rounded-2xl transition-colors ${hasActivePlan ? 'bg-[#f7931e] text-[#222222] shadow-[0_0_20px_rgba(247,147,30,0.4)]' : 'bg-[#333333] text-[#f7931e] group-hover:bg-[#f7931e] group-hover:text-[#222222]'}`}><Calendar className="w-6 h-6" /></div>
          <span className={`text-xs font-black uppercase tracking-widest ${hasActivePlan ? 'text-white' : 'text-gray-400 group-hover:text-white'}`}>Meu Plano</span>
          {hasActivePlan && <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-[#f7931e] animate-pulse" />}
        </button>

        <button onClick={onOpenActivities} className="p-5 bg-[#2a2a2a] rounded-[2rem] border border-white/5 hover:border-[#f7931e]/50 transition-all flex flex-col items-center justify-center gap-3 group">
          <div className="p-4 rounded-2xl bg-[#333333] text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-colors"><BookOpen className="w-6 h-6" /></div>
          <span className="text-xs font-black uppercase tracking-widest text-gray-400 group-hover:text-white">Histórico</span>
        </button>

        <button onClick={() => { if (isChallengeOnly) { setShowAccessAlert(true); return; } if (placementCooldownStatus.canTake) onStartPlacement(); }}
          className={`p-5 rounded-[2rem] border transition-all flex flex-col items-center justify-center gap-3 group relative ${!placementCooldownStatus.canTake ? 'bg-[#222222] border-white/5 opacity-70 cursor-not-allowed' : 'bg-[#2a2a2a] border-white/5 hover:border-[#f7931e]/50'}`}>
          <div className={`p-4 rounded-2xl transition-colors ${!placementCooldownStatus.canTake ? 'bg-[#333333] text-gray-600' : 'bg-[#333333] text-purple-400 group-hover:bg-purple-500 group-hover:text-white'}`}><Compass className="w-6 h-6" /></div>
          <span className={`text-xs font-black uppercase tracking-widest ${!placementCooldownStatus.canTake ? 'text-gray-600' : 'text-gray-400 group-hover:text-white'}`}>Nivelamento</span>
          {!placementCooldownStatus.canTake && (
            <div className="absolute inset-0 bg-[#222222]/80 backdrop-blur-sm flex flex-col items-center justify-center rounded-[2rem] opacity-0 group-hover:opacity-100 transition-opacity">
              <Clock className="w-4 h-4 text-gray-400 mb-1" />
              <p className="text-[8px] font-black uppercase text-gray-400">Disponível em</p>
              <p className="text-[#f7931e] font-black text-xs">{placementCooldownStatus.daysLeft} dias</p>
            </div>
          )}
        </button>

        <button onClick={onOpenChallenges} className="p-5 bg-[#2a2a2a] rounded-[2rem] border border-white/5 hover:border-[#f7931e]/50 transition-all flex flex-col items-center justify-center gap-3 group">
          <div className="p-4 rounded-2xl bg-[#333333] text-red-400 group-hover:bg-red-500 group-hover:text-white transition-colors"><Sword className="w-6 h-6" /></div>
          <span className="text-xs font-black uppercase tracking-widest text-gray-400 group-hover:text-white">Desafios</span>
        </button>
      </div>

      {/* ── Main Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* WIZARD */}
        <div className="lg:col-span-2">
          <div className="bg-[#2a2a2a] p-6 md:p-8 rounded-[2.5rem] border border-white/5 shadow-xl">

            {/* ── Cabeçalho: título + barra de progresso diário ── */}
            <div className="flex items-center justify-between gap-4 mb-6">
              <h3 className="text-xl font-black text-white flex items-center gap-3 uppercase tracking-tighter shrink-0">
                <Play className="w-6 h-6 text-[#f7931e] fill-current" /> Iniciar um novo exercício
              </h3>

              {/* Barra de progresso diário — oculta para PRO/Admin */}
              {!user.gamification.isPro && (
                <div className="flex flex-col items-end gap-1.5 min-w-[130px]">
                  <div className="flex items-center justify-between w-full">
                    <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Hoje</p>
                    <p className={`text-[11px] font-black ${dailyCount >= dailyAllowance ? 'text-green-400' : 'text-white'}`}>
                      {dailyCount}/{dailyAllowance}
                    </p>
                  </div>
                  <div className="w-full h-2 bg-[#333333] rounded-full overflow-hidden border border-white/5">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${dailyProgressColor} ${dailyCount >= dailyAllowance ? 'shadow-[0_0_8px_rgba(34,197,94,0.5)]' : ''}`}
                      style={{ width: `${dailyProgressPercent}%` }}
                    />
                  </div>
                  {dailyCount >= dailyAllowance && (
                    <p className="text-[8px] font-black text-green-400 uppercase tracking-widest">Meta concluída! 🎉</p>
                  )}
                </div>
              )}
            </div>

            {/* STEP 1 — NÍVEL */}
            {wizardStep === 1 && (
              <div className="animate-fade-in">
                {renderProgress()}
                <p className="text-[10px] font-black text-[#f7931e] uppercase tracking-widest mb-1">Passo 1 de 3</p>
                <h3 className="text-lg font-black text-white uppercase tracking-tighter mb-1">Qual é o seu nível?</h3>
                <p className="text-[11px] text-gray-500 font-bold mb-5">Selecione o nível CEFR do seu inglês atual.</p>
                <div className="grid grid-cols-5 gap-2 mb-6">
                  {Object.values(Level).map((lvl) => {
                    const meta = LEVEL_META[lvl];
                    const isSelected = selectedLevel === lvl;
                    return (
                      <button key={lvl} onClick={() => setSelectedLevel(lvl)}
                        className={`flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all ${isSelected ? 'bg-[#f7931e]/10 border-[#f7931e]' : 'bg-[#222222] border-[#333333] hover:border-[#f7931e]/50'}`}>
                        <span className="text-2xl">{meta.icon}</span>
                        <span className={`text-sm font-black ${isSelected ? 'text-[#f7931e]' : 'text-white'}`}>{lvl}</span>
                        <span className={`text-[9px] font-bold uppercase text-center leading-tight ${isSelected ? 'text-[#f7931e]/80' : 'text-gray-600'}`}>{meta.label}</span>
                      </button>
                    );
                  })}
                </div>
                <button onClick={() => setWizardStep(2)} disabled={!selectedLevel}
                  className="w-full py-4 bg-[#f7931e] text-[#222222] rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:scale-[1.02] transition-all shadow-xl shadow-[#f7931e]/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100">
                  Próximo — Habilidade <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* STEP 2 — HABILIDADE */}
            {wizardStep === 2 && (
              <div className="animate-fade-in">
                {renderProgress()}
                <p className="text-[10px] font-black text-[#f7931e] uppercase tracking-widest mb-1">Passo 2 de 3</p>
                <h3 className="text-lg font-black text-white uppercase tracking-tighter mb-1">Qual habilidade?</h3>
                <p className="text-[11px] text-gray-500 font-bold mb-5">Escolha em qual área você quer praticar hoje.</p>
                <div className="grid grid-cols-3 gap-2 mb-6">
                  {availableThemes.map((thm) => {
                    const meta = THEME_META[thm] || { icon: '📝', description: '' };
                    const isSelected = selectedTheme === thm;
                    return (
                      <button key={thm} onClick={() => setSelectedTheme(thm)}
                        className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all text-center ${isSelected ? 'bg-[#f7931e]/10 border-[#f7931e]' : 'bg-[#222222] border-[#333333] hover:border-[#f7931e]/50'}`}>
                        <span className="text-2xl">{meta.icon}</span>
                        <span className={`text-[11px] font-black uppercase ${isSelected ? 'text-[#f7931e]' : 'text-white'}`}>{thm}</span>
                        <span className={`text-[9px] font-medium leading-tight ${isSelected ? 'text-[#f7931e]/70' : 'text-gray-600'}`}>{meta.description}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setWizardStep(1)} className="px-5 py-4 bg-[#333333] text-gray-400 rounded-2xl font-black uppercase tracking-widest text-xs hover:text-white transition-all border border-white/5">← Voltar</button>
                  <button onClick={() => setWizardStep(3)} disabled={!selectedTheme}
                    className="flex-1 py-4 bg-[#f7931e] text-[#222222] rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:scale-[1.02] transition-all shadow-xl shadow-[#f7931e]/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100">
                    Próximo — Tópico <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3 — TÓPICO */}
            {wizardStep === 3 && (
              <div className="animate-fade-in">
                {renderProgress()}
                <p className="text-[10px] font-black text-[#f7931e] uppercase tracking-widest mb-1">Passo 3 de 3</p>
                <h3 className="text-lg font-black text-white uppercase tracking-tighter mb-1">Escolha o tópico</h3>
                <p className="text-[11px] text-gray-500 font-bold mb-4">
                  {isMultiSelectTheme ? 'Selecione até 2 tópicos para combinar — ou apenas 1 se preferir.' : 'Selecione o assunto que quer praticar.'}
                </p>

                {needsVoiceConfig && (
                  <div className="grid grid-cols-2 gap-3 mb-4 p-3 bg-[#222222] rounded-2xl border border-[#333333]">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-1"><Mic className="w-3 h-3" /> Voz</label>
                      <select value={voiceGender} onChange={(e) => setVoiceGender(e.target.value as VoiceGender)}
                        className="w-full bg-[#333333] border border-[#444444] text-white p-2 rounded-xl font-bold text-xs outline-none focus:border-[#f7931e]">
                        <option value="Female">Feminino</option>
                        <option value="Male">Masculino</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-1"><Globe className="w-3 h-3" /> Sotaque</label>
                      <select value={voiceAccent} onChange={(e) => setVoiceAccent(e.target.value as VoiceAccent)}
                        className="w-full bg-[#333333] border border-[#444444] text-white p-2 rounded-xl font-bold text-xs outline-none focus:border-[#f7931e]">
                        <option value="American">Americano</option>
                        <option value="British">Britânico</option>
                        <option value="Australian">Australiano</option>
                        <option value="Indian">Indiano</option>
                      </select>
                    </div>
                  </div>
                )}

                <div className="max-h-[260px] overflow-y-auto pr-1 mb-3 space-y-3 custom-scrollbar">
                  {!isMultiSelectTheme && (
                    <div className="space-y-1.5">
                      {availableTopics.map((topic) => {
                        const isSelected = selectedTopic === topic;
                        return (
                          <button key={topic} onClick={() => { setSelectedTopic(topic); setCustomTopicText(''); }}
                            className={`w-full text-left px-4 py-3 rounded-xl border-2 flex items-center justify-between transition-all text-xs font-bold ${isSelected ? 'bg-[#f7931e]/10 border-[#f7931e] text-white' : 'bg-[#222222] border-[#333333] text-gray-400 hover:border-[#f7931e]/50 hover:text-white'}`}>
                            <span>{topic}</span>
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isSelected ? 'bg-[#f7931e]' : 'bg-[#444444]'}`} />
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {isMultiSelectTheme && (
                    <div className="space-y-4">
                      <div>
                        <p className="text-[9px] font-black text-[#f7931e] uppercase tracking-widest mb-2">📐 Gramática</p>
                        <div className="space-y-1.5">
                          {grammarTopics.map((topic) => {
                            const isSelected = selectedMultiTopics.has(topic);
                            const isDisabled = selectedMultiTopics.size >= 2 && !isSelected;
                            return (
                              <button key={topic} disabled={isDisabled} onClick={() => toggleMultiTopic(topic)}
                                className={`w-full text-left px-4 py-3 rounded-xl border-2 flex items-center justify-between transition-all text-xs font-bold ${isSelected ? 'bg-[#f7931e]/10 border-[#f7931e] text-white' : isDisabled ? 'bg-[#222222] border-[#333333] text-gray-700 cursor-not-allowed' : 'bg-[#222222] border-[#333333] text-gray-400 hover:border-[#f7931e]/50 hover:text-white'}`}>
                                <span>{topic}</span>
                                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isSelected ? 'bg-[#f7931e]' : 'bg-[#444444]'}`} />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div>
                        <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-2">📚 Vocabulário</p>
                        <div className="space-y-1.5">
                          {vocabTopics.map((topic) => {
                            const isSelected = selectedMultiTopics.has(topic);
                            const isDisabled = selectedMultiTopics.size >= 2 && !isSelected;
                            return (
                              <button key={topic} disabled={isDisabled} onClick={() => toggleMultiTopic(topic)}
                                className={`w-full text-left px-4 py-3 rounded-xl border-2 flex items-center justify-between transition-all text-xs font-bold ${isSelected ? 'bg-blue-500/10 border-blue-500 text-white' : isDisabled ? 'bg-[#222222] border-[#333333] text-gray-700 cursor-not-allowed' : 'bg-[#222222] border-[#333333] text-gray-400 hover:border-blue-500/50 hover:text-white'}`}>
                                <span>{topic}</span>
                                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isSelected ? 'bg-blue-400' : 'bg-[#444444]'}`} />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className={isMultiSelectTheme ? 'pt-2 border-t border-white/5' : ''}>
                    {isMultiSelectTheme && <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-2">✨ Personalizado</p>}
                    <button onClick={() => { setSelectedTopic(CUSTOM_TOPIC_VALUE); setSelectedMultiTopics(new Set()); }}
                      className={`w-full text-left px-4 py-3 rounded-xl border-2 flex items-center justify-between transition-all text-xs font-black ${selectedTopic === CUSTOM_TOPIC_VALUE ? 'bg-[#f7931e]/10 border-[#f7931e] text-[#f7931e]' : 'bg-[#222222] border-dashed border-[#f7931e]/40 text-[#f7931e]/70 hover:border-[#f7931e] hover:text-[#f7931e]'}`}>
                      <span className="flex items-center gap-2"><PenLine className="w-3.5 h-3.5" /> Tópico Personalizado</span>
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${selectedTopic === CUSTOM_TOPIC_VALUE ? 'bg-[#f7931e]' : 'bg-[#f7931e]/30'}`} />
                    </button>
                  </div>
                </div>

                {selectedTopic === CUSTOM_TOPIC_VALUE && (
                  <div className="mb-3 animate-fade-in">
                    <input type="text" autoFocus value={customTopicText} onChange={(e) => setCustomTopicText(e.target.value)}
                      placeholder="Ex: Vocabulário de medicina, Phrasal verbs de negócios..."
                      className="w-full bg-[#222222] border-2 border-[#f7931e]/50 focus:border-[#f7931e] text-white rounded-xl px-4 py-3 text-xs font-bold outline-none placeholder-gray-600 transition-all" />
                    <p className="text-[9px] text-gray-600 font-bold uppercase tracking-wider mt-1.5 ml-1">Descreva o assunto que você quer praticar em inglês.</p>
                  </div>
                )}

                {isMultiSelectTheme && selectedMultiTopics.size > 0 && selectedTopic !== CUSTOM_TOPIC_VALUE && (
                  <div className="mb-3 p-3 bg-[#222222] rounded-xl border border-white/5">
                    <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-2">Selecionados ({selectedMultiTopics.size}/2):</p>
                    <div className="flex flex-wrap gap-2">
                      {Array.from(selectedMultiTopics).map(t => (
                        <span key={t} className="px-3 py-1 bg-[#f7931e]/10 border border-[#f7931e]/30 rounded-lg text-[10px] font-black text-[#f7931e]">{t}</span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <button onClick={() => setWizardStep(2)} className="px-5 py-4 bg-[#333333] text-gray-400 rounded-2xl font-black uppercase tracking-widest text-xs hover:text-white transition-all border border-white/5">← Voltar</button>
                  <button onClick={handleStartClick} disabled={!canStart || isLoading || isStarting}
                    className="flex-1 py-4 bg-[#f7931e] text-[#222222] rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:scale-[1.02] transition-all shadow-xl shadow-[#f7931e]/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100">
                    {(isLoading || isStarting) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                    {(isLoading || isStarting) ? 'Gerando seu exercício...' : 'Iniciar Prática'}
                  </button>
                </div>
              </div>
            )}

            {isLimitReached && (
              <p className="text-center text-red-500 text-[10px] font-bold uppercase tracking-widest mt-4 flex items-center justify-center gap-2">
                <AlertTriangle className="w-3 h-3" /> Limite diário de atividades atingido
              </p>
            )}
            {isChallengeOnly && (
              <p className="text-center text-red-500 text-[10px] font-bold uppercase tracking-widest mt-4 flex items-center justify-center gap-2">
                <Lock className="w-3 h-3" /> Crie um Plano de Estudos para acessar
              </p>
            )}
          </div>
        </div>

        {/* ── RANKING ── */}
        <div className="bg-[#2a2a2a] p-6 md:p-8 rounded-[2.5rem] border border-white/5 shadow-xl flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-black text-white flex items-center gap-2 uppercase tracking-tighter">
              <Trophy className="w-5 h-5 text-yellow-400" /> Ranking
            </h3>
            <select value={leaderboardFilter} onChange={(e) => setLeaderboardFilter(e.target.value as any)}
              className="bg-[#222222] border border-white/10 text-gray-400 text-[10px] font-black uppercase rounded-xl p-2 outline-none focus:border-[#f7931e]">
              <option value="Weekly">Semana</option>
              <option value="Monthly">Mês</option>
              <option value="Annual">Ano</option>
            </select>
          </div>

          <p className="text-[9px] font-bold text-gray-600 uppercase tracking-widest mb-4">
            {leaderboardFilter === 'Weekly' ? 'XP acumulado nesta semana' : leaderboardFilter === 'Monthly' ? 'XP acumulado neste mês' : 'XP acumulado neste ano'}
          </p>

          {leaderboardUsers.filter(u => u.periodXp > 0).length >= 3 && (
            <div className="flex items-end justify-center gap-3 mb-6 px-2">
              {leaderboardUsers[1] && leaderboardUsers[1].periodXp > 0 && (() => {
                const u = leaderboardUsers[1]; const cfg = PODIUM_CONFIG[2];
                return (
                  <div className="flex flex-col items-center gap-2 flex-1">
                    <span className="text-lg">🥈</span>
                    <div className={`${cfg.size} rounded-full border-2 ${cfg.border} bg-[#222222] overflow-hidden`}>
                      {u.user.profilePhoto ? <img src={u.user.profilePhoto} className="w-full h-full object-cover" /> : <UserIcon className="w-5 h-5 m-auto text-gray-500 mt-3" />}
                    </div>
                    <div className="text-center">
                      <p className={`text-[10px] font-black truncate max-w-[70px] ${cfg.color}`}>{u.user.username}</p>
                      <p className="text-[9px] text-gray-500 font-bold">{u.periodXp.toLocaleString()} XP</p>
                    </div>
                    <div className={`w-full h-12 ${cfg.bg} border ${cfg.border} rounded-t-xl flex items-center justify-center`}>
                      <span className={`text-lg font-black ${cfg.color}`}>2</span>
                    </div>
                  </div>
                );
              })()}
              {leaderboardUsers[0] && leaderboardUsers[0].periodXp > 0 && (() => {
                const u = leaderboardUsers[0]; const cfg = PODIUM_CONFIG[1];
                return (
                  <div className="flex flex-col items-center gap-2 flex-1">
                    <span className="text-xl">👑</span>
                    <div className={`${cfg.size} rounded-full border-2 ${cfg.border} bg-[#222222] overflow-hidden shadow-[0_0_20px_rgba(250,204,21,0.3)]`}>
                      {u.user.profilePhoto ? <img src={u.user.profilePhoto} className="w-full h-full object-cover" /> : <UserIcon className="w-6 h-6 m-auto text-gray-500 mt-4" />}
                    </div>
                    <div className="text-center">
                      <p className={`text-[10px] font-black truncate max-w-[70px] ${cfg.color}`}>{u.user.username}</p>
                      <p className="text-[9px] text-gray-500 font-bold">{u.periodXp.toLocaleString()} XP</p>
                    </div>
                    <div className={`w-full h-16 ${cfg.bg} border ${cfg.border} rounded-t-xl flex items-center justify-center shadow-[0_0_15px_rgba(250,204,21,0.15)]`}>
                      <span className={`text-xl font-black ${cfg.color}`}>1</span>
                    </div>
                  </div>
                );
              })()}
              {leaderboardUsers[2] && leaderboardUsers[2].periodXp > 0 && (() => {
                const u = leaderboardUsers[2]; const cfg = PODIUM_CONFIG[3];
                return (
                  <div className="flex flex-col items-center gap-2 flex-1">
                    <span className="text-lg">🥉</span>
                    <div className={`${cfg.size} rounded-full border-2 ${cfg.border} bg-[#222222] overflow-hidden`}>
                      {u.user.profilePhoto ? <img src={u.user.profilePhoto} className="w-full h-full object-cover" /> : <UserIcon className="w-5 h-5 m-auto text-gray-500 mt-3" />}
                    </div>
                    <div className="text-center">
                      <p className={`text-[10px] font-black truncate max-w-[70px] ${cfg.color}`}>{u.user.username}</p>
                      <p className="text-[9px] text-gray-500 font-bold">{u.periodXp.toLocaleString()} XP</p>
                    </div>
                    <div className={`w-full h-8 ${cfg.bg} border ${cfg.border} rounded-t-xl flex items-center justify-center`}>
                      <span className={`text-lg font-black ${cfg.color}`}>3</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar space-y-2 max-h-[280px]">
            {leaderboardUsers.length === 0 || leaderboardUsers.every(u => u.periodXp === 0) ? (
              <div className="text-center py-8 space-y-2">
                <Activity className="w-8 h-8 text-gray-700 mx-auto" />
                <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">Nenhuma atividade neste período ainda.</p>
              </div>
            ) : (
              leaderboardUsers.filter(u => u.periodXp > 0).map((lbUser, index) => {
                const isCurrentUser = lbUser.user.userId === user.userId;
                let rankStyle = "bg-[#333333] border-white/5";
                if (index === 0) rankStyle = "bg-yellow-400/5 border-yellow-400/20";
                else if (index === 1) rankStyle = "bg-slate-300/5 border-slate-300/20";
                else if (index === 2) rankStyle = "bg-amber-700/5 border-amber-700/20";
                return (
                  <div key={lbUser.user.userId} onClick={() => setViewProfileId(lbUser.user.userId)}
                    className={`flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer hover:bg-white/5 ${isCurrentUser ? 'border-[#f7931e]/50' : rankStyle}`}>
                    <div className="flex items-center gap-2.5">
                      <span className="font-black text-xs w-4 text-center text-gray-500">{index + 1}</span>
                      <div className="w-8 h-8 rounded-full bg-[#222222] overflow-hidden border border-white/10 flex-shrink-0">
                        {lbUser.user.profilePhoto ? <img src={lbUser.user.profilePhoto} className="w-full h-full object-cover" /> : <UserIcon className="w-4 h-4 m-auto text-gray-500 mt-2" />}
                      </div>
                      <div>
                        <p className={`text-[10px] font-black truncate max-w-[80px] ${isCurrentUser ? 'text-[#f7931e]' : 'text-white'}`}>{lbUser.user.username}</p>
                        {lbUser.periodActivities > 0 && (
                          <p className="text-[8px] text-gray-600 font-bold">{lbUser.periodActivities} ativ.</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-black text-xs text-white">{lbUser.periodXp.toLocaleString()}</span>
                      <p className="text-[8px] text-gray-500 font-black uppercase">XP</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="pt-4 mt-4 border-t border-white/5 space-y-3">
            {userRank > 0 && leaderboardUsers[userRank - 1]?.periodXp > 0 && (
              <p className="text-center text-[10px] font-black text-gray-500 uppercase">
                Sua posição: <span className="text-[#f7931e]">#{userRank}</span>
              </p>
            )}
            <button onClick={onOpenRankingHistory}
              className="w-full py-3 bg-[#222222] text-gray-400 rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 hover:bg-[#333333] hover:text-white transition-all border border-white/5">
              <History className="w-4 h-4" /> Ver Hall da Fama
            </button>
          </div>
        </div>
      </div>

      {viewProfileId && (
        <ProfileViewModal currentUser={user} targetUserId={viewProfileId}
          onClose={() => setViewProfileId(null)}
          onOpenChat={(id) => { setViewProfileId(null); onOpenChat(id); }}
          onOpenChallenge={() => { setViewProfileId(null); onOpenChallenges(); }}
          onUserUpdate={onUserUpdate} />
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255,255,255,0.05); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #333333; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #f7931e; }
      `}</style>
    </div>
  );
};

export default SelectionScreen;
