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
  ArrowRight, BarChart, AlertTriangle, Lock, Key, ArrowLeft, Camera, Edit2, HelpCircle, ChevronRight, Mic, BookText, ListChecks, Coins, Gift, Wallet, ArrowUpRight, ShieldAlert, Bell, Compass
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

const SelectionScreen: React.FC<SelectionScreenProps> = ({ 
  user,
  onStart,
  onOpenStudyPlan,
  onStartPlacement,
  onOpenActivities,
  onOpenProfile,
  onOpenChallenges,
  onOpenChat,
  onOpenAdmin,
  isLoading,
  initialLevel = null,
  initialTheme = null,
  initialTopic = null,
  hasActivePlan,
  onUserUpdate
}) => {
  const [selectedLevel, setSelectedLevel] = useState<Level | null>(initialLevel);
  const [selectedTheme, setSelectedTheme] = useState<Theme | null>(initialTheme);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [selectedMultiTopics, setSelectedMultiTopics] = useState<Set<string>>(new Set());
  
  const [leaderboardUsers, setLeaderboardUsers] = useState<{user: UserSession, periodXp: number}[]>([]);
  const [leaderboardFilter, setLeaderboardFilter] = useState<'Weekly' | 'Monthly' | 'Annual'>('Annual');
  
  const [voiceGender, setVoiceGender] = useState<VoiceGender>('Female');
  const [voiceAccent, setVoiceAccent] = useState<VoiceAccent>('American');

  const [showLimitModal, setShowLimitModal] = useState(false);
  const [showTiersModal, setShowTiersModal] = useState(false);
  const [showAccessAlert, setShowAccessAlert] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(user.accessType === AccessType.CHALLENGE_ONLY && !localStorage.getItem(`welcome_seen_${user.userId}`));
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
    const canTake = daysSinceLast >= PLACEMENT_COOLDOWN_DAYS;
    const daysLeft = Math.ceil(PLACEMENT_COOLDOWN_DAYS - daysSinceLast);
    return { canTake, daysLeft };
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

  const toggleMultiTopic = (topic: string) => {
    const newSet = new Set(selectedMultiTopics);
    if (newSet.has(topic)) {
      newSet.delete(topic);
    } else {
      if (newSet.size >= 2) return;
      newSet.add(topic);
    }
    setSelectedMultiTopics(newSet);
  };

  const getUserTierInfo = (xp: number) => {
    return TIER_THRESHOLDS.find(t => xp >= t.min && xp <= t.max) || TIER_THRESHOLDS[0];
  };

  const currentTierIndex = useMemo(() => {
    return TIER_THRESHOLDS.findIndex(t => user.gamification.xp >= t.min && user.gamification.xp <= t.max);
  }, [user.gamification.xp]);

  const currentTier = useMemo(() => {
    return TIER_THRESHOLDS[currentTierIndex] || TIER_THRESHOLDS[0];
  }, [currentTierIndex]);

  const nextTier = useMemo(() => {
    return TIER_THRESHOLDS[currentTierIndex + 1] || null;
  }, [currentTierIndex]);

  const progressPercentage = useMemo(() => {
    if (currentTier.tier === UserTier.Legend) return 100;
    const range = currentTier.max - currentTier.min;
    const relativeXp = user.gamification.xp - currentTier.min;
    return Math.min(100, Math.round((relativeXp / range) * 100));
  }, [currentTier, user.gamification.xp]);

  const xpToNextLevel = useMemo(() => {
    if (!nextTier) return 0;
    return nextTier.min - user.gamification.xp;
  }, [nextTier, user.gamification.xp]);

  const handleStartClick = async () => {
    if (isChallengeOnly) {
      setShowAccessAlert(true);
      return;
    }
    if (isLimitReached) {
      setShowLimitModal(true);
      return;
    }

    const newCount = await api.incrementActivityCount(user.userId);
    const updatedUser = { ...user, gamification: { ...user.gamification, dailyActivitiesCount: newCount, lastActivityDate: today } };
    onUserUpdate(updatedUser);

    let finalTopic = isMultiSelectTheme ? Array.from(selectedMultiTopics).join(", ") : (selectedTopic || "");
    onStart(selectedLevel!, selectedTheme!, finalTopic, voiceGender, voiceAccent);
  };

  const userRank = leaderboardUsers.findIndex(u => u.user.userId === user.userId) + 1;
  const canStart = selectedLevel && selectedTheme && (isMultiSelectTheme ? selectedMultiTopics.size > 0 : selectedTopic) && !isLimitReached;

  const handleMarkRead = async (notifId: string) => {
    await api.markNotificationRead(user.userId, notifId);
    const updatedNotifs = user.notifications?.map(n => n.id === notifId ? { ...n, read: true } : n);
    onUserUpdate({ ...user, notifications: updatedNotifs });
  };

  const unreadNotifs = user.notifications?.filter(n => !n.read) || [];

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-8 animate-fade-in relative">
      
      {/* Welcome Modal for Challenge Only Users */}
      {showWelcomeModal && (
        <div className="fixed inset-0 z-[500] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="bg-[#2a2a2a] w-full max-w-lg rounded-[2.5rem] border-2 border-[#f7931e]/50 p-10 text-center space-y-8 animate-pop shadow-[0_0_50px_rgba(247,147,30,0.3)]">
            <div className="w-24 h-24 bg-[#f7931e]/10 rounded-full flex items-center justify-center mx-auto">
              <Sparkles className="w-12 h-12 text-[#f7931e]" />
            </div>
            <div className="space-y-4">
              <h3 className="text-3xl font-black text-white uppercase tracking-tighter">Bem-vindo(a)!</h3>
              <p className="text-gray-300 text-sm leading-relaxed font-medium">
                Seja muito bem vindo(a) à plataforma de exercícios da Freedom, como você não é nosso aluno, algumas funcionalidades da plataforma estão limitadas, mas o desafio Easter Challenge 40 dias está liberado para você, basta você clicar em Plano de estudos, selecionar seu nível e disponibilidade e, em seguida, clique em Challenge Mode, em questão de segundos o seu desafio estará pronto. Good Luck!!
              </p>
            </div>
            <button 
              onClick={() => {
                setShowWelcomeModal(false);
                localStorage.setItem(`welcome_seen_${user.userId}`, 'true');
              }}
              className="w-full py-5 bg-[#f7931e] text-[#222222] rounded-2xl font-black uppercase tracking-widest hover:scale-105 transition-transform shadow-xl shadow-[#f7931e]/20"
            >
              Começar Agora
            </button>
          </div>
        </div>
      )}

      {/* Access Alert Modal */}
      {showAccessAlert && (
        <div className="fixed inset-0 z-[500] bg-black/80 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setShowAccessAlert(false)}>
          <div className="bg-[#2a2a2a] w-full max-w-sm rounded-[2rem] border border-red-500/30 p-8 text-center space-y-6 animate-pop" onClick={e => e.stopPropagation()}>
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto">
              <ShieldAlert className="w-8 h-8 text-red-500" />
            </div>
            <h4 className="text-xl font-black text-white uppercase tracking-tighter">Acesso Restrito</h4>
            <p className="text-gray-400 text-sm font-medium">Funcionalidade exclusiva para alunos Freedom</p>
            <button 
              onClick={() => setShowAccessAlert(false)}
              className="w-full py-4 bg-white/5 text-white rounded-xl font-black uppercase tracking-widest hover:bg-white/10 transition-all"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
      
      {/* Admin Action Button */}
      {isAdmin && (
        <button 
          onClick={onOpenAdmin}
          className="fixed bottom-6 left-24 z-50 bg-[#222222] border-2 border-[#f7931e] text-[#f7931e] px-6 py-3 rounded-2xl font-black uppercase tracking-widest flex items-center gap-2 hover:bg-[#f7931e] hover:text-[#222222] transition-all shadow-2xl"
        >
          <ShieldAlert className="w-5 h-5" /> Painel Admin
        </button>
      )}

      {/* Modal Patentes Freedom */}
      {showTiersModal && (
        <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#2a2a2a] w-full max-w-lg rounded-[2.5rem] border border-white/5 shadow-2xl overflow-hidden animate-pop">
            <div className="p-8 border-b border-white/5 flex justify-between items-center bg-[#222222]">
              <h3 className="text-2xl font-black text-white flex items-center gap-3">
                <Shield className="w-6 h-6 text-[#f7931e]" /> Patentes Freedom
              </h3>
              <button onClick={() => setShowTiersModal(false)} className="text-gray-500 hover:text-white transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-8 space-y-4 max-h-[60vh] overflow-y-auto scrollbar-hide">
              {TIER_THRESHOLDS.map((t, i) => (
                <div key={i} className="bg-[#222222] p-5 rounded-2xl border border-white/5 flex items-center gap-5">
                  <div className={`w-14 h-14 rounded-full ${t.bg} flex items-center justify-center ${t.color} border border-white/5 shadow-inner`}>
                    {t.icon}
                  </div>
                  <div className="flex-1">
                    <h4 className={`font-black text-sm uppercase tracking-widest ${t.color}`}>{t.tier}</h4>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">
                      {t.min.toLocaleString()} XP - {t.max === Infinity ? '∞' : t.max.toLocaleString()} XP
                    </p>
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

      {/* Modal de Limite Atingido */}
      {showLimitModal && (
        <div className="fixed inset-0 z-[400] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="bg-[#2a2a2a] w-full max-w-md rounded-[2.5rem] border-2 border-[#f7931e]/50 p-8 text-center space-y-6 animate-pop shadow-[0_0_50px_rgba(247,147,30,0.2)]">
            <div className="w-20 h-20 bg-[#f7931e]/10 rounded-full flex items-center justify-center mx-auto">
              <Lock className="w-10 h-10 text-[#f7931e]" />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Limite Diário Atingido</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Parabéns! Você atingiu o máximo de {DAILY_LIMIT} atividades por hoje. Volte amanhã para praticar mais.
              </p>
            </div>
            <button 
              onClick={() => setShowLimitModal(false)}
              className="w-full py-4 bg-[#f7931e] text-[#222222] rounded-2xl font-black uppercase tracking-widest hover:scale-105 transition-transform"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <div className="lg:col-span-2 bg-[#2a2a2a] rounded-[2rem] border border-white/5 p-6 shadow-xl flex flex-col md:flex-row gap-6 items-center relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none transform group-hover:scale-110 transition-transform">
            <UserIcon className="w-32 h-32 text-white" />
          </div>
          
          {/* 💡 CORREÇÃO: O clique no ícone de perfil SEMPRE abre o modal, sem restrições */}
          <div className="relative cursor-pointer shrink-0" onClick={() => onOpenProfile()}>
            <div className={`w-24 h-24 rounded-full border-4 ${currentTier.color.replace('text-', 'border-')} flex items-center justify-center bg-[#222222] shadow-lg shadow-black/40 overflow-hidden relative group-hover:border-[#f7931e] transition-colors`}>
              {user.profilePhoto ? (
                <img src={user.profilePhoto} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <div className={`${currentTier.color} transform scale-125`}>
                  {currentTier.icon}
                </div>
              )}
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Edit2 className="w-5 h-5 text-white" />
              </div>
            </div>
            <div className="absolute -bottom-1 -right-1 bg-[#f7931e] text-[#222222] px-2 py-0.5 rounded-lg text-[9px] font-black shadow-lg">
              LV.{currentTierIndex + 1}
            </div>
          </div>

          <div className="flex-1 space-y-4 w-full">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <h3 className="text-xl font-black text-white flex items-center gap-2 truncate">
                  {user.userName}
                  {user.gamification.isPro && <span className="text-[8px] bg-[#f7931e] text-[#222222] px-1.5 py-0.5 rounded-md font-black tracking-widest">{isAdmin ? 'ADMIN' : 'PRO'}</span>}
                </h3>
                <p className={`text-[10px] font-black uppercase tracking-[0.2em] ${currentTier.color}`}>
                  {currentTier.tier}
                </p>
              </div>
              <button 
                onClick={() => setShowTiersModal(true)}
                className="p-2 bg-white/5 rounded-xl text-gray-400 hover:text-[#f7931e] transition-all"
              >
                <Info className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-[8px] font-black uppercase tracking-widest text-gray-500">
                <span>{user.gamification.xp.toLocaleString()} XP</span>
                {nextTier && <span className="text-white/60">Faltam {xpToNextLevel.toLocaleString()} XP</span>}
              </div>
              <div className="h-2 w-full bg-black/40 rounded-full overflow-hidden border border-white/5">
                <div 
                  className={`h-full bg-[#f7931e] transition-all duration-1000 shadow-[0_0_15px_rgba(247,147,30,0.3)]`} 
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-[#2a2a2a] rounded-[2rem] border border-white/5 p-6 shadow-xl flex flex-col justify-between group">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center text-green-400">
              <Wallet className="w-5 h-5" />
            </div>
            <div className="text-right">
              <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Ganho Hoje</p>
              <p className="text-xs font-black text-green-400">+{user.gamification.dailyXpEarned.toLocaleString()} XP</p>
            </div>
          </div>
          
          <div className="space-y-1">
            <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Saldo Freedom Reais</p>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-white">{formatFR(user.gamification.frBalance)}</span>
              <ArrowUpRight className="w-4 h-4 text-[#f7931e] opacity-0 group-hover:opacity-100 transition-all translate-y-1 group-hover:translate-y-0" />
            </div>
          </div>
        </div>

        <div className="bg-[#2a2a2a] rounded-[2rem] border border-white/5 p-6 shadow-xl flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Flame className="w-5 h-5" />
            </div>
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
        <button 
          onClick={onOpenStudyPlan}
          className={`p-5 rounded-[2rem] border-2 transition-all flex flex-col items-center justify-center gap-3 group relative overflow-hidden ${hasActivePlan ? 'bg-[#f7931e]/10 border-[#f7931e]/50 hover:bg-[#f7931e]/20' : 'bg-[#2a2a2a] border-white/5 hover:border-[#f7931e]/50'}`}
        >
          <div className={`p-4 rounded-2xl ${hasActivePlan ? 'bg-[#f7931e] text-[#222222] shadow-[0_0_20px_rgba(247,147,30,0.4)]' : 'bg-[#333333] text-[#f7931e] group-hover:bg-[#f7931e] group-hover:text-[#222222]'} transition-colors`}>
            <Calendar className="w-6 h-6" />
          </div>
          <span className={`text-xs font-black uppercase tracking-widest ${hasActivePlan ? 'text-white' : 'text-gray-400 group-hover:text-white'}`}>Meu Plano</span>
          {hasActivePlan && <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-[#f7931e] animate-pulse" />}
        </button>

        <button 
          onClick={onOpenActivities}
          className="p-5 bg-[#2a2a2a] rounded-[2rem] border border-white/5 hover:border-[#f7931e]/50 transition-all flex flex-col items-center justify-center gap-3 group"
        >
          <div className="p-4 rounded-2xl bg-[#333333] text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-colors">
            <BookOpen className="w-6 h-6" />
          </div>
          <span className="text-xs font-black uppercase tracking-widest text-gray-400 group-hover:text-white">Histórico</span>
        </button>

        <button 
          onClick={() => {
            if (isChallengeOnly) {
              setShowAccessAlert(true);
              return;
            }
            if (placementCooldownStatus.canTake) onStartPlacement();
          }}
          className={`p-5 rounded-[2rem] border transition-all flex flex-col items-center justify-center gap-3 group relative
            ${!placementCooldownStatus.canTake ? 'bg-[#222222] border-white/5 opacity-70 cursor-not-allowed' : 'bg-[#2a2a2a] border-white/5 hover:border-[#f7931e]/50'}
          `}
        >
          <div className={`p-4 rounded-2xl transition-colors ${!placementCooldownStatus.canTake ? 'bg-[#333333] text-gray-600' : 'bg-[#333333] text-purple-400 group-hover:bg-purple-500 group-hover:text-white'}`}>
            <Compass className="w-6 h-6" />
          </div>
          <span className={`text-xs font-black uppercase tracking-widest ${!placementCooldownStatus.canTake ? 'text-gray-600' : 'text-gray-400 group-hover:text-white'}`}>Nivelamento</span>
          
          {!placementCooldownStatus.canTake && (
            <div className="absolute inset-0 bg-[#222222]/80 backdrop-blur-sm flex flex-col items-center justify-center rounded-[2rem] p-2 text-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Clock className="w-4 h-4 text-gray-400 mb-1" />
              <p className="text-[8px] font-black uppercase text-gray-400">Disponível em</p>
              <p className="text-[#f7931e] font-black text-xs">{placementCooldownStatus.daysLeft} dias</p>
            </div>
          )}
        </button>

        <button 
          onClick={onOpenChallenges}
          className="p-5 bg-[#2a2a2a] rounded-[2rem] border border-white/5 hover:border-[#f7931e]/50 transition-all flex flex-col items-center justify-center gap-3 group"
        >
          <div className="p-4 rounded-2xl bg-[#333333] text-red-400 group-hover:bg-red-500 group-hover:text-white transition-colors">
            <Sword className="w-6 h-6" />
          </div>
          <span className="text-xs font-black uppercase tracking-widest text-gray-400 group-hover:text-white">Desafios</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-[#2a2a2a] p-6 md:p-8 rounded-[2.5rem] border border-white/5 shadow-xl">
            <h3 className="text-xl font-black text-white flex items-center gap-3 mb-6 uppercase tracking-tighter">
              <Play className="w-6 h-6 text-[#f7931e] fill-current" /> Nova Prática
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-2 flex items-center gap-2">
                  <BarChart className="w-3 h-3" /> Nível CEFR
                </label>
                <select 
                  value={selectedLevel || ''} 
                  onChange={(e) => setSelectedLevel(e.target.value as Level)}
                  className="w-full bg-[#222222] border border-[#444444] text-white p-4 rounded-2xl font-bold appearance-none outline-none focus:border-[#f7931e] focus:ring-1 focus:ring-[#f7931e]/50 transition-all shadow-inner"
                >
                  <option value="" disabled>Selecione seu nível</option>
                  {Object.values(Level).map((lvl) => (
                    <option key={lvl} value={lvl}>{lvl}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-2 flex items-center gap-2">
                  <Layers className="w-3 h-3" /> Habilidade
                </label>
                <select 
                  value={selectedTheme || ''} 
                  onChange={(e) => setSelectedTheme(e.target.value as Theme)}
                  disabled={!selectedLevel}
                  className="w-full bg-[#222222] border border-[#444444] text-white p-4 rounded-2xl font-bold appearance-none outline-none focus:border-[#f7931e] focus:ring-1 focus:ring-[#f7931e]/50 transition-all shadow-inner disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="" disabled>Selecione a habilidade</option>
                  {availableThemes.map((thm) => (
                    <option key={thm} value={thm}>{thm}</option>
                  ))}
                </select>
              </div>
            </div>

            {selectedLevel && selectedTheme && (
              <div className="space-y-6 animate-fade-in border-t border-white/5 pt-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-2 flex items-center gap-2">
                    <Target className="w-3 h-3" /> 
                    {isMultiSelectTheme ? "Tópicos de Foco (Escolha até 2)" : "Tópico Específico"}
                  </label>
                  
                  {isMultiSelectTheme ? (
                    <div className="bg-[#222222] border border-[#444444] rounded-2xl p-2 max-h-[250px] overflow-y-auto custom-scrollbar shadow-inner">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {grammarTopics.map(topic => (
                          <button
                            key={topic}
                            onClick={() => toggleMultiTopic(topic)}
                            className={`p-3 rounded-xl text-left text-[11px] font-bold transition-all border ${
                              selectedMultiTopics.has(topic) 
                                ? 'bg-[#f7931e]/10 border-[#f7931e] text-[#f7931e]' 
                                : 'bg-[#333333] border-transparent text-gray-400 hover:text-white hover:bg-[#444444]'
                            } ${selectedMultiTopics.size >= 2 && !selectedMultiTopics.has(topic) ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            {topic}
                          </button>
                        ))}
                        {vocabTopics.map(topic => (
                          <button
                            key={topic}
                            onClick={() => toggleMultiTopic(topic)}
                            className={`p-3 rounded-xl text-left text-[11px] font-bold transition-all border ${
                              selectedMultiTopics.has(topic) 
                                ? 'bg-blue-500/10 border-blue-500 text-blue-400' 
                                : 'bg-[#333333] border-transparent text-gray-400 hover:text-white hover:bg-[#444444]'
                            } ${selectedMultiTopics.size >= 2 && !selectedMultiTopics.has(topic) ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            {topic}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <select 
                      value={selectedTopic || ''} 
                      onChange={(e) => setSelectedTopic(e.target.value)}
                      className="w-full bg-[#222222] border border-[#444444] text-white p-4 rounded-2xl font-bold appearance-none outline-none focus:border-[#f7931e] focus:ring-1 focus:ring-[#f7931e]/50 transition-all shadow-inner"
                    >
                      <option value="" disabled>Selecione um tópico específico</option>
                      {availableTopics.map((topic) => (
                        <option key={topic} value={topic}>{topic}</option>
                      ))}
                    </select>
                  )}
                </div>

                {needsVoiceConfig && (
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-2 flex items-center gap-2">
                        <Mic className="w-3 h-3" /> Gênero da Voz
                      </label>
                      <select 
                        value={voiceGender} 
                        onChange={(e) => setVoiceGender(e.target.value as VoiceGender)}
                        className="w-full bg-[#222222] border border-[#444444] text-white p-3 rounded-xl font-bold appearance-none outline-none focus:border-[#f7931e] text-xs shadow-inner"
                      >
                        <option value="Female">Feminino</option>
                        <option value="Male">Masculino</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-2 flex items-center gap-2">
                        <Globe className="w-3 h-3" /> Sotaque
                      </label>
                      <select 
                        value={voiceAccent} 
                        onChange={(e) => setVoiceAccent(e.target.value as VoiceAccent)}
                        className="w-full bg-[#222222] border border-[#444444] text-white p-3 rounded-xl font-bold appearance-none outline-none focus:border-[#f7931e] text-xs shadow-inner"
                      >
                        <option value="American">Americano</option>
                        <option value="British">Britânico</option>
                        <option value="Australian">Australiano</option>
                        <option value="Indian">Indiano</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            )}

            <button 
              onClick={handleStartClick}
              disabled={!canStart || isLoading}
              className={`mt-8 w-full py-5 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 transition-all ${
                canStart && !isLoading
                  ? 'bg-[#f7931e] text-[#222222] hover:scale-105 shadow-xl shadow-[#f7931e]/20' 
                  : 'bg-[#333333] text-gray-600 cursor-not-allowed'
              }`}
            >
              {isLoading ? (
                <><Loader2 className="w-6 h-6 animate-spin" /> Gerando Conteúdo...</>
              ) : (
                <><Play className="w-6 h-6 fill-current" /> Iniciar Prática</>
              )}
            </button>
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

        <div className="bg-[#2a2a2a] p-6 md:p-8 rounded-[2.5rem] border border-white/5 shadow-xl flex flex-col max-h-[600px]">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-black text-white flex items-center gap-2 uppercase tracking-tighter">
              <Trophy className="w-5 h-5 text-yellow-400" /> Leaderboard
            </h3>
            <select 
              value={leaderboardFilter}
              onChange={(e) => setLeaderboardFilter(e.target.value as any)}
              className="bg-[#222222] border border-white/10 text-gray-400 text-[10px] font-black uppercase tracking-widest rounded-xl p-2 outline-none focus:border-[#f7931e]"
            >
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
                <div 
                  key={lbUser.user.userId} 
                  onClick={() => setViewProfileId(lbUser.user.userId)}
                  className={`flex items-center justify-between p-4 rounded-2xl border transition-all cursor-pointer hover:bg-white/5 ${isCurrentUser ? 'border-[#f7931e]/50 shadow-[0_0_15px_rgba(247,147,30,0.1)]' : rankStyle}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-black text-sm w-4 text-center">
                      {index + 1}
                    </span>
                    <div className="w-10 h-10 rounded-full bg-[#222222] overflow-hidden border border-white/10 flex-shrink-0">
                      {lbUser.user.profilePhoto ? (
                        <img src={lbUser.user.profilePhoto} className="w-full h-full object-cover" />
                      ) : (
                        <UserIcon className="w-5 h-5 m-auto text-gray-500 mt-2" />
                      )}
                    </div>
                    <div className="max-w-[100px] md:max-w-[120px]">
                      <p className={`text-xs font-black truncate ${isCurrentUser ? 'text-[#f7931e]' : 'text-white'}`}>
                        {lbUser.user.username}
                      </p>
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
             <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
               Sua Posição: <span className="text-[#f7931e]">#{userRank}</span>
             </p>
          </div>
        </div>
      </div>

      {viewProfileId && (
        <ProfileViewModal
          currentUser={user}
          targetUserId={viewProfileId}
          onClose={() => setViewProfileId(null)}
          onOpenChat={(id) => { setViewProfileId(null); onOpenChat(id); }}
          onOpenChallenge={() => { setViewProfileId(null); onOpenChallenges(); }}
          onUserUpdate={onUserUpdate}
        />
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #333333;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #f7931e;
        }
      `}</style>
    </div>
  );
};

export default SelectionScreen;
