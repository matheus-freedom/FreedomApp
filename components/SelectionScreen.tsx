import React, { useState, useMemo, useEffect } from 'react';
import { Level, Theme, VoiceGender, VoiceAccent, UserTier, UserSession, AdminNotification, AccessType } from '../types';
import { TOPICS } from '../constants';
import { api } from '../services/api';
import ProfileViewModal from './ProfileViewModal';
import { 
  Brain, CheckCircle, Shuffle, Check, RotateCcw, 
  Layers, Loader2, Volume2, Target, 
  Flame, Zap, Trophy, Crown, Shield, Star, Info, Sparkles,
  TrendingUp, Award, User as UserIcon, Plus, Users, X, Calendar, Search, Clock, Mic2, Globe, BookOpen, Sword,
  ArrowRight, BarChart, AlertTriangle, Lock, Key, ArrowLeft, Camera, Edit2, HelpCircle, ChevronRight, Mic, BookText, ListChecks, Coins, Gift, Wallet, ArrowUpRight, ShieldAlert, Bell, Compass, Play,
  PenLine
} from 'lucide-react';

interface SelectionScreenProps {
  user: UserSession;
  onStart: (level: Level, theme: Theme, subTopic: string, voiceGender?: VoiceGender, voiceAccent?: VoiceAccent) => void;
  onOpenStudyPlan: () => void;
  onStartPlacement: () => void;
  onOpenActivities: () => void;
  onOpenProfile: () => void;
  onOpenChallenges: () => void;
  onOpenChat: (userId: string) => void;
  onOpenAdmin?: () => void;
  isLoading: boolean;
  initialLevel?: Level | null;
  initialTheme?: Theme | null;
  initialTopic?: string | null;
  hasActivePlan: boolean;
  onUserUpdate: (user: UserSession) => void;
}

const DAILY_LIMIT = 8;
const PLACEMENT_COOLDOWN_DAYS = 30;

const TIER_THRESHOLDS = [
  { tier: UserTier.Starter, min: 0, max: 5000, color: 'text-gray-400', bg: 'bg-gray-400/10', icon: <Shield className="w-5 h-5" /> },
  { tier: UserTier.Warrior, min: 5001, max: 15000, color: 'text-blue-400', bg: 'bg-blue-400/10', icon: <Zap className="w-5 h-5" /> },
  { tier: UserTier.Genius, min: 15001, max: 35000, color: 'text-purple-400', bg: 'bg-purple-400/10', icon: <Brain className="w-5 h-5" /> },
  { tier: UserTier.Pro, min: 35001, max: 60000, color: 'text-orange-400', bg: 'bg-orange-400/10', icon: <Target className="w-5 h-5" /> },
  { tier: UserTier.Legend, min: 60001, max: Infinity, color: 'text-yellow-400', bg: 'bg-yellow-400/10', icon: <Crown className="w-5 h-5" /> },
];

const formatFR = (value: number) => {
  return "FR$ " + (value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const THEME_META: Record<string, { icon: string; description: string }> = {
  'Gramática':   { icon: '📐', description: 'Estruturas e regras do inglês' },
  'Vocabulário': { icon: '📚', description: 'Palavras e expressões novas' },
  'Business':    { icon: '💼', description: 'Inglês para o ambiente profissional' },
  'Reading':     { icon: '📖', description: 'Interpretação de textos em inglês' },
  'Listening':   { icon: '🎧', description: 'Compreensão auditiva' },
  'Escrita':     { icon: '✍️', description: 'Produção textual em inglês' },
};

const LEVEL_META: Record<string, { icon: string; label: string; description: string }> = {
  A1: { icon: '🌱', label: 'Iniciante',     description: 'Primeiros passos no inglês' },
  A2: { icon: '🌿', label: 'Básico',        description: 'Comunicação simples do dia a dia' },
  B1: { icon: '⚡', label: 'Intermediário', description: 'Situações cotidianas com desenvoltura' },
  B2: { icon: '🔥', label: 'Avançado',      description: 'Discussões complexas com fluência' },
  C1: { icon: '👑', label: 'Fluente',       description: 'Domínio quase nativo do idioma' },
};

const CUSTOM_TOPIC_VALUE = '__custom__';

const SelectionScreen: React.FC<SelectionScreenProps> = ({ 
  user, onStart, onOpenStudyPlan, onStartPlacement, onOpenActivities, onOpenProfile, onOpenChallenges, onOpenChat, onOpenAdmin,
  isLoading, initialLevel = null, initialTheme = null, initialTopic = null, hasActivePlan, onUserUpdate
}) => {
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [selectedLevel, setSelectedLevel] = useState<Level | null>(initialLevel);
  const [selectedTheme, setSelectedTheme] = useState<Theme | null>(initialTheme);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(initialTopic);
  const [customTopicText, setCustomTopicText] = useState('');
  const [selectedMultiTopics, setSelectedMultiTopics] = useState<Set<string>>(new Set());
  const [leaderboardUsers, setLeaderboardUsers] = useState<{user: UserSession, periodXp: number}[]>([]);
  const [leaderboardFilter, setLeaderboardFilter] = useState<'Weekly' | 'Monthly' | 'Annual'>('Annual');
  const [voiceGender, setVoiceGender] = useState<VoiceGender>('Female');
  const [voiceAccent, setVoiceAccent] = useState<VoiceAccent>('American');
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [showTiersModal, setShowTiersModal] = useState(false);
  const [showAccessAlert, setShowAccessAlert] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(
    user.accessType === AccessType.CHALLENGE_ONLY && !localStorage.getItem(`welcome_seen_${user.userId}`)
  );
  const [viewProfileId, setViewProfileId] = useState<string | null>(null);

  const isChallengeOnly = user.accessType === AccessType.CHALLENGE_ONLY;
  const isAdmin = user.username.toLowerCase() === 'admin' || user.isAdmin === true;
  const today = new Date().toISOString().split('T')[0];
  const dailyCount = user.gamification.lastActivityDate === today ? user.gamification.dailyActivitiesCount : 0;
  const isLimitReached = !user.gamification.isPro && dailyCount >= DAILY_LIMIT;

  const placementCooldownStatus = useMemo(() => {
    if (!user.gamification.lastPlacementDate) return { canTake: true, daysLeft: 0 };
    const msSinceLast = Date.now() - user.gamification.lastPlacementDate;
    const daysSinceLast = msSinceLast / (1000 * 60 * 60 * 24);
    return { canTake: daysSinceLast >= PLACEMENT_COOLDOWN_DAYS, daysLeft: Math.ceil(PLACEMENT_COOLDOWN_DAYS - daysSinceLast) };
  }, [user.gamification.lastPlacementDate]);

  useEffect(() => {
    const loadData = async () => {
      const lbData = await api.getLeaderboardData(leaderboardFilter);
      setLeaderboardUsers(lbData);
    };
    loadData();
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

  const isMultiSelectTheme = selectedTheme === Theme.Reading || selectedTheme === Theme.Listening || selectedTheme === Theme.Writing;
  const needsVoiceConfig = selectedTheme === Theme.Listening || selectedTheme === Theme.Reading || selectedTheme === Theme.Business;

  const finalTopic = useMemo(() => {
    if (selectedTopic === CUSTOM_TOPIC_VALUE) return customTopicText.trim();
    if (isMultiSelectTheme) return Array.from(selectedMultiTopics).join(', ');
    return selectedTopic || '';
  }, [selectedTopic, customTopicText, isMultiSelectTheme, selectedMultiTopics]);

  const canAdvanceToStep3 = selectedTopic !== null && (selectedTopic !== CUSTOM_TOPIC_VALUE || customTopicText.trim().length > 2);

  const handleStartClick = async () => {
    if (isChallengeOnly) { setShowAccessAlert(true); return; }
    if (isLimitReached) { setShowLimitModal(true); return; }
    const newCount = await api.incrementActivityCount(user.userId);
    const updatedUser = { ...user, gamification: { ...user.gamification, dailyActivitiesCount: newCount, lastActivityDate: today } };
    onUserUpdate(updatedUser);
    onStart(selectedLevel!, selectedTheme!, finalTopic, voiceGender, voiceAccent);
  };

  const toggleMultiTopic = (topic: string) => {
    const newSet = new Set(selectedMultiTopics);
    if (newSet.has(topic)) newSet.delete(topic);
    else { if (newSet.size >= 2) return; newSet.add(topic); }
    setSelectedMultiTopics(newSet);
  };

  const userRank = leaderboardUsers.findIndex(u => u.user.userId === user.userId) + 1;
  const currentTierIndex = useMemo(() => TIER_THRESHOLDS.findIndex(t => user.gamification.xp >= t.min && user.gamification.xp <= t.max), [user.gamification.xp]);
  const currentTier = useMemo(() => TIER_THRESHOLDS[currentTierIndex] || TIER_THRESHOLDS[0], [currentTierIndex]);
  const nextTier = useMemo(() => TIER_THRESHOLDS[currentTierIndex + 1] || null, [currentTierIndex]);
  const progressPercentage = useMemo(() => {
    if (currentTier.tier === UserTier.Legend) return 100;
    return Math.min(100, Math.round(((user.gamification.xp - currentTier.min) / (currentTier.max - currentTier.min)) * 100));
  }, [currentTier, user.gamification.xp]);
  const xpToNextLevel = useMemo(() => nextTier ? nextTier.min - user.gamification.xp : 0, [nextTier, user.gamification.xp]);

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-8 animate-fade-in relative">
      {showWelcomeModal && (
        <div className="fixed inset-0 z-[500] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="bg-[#2a2a2a] w-full max-w-lg rounded-[2.5rem] border-2 border-[#f7931e]/50 p-10 text-center space-y-8 animate-pop shadow-[0_0_50px_rgba(247,147,30,0.3)]">
            <div className="w-24 h-24 bg-[#f7931e]/10 rounded-full flex items-center justify-center mx-auto"><Sparkles className="w-12 h-12 text-[#f7931e]" /></div>
            <div className="space-y-4">
              <h3 className="text-3xl font-black text-white uppercase tracking-tighter">Bem-vindo(a)!</h3>
              <p className="text-gray-300 text-sm leading-relaxed font-medium">Seja muito bem vindo(a) à plataforma de exercícios da Freedom. Como você não é nosso aluno, algumas funcionalidades estão limitadas, mas o Easter Challenge 40 dias está liberado para você!</p>
            </div>
            <button onClick={() => { setShowWelcomeModal(false); localStorage.setItem(`welcome_seen_${user.userId}`, 'true'); }} className="w-full py-5 bg-[#f7931e] text-[#222222] rounded-2xl font-black uppercase tracking-widest hover:scale-105 transition-transform shadow-xl shadow-[#f7931e]/20">Começar Agora</button>
          </div>
        </div>
      )}

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

      {isAdmin && (
        <button onClick={onOpenAdmin} className="fixed bottom-6 left-24 z-50 bg-[#222222] border-2 border-[#f7931e] text-[#f7931e] px-6 py-3 rounded-2xl font-black uppercase tracking-widest flex items-center gap-2 hover:bg-[#f7931e] hover:text-[#222222] transition-all shadow-2xl">
          <ShieldAlert className="w-5 h-5" /> Painel Admin
        </button>
      )}

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
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">{t.min.toLocaleString()} XP - {t.max === Infinity ? '∞' : t.max.toLocaleString()} XP</p>
                  </div>
                  {user.gamification.xp >= t.min && user.gamification.xp <= t.max && (
                    <div className="bg-[#f7931e] text-[#222222] text-[8px] font-black px-2 py-1 rounded uppercase tracking-widest">Atual</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showLimitModal && (
        <div className="fixed inset-0 z-[400] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="bg-[#2a2a2a] w-full max-w-md rounded-[2.5rem] border-2 border-[#f7931e]/50 p-8 text-center space-y-6 animate-pop">
            <div className="w-20 h-20 bg-[#f7931e]/10 rounded-full flex items-center justify-center mx-auto"><Lock className="w-10 h-10 text-[#f7931e]" /></div>
            <div className="space-y-2">
              <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Limite Diário Atingido</h3>
              <p className="text-gray-400 text-sm leading-relaxed">Parabéns! Você atingiu o máximo de {DAILY_LIMIT} atividades por hoje. Volte amanhã.</p>
            </div>
            <button onClick={() => setShowLimitModal(false)} className="w-full py-4 bg-[#f7931e] text-[#222222] rounded-2xl font-black uppercase tracking-widest hover:scale-105 transition-transform">Entendido</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <div className="lg:col-span-2 bg-[#2a2a2a] rounded-[2rem] border border-white/5 p-6 shadow-xl flex flex-col md:flex-row gap-6 items-center relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none"><UserIcon className="w-32 h-32 text-white" /></div>
          <div className="relative cursor-pointer shrink-0" onClick={() => onOpenProfile()}>
            <div className={`w-24 h-24 rounded-full border-4 ${currentTier.color.replace('text-', 'border-')} flex items-center justify-center bg-[#222222] shadow-lg overflow-hidden`}>
              {user.profilePhoto ? <img src={user.profilePhoto} alt="Profile" className="w-full h-full object-cover" /> : <div className={`${currentTier.color} transform scale-125`}>{currentTier.icon}</div>}
            </div>
            <div className="absolute -bottom-1 -right-1 bg-[#f7931e] text-[#222222] px-2 py-0.5 rounded-lg text-[9px] font-black shadow-lg">LV.{currentTierIndex + 1}</div>
          </div>
          <div className="flex-1 space-y-4 w-full">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <h3 className="text-xl font-black text-white flex items-center gap-2 truncate">
                  {user.userName}
                  {user.gamification.isPro && <span className="text-[8px] bg-[#f7931e] text-[#222222] px-1.5 py-0.5 rounded-md font-black tracking-widest">{isAdmin ? 'ADMIN' : 'PRO'}</span>}
                </h3>
                <p className={`text-[10px] font-black uppercase tracking-[0.2em] ${currentTier.color}`}>{currentTier.tier}</p>
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
              <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Ganho Hoje</p>
              <p className="text-xs font-black text-green-400">+{user.gamification.dailyXpEarned.toLocaleString()} XP</p>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Saldo Freedom Reais</p>
            <span className="text-2xl font-black text-white">{formatFR(user.gamification.frBalance)}</span>
          </div>
        </div>

        <div className="bg-[#2a2a2a] rounded-[2rem] border border-white/5 p-6 shadow-xl flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400"><Flame className="w-5 h-5" /></div>
            <div className="text-right">
              <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Ofensiva</p>
              <p className="text-xs font-black text-blue-400">Ativa</p>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Dias Seguidos</p>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-white">{user.gamification.streak}</span>
              <span className="text-gray-500 text-xs font-bold">dias</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button onClick={onOpenStudyPlan} className={`p-5 rounded-[2rem] border-2 transition-all flex flex-col items-center justify-center gap-3 group relative overflow-hidden ${hasActivePlan ? 'bg-[#f7931e]/10 border-[#f7931e]/50 hover:bg-[#f7931e]/20' : 'bg-[#2a2a2a] border-white/5 hover:border-[#f7931e]/50'}`}>
          <div className={`p-4 rounded-2xl ${hasActivePlan ? 'bg-[#f7931e] text-[#222222]' : 'bg-[#333333] text-[#f7931e] group-hover:bg-[#f7931e] group-hover:text-[#222222]'} transition-colors`}><Calendar className="w-6 h-6" /></div>
          <span className={`text-xs font-black uppercase tracking-widest ${hasActivePlan ? 'text-white' : 'text-gray-400 group-hover:text-white'}`}>Meu Plano</span>
          {hasActivePlan && <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-[#f7931e] animate-pulse" />}
        </button>

        <button onClick={onOpenActivities} className="p-5 bg-[#2a2a2a] rounded-[2rem] border border-white/5 hover:border-[#f7931e]/50 transition-all flex flex-col items-center justify-center gap-3 group">
          <div className="p-4 rounded-2xl bg-[#333333] text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-colors"><BookOpen className="w-6 h-6" /></div>
          <span className="text-xs font-black uppercase tracking-widest text-gray-400 group-hover:text-white">Histórico</span>
        </button>

        <button onClick={() => { if (isChallengeOnly) { setShowAccessAlert(true); return; } if (placementCooldownStatus.canTake) onStartPlacement(); }} className={`p-5 rounded-[2rem] border transition-all flex flex-col items-center justify-center gap-3 group relative ${!placementCooldownStatus.canTake ? 'bg-[#222222] border-white/5 opacity-70 cursor-not-allowed' : 'bg-[#2a2a2a] border-white/5 hover:border-[#f7931e]/50'}`}>
          <div className={`p-4 rounded-2xl transition-colors ${!placementCooldownStatus.canTake ? 'bg-[#333333] text-gray-600' : 'bg-[#333333] text-purple-400 group-hover:bg-purple-500 group-hover:text-white'}`}><Compass className="w-6 h-6" /></div>
          <span className={`text-xs font-black uppercase tracking-widest ${!placementCooldownStatus.canTake ? 'text-gray-600' : 'text-gray-400 group-hover:text-white'}`}>Nivelamento</span>
          {!placementCooldownStatus.canTake && (
            <div className="absolute inset-0 bg-[#222222]/80 backdrop-blur-sm flex flex-col items-center justify-center rounded-[2rem] p-2 text-center opacity-0 group-hover:opacity-100 transition-opacity">
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="bg-[#2a2a2a] p-6 md:p-8 rounded-[2.5rem] border border-white/5 shadow-xl">
            <h3 className="text-xl font-black text-white flex items-center gap-3 mb-6 uppercase tracking-tighter">
              <Play className="w-6 h-6 text-[#f7931e] fill-current" /> Nova Prática
            </h3>

            <div className="flex items-center gap-2 mb-6">
              {[1, 2, 3].map((s) => (
                <React.Fragment key={s}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black border-2 transition-all ${wizardStep > s ? 'bg-[#f7931e]/20 border-[#f7931e] text-[#f7931e]' : wizardStep === s ? 'bg-[#f7931e] border-[#f7931e] text-[#222222] shadow-[0_0_12px_rgba(247,147,30,0.4)]' : 'bg-[#222222] border-[#444444] text-gray-600'}`}>
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

            {wizardStep === 1 && (
              <div className="animate-fade-in">
                <p className="text-[10px] font-black text-[#f7931e] uppercase tracking-widest mb-1">Passo 1 de 3</p>
                <h3 className="text-lg font-black text-white uppercase tracking-tighter mb-1">Qual é o seu nível?</h3>
                <p className="text-[11px] text-gray-500 font-bold mb-5">Selecione o nível CEFR do seu inglês atual.</p>
                <div className="grid grid-cols-5 gap-2 mb-6">
                  {Object.values(Level).map((lvl) => {
                    const meta = LEVEL_META[lvl];
                    const isSelected = selectedLevel === lvl;
                    return (
                      <button key={lvl} onClick={() => setSelectedLevel(lvl)} className={`flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all ${isSelected ? 'bg-[#f7931e]/10 border-[#f7931e] shadow-[0_0_16px_rgba(247,147,30,0.25)]' : 'bg-[#222222] border-[#333333] hover:border-[#f7931e]/50'}`}>
                        <span className="text-2xl">{meta.icon}</span>
                        <span className={`text-sm font-black ${isSelected ? 'text-[#f7931e]' : 'text-white'}`}>{lvl}</span>
                        <span className={`text-[9px] font-bold uppercase tracking-wider text-center leading-tight ${isSelected ? 'text-[#f7931e]/80' : 'text-gray-600'}`}>{meta.label}</span>
                      </button>
                    );
                  })}
                </div>
                <button onClick={() => setWizardStep(2)} disabled={!selectedLevel} className="w-full py-4 bg-[#f7931e] text-[#222222] rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:scale-[1.02] transition-all shadow-xl shadow-[#f7931e]/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100">
                  Próximo — Habilidade <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {wizardStep === 2 && (
              <div className="animate-fade-in">
                <p className="text-[10px] font-black text-[#f7931e] uppercase tracking-widest mb-1">Passo 2 de 3</p>
                <h3 className="text-lg font-black text-white uppercase tracking-tighter mb-1">Qual habilidade?</h3>
                <p className="text-[11px] text-gray-500 font-bold mb-5">Escolha em qual área você quer praticar hoje.</p>
                <div className="grid grid-cols-3 gap-2 mb-6">
                  {availableThemes.map((thm) => {
                    const meta = THEME_META[thm] || { icon: '📝', description: '' };
                    const isSelected = selectedTheme === thm;
                    return (
                      <button key={thm} onClick={() => setSelectedTheme(thm)} className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all text-center ${isSelected ? 'bg-[#f7931e]/10 border-[#f7931e] shadow-[0_0_16px_rgba(247,147,30,0.25)]' : 'bg-[#222222] border-[#333333] hover:border-[#f7931e]/50'}`}>
                        <span className="text-2xl">{meta.icon}</span>
                        <span className={`text-[11px] font-black uppercase tracking-tight ${isSelected ? 'text-[#f7931e]' : 'text-white'}`}>{thm}</span>
                        <span className={`text-[9px] font-medium leading-tight ${isSelected ? 'text-[#f7931e]/70' : 'text-gray-600'}`}>{meta.description}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setWizardStep(1)} className="px-5 py-4 bg-[#333333] text-gray-400 rounded-2xl font-black uppercase tracking-widest text-xs hover:text-white transition-all border border-white/5">← Voltar</button>
                  <button onClick={() => setWizardStep(3)} disabled={!selectedTheme} className="flex-1 py-4 bg-[#f7931e] text-[#222222] rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:scale-[1.02] transition-all shadow-xl shadow-[#f7931e]/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100">
                    Próximo — Tópico <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {wizardStep === 3 && (
              <div className="animate-fade-in">
                <p className="text-[10px] font-black text-[#f7931e] uppercase tracking-widest mb-1">Passo 3 de 3</p>
                <h3 className="text-lg font-black text-white uppercase tracking-tighter mb-1">Escolha o tópico</h3>
                <p className="text-[11px] text-gray-500 font-bold mb-4">{isMultiSelectTheme ? 'Selecione até 2 tópicos para combinar.' : 'Selecione o assunto que quer praticar.'}</p>

                {needsVoiceConfig && (
                  <div className="grid grid-cols-2 gap-3 mb-4 p-3 bg-[#222222] rounded-2xl border border-[#333333]">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-1"><Mic className="w-3 h-3" /> Voz</label>
                      <select value={voiceGender} onChange={(e) => setVoiceGender(e.target.value as VoiceGender)} className="w-full bg-[#333333] border border-[#444444] text-white p-2 rounded-xl font-bold text-xs outline-none focus:border-[#f7931e]">
                        <option value="Female">Feminino</option>
                        <option value="Male">Masculino</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-1"><Globe className="w-3 h-3" /> Sotaque</label>
                      <select value={voiceAccent} onChange={(e) => setVoiceAccent(e.target.value as VoiceAccent)} className="w-full bg-[#333333] border border-[#444444] text-white p-2 rounded-xl font-bold text-xs outline-none focus:border-[#f7931e]">
                        <option value="American">Americano</option>
                        <option value="British">Britânico</option>
                        <option value="Australian">Australiano</option>
                        <option value="Indian">Indiano</option>
                      </select>
                    </div>
                  </div>
                )}

                <div className="max-h-[220px] overflow-y-auto pr-1 mb-3 space-y-1.5 custom-scrollbar">
                  {availableTopics.map((topic) => {
                    const isSelected = isMultiSelectTheme ? selectedMultiTopics.has(topic) : selectedTopic === topic;
                    const isDisabled = isMultiSelectTheme && selectedMultiTopics.size >= 2 && !selectedMultiTopics.has(topic);
                    return (
                      <button key={topic} disabled={isDisabled} onClick={() => { if (isMultiSelectTheme) toggleMultiTopic(topic); else { setSelectedTopic(topic); setCustomTopicText(''); } }} className={`w-full text-left px-4 py-3 rounded-xl border-2 flex items-center justify-between transition-all text-xs font-bold ${isSelected ? 'bg-[#f7931e]/10 border-[#f7931e] text-white' : isDisabled ? 'bg-[#222222] border-[#333333] text-gray-700 cursor-not-allowed' : 'bg-[#222222] border-[#333333] text-gray-400 hover:border-[#f7931e]/50 hover:text-white'}`}>
                        <span>{topic}</span>
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isSelected ? 'bg-[#f7931e]' : 'bg-[#444444]'}`} />
                      </button>
                    );
                  })}

                  <button onClick={() => { setSelectedTopic(CUSTOM_TOPIC_VALUE); setSelectedMultiTopics(new Set()); }} className={`w-full text-left px-4 py-3 rounded-xl border-2 flex items-center justify-between transition-all text-xs font-black ${selectedTopic === CUSTOM_TOPIC_VALUE ? 'bg-[#f7931e]/10 border-[#f7931e] text-[#f7931e]' : 'bg-[#222222] border-dashed border-[#f7931e]/40 text-[#f7931e]/70 hover:border-[#f7931e] hover:text-[#f7931e]'}`}>
                    <span className="flex items-center gap-2"><PenLine className="w-3.5 h-3.5" /> Tópico Personalizado</span>
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${selectedTopic === CUSTOM_TOPIC_VALUE ? 'bg-[#f7931e]' : 'bg-[#f7931e]/30'}`} />
                  </button>
                </div>

                {selectedTopic === CUSTOM_TOPIC_VALUE && (
                  <div className="mb-3 animate-fade-in">
                    <input type="text" autoFocus value={customTopicText} onChange={(e) => setCustomTopicText(e.target.value)} placeholder="Ex: Vocabulário de medicina, Phrasal verbs de negócios..." className="w-full bg-[#222222] border-2 border-[#f7931e]/50 focus:border-[#f7931e] text-white rounded-xl px-4 py-3 text-xs font-bold outline-none placeholder-gray-600 transition-all" />
                    <p className="text-[9px] text-gray-600 font-bold uppercase tracking-wider mt-1.5 ml-1">Descreva o assunto que você quer praticar em inglês.</p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button onClick={() => setWizardStep(2)} className="px-5 py-4 bg-[#333333] text-gray-400 rounded-2xl font-black uppercase tracking-widest text-xs hover:text-white transition-all border border-white/5">← Voltar</button>
                  <button onClick={handleStartClick} disabled={!canAdvanceToStep3 || isLoading || (isMultiSelectTheme && selectedMultiTopics.size === 0)} className="flex-1 py-4 bg-[#f7931e] text-[#222222] rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:scale-[1.02] transition-all shadow-xl shadow-[#f7931e]/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100">
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                    {isLoading ? 'Gerando...' : 'Iniciar Prática'}
                  </button>
                </div>
              </div>
            )}

            {isLimitReached && <p className="text-center text-red-500 text-[10px] font-bold uppercase tracking-widest mt-4 flex items-center justify-center gap-2"><AlertTriangle className="w-3 h-3" /> Limite diário de atividades atingido</p>}
            {isChallengeOnly && <p className="text-center text-red-500 text-[10px] font-bold uppercase tracking-widest mt-4 flex items-center justify-center gap-2"><Lock className="w-3 h-3" /> Crie um Plano de Estudos para acessar</p>}
          </div>
        </div>

        <div className="bg-[#2a2a2a] p-6 md:p-8 rounded-[2.5rem] border border-white/5 shadow-xl flex flex-col max-h-[600px]">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-black text-white flex items-center gap-2 uppercase tracking-tighter"><Trophy className="w-5 h-5 text-yellow-400" /> Leaderboard</h3>
            <select value={leaderboardFilter} onChange={(e) => setLeaderboardFilter(e.target.value as any)} className="bg-[#222222] border border-white/10 text-gray-400 text-[10px] font-black uppercase tracking-widest rounded-xl p-2 outline-none focus:border-[#f7931e]">
              <option value="Weekly">Semana</option>
              <option value="Monthly">Mês</option>
              <option value="Annual">Ano</option>
            </select>
          </div>
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
            {leaderboardUsers.map((lbUser, index) => {
              const isCurrentUser = lbUser.user.userId === user.userId;
              let rankStyle = "bg-[#333333] text-gray-400 border-white/5";
              if (index === 0) rankStyle = "bg-yellow-400/10 text-yellow-400 border-yellow-400/30";
              else if (index === 1) rankStyle = "bg-slate-300/10 text-slate-300 border-slate-300/30";
              else if (index === 2) rankStyle = "bg-amber-700/10 text-amber-600 border-amber-700/30";
              return (
                <div key={lbUser.user.userId} onClick={() => setViewProfileId(lbUser.user.userId)} className={`flex items-center justify-between p-4 rounded-2xl border transition-all cursor-pointer hover:bg-white/5 ${isCurrentUser ? 'border-[#f7931e]/50' : rankStyle}`}>
                  <div className="flex items-center gap-3">
                    <span className="font-black text-sm w-4 text-center">{index + 1}</span>
                    <div className="w-10 h-10 rounded-full bg-[#222222] overflow-hidden border border-white/10 flex-shrink-0">
                      {lbUser.user.profilePhoto ? <img src={lbUser.user.profilePhoto} className="w-full h-full object-cover" /> : <UserIcon className="w-5 h-5 m-auto text-gray-500 mt-2" />}
                    </div>
                    <div className="max-w-[100px] md:max-w-[120px]">
                      <p className={`text-xs font-black truncate ${isCurrentUser ? 'text-[#f7931e]' : 'text-white'}`}>{lbUser.user.username}</p>
                      <p className="text-[9px] text-gray-500 font-bold uppercase truncate">{lbUser.user.fullName}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-black text-sm">{lbUser.periodXp.toLocaleString()}</span>
                    <p className="text-[8px] text-gray-500 font-black uppercase tracking-widest">XP</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="pt-4 mt-4 border-t border-white/5 text-center">
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Sua Posição: <span className="text-[#f7931e]">#{userRank}</span></p>
          </div>
        </div>
      </div>

      {viewProfileId && (
        <ProfileViewModal currentUser={user} targetUserId={viewProfileId} onClose={() => setViewProfileId(null)} onOpenChat={(id) => { setViewProfileId(null); onOpenChat(id); }} onOpenChallenge={() => { setViewProfileId(null); onOpenChallenges(); }} onUserUpdate={onUserUpdate} />
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
