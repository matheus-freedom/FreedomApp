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
  ArrowRight, BarChart, AlertTriangle, Lock, Key, ArrowLeft, Camera, Edit2, HelpCircle, ChevronRight, Mic, BookText, ListChecks, Coins, Gift, Wallet, ArrowUpRight, ShieldAlert, Bell
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

  const isAdmin = user.username.toLowerCase() === 'admin';
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
          
          {/* 💡 CORREÇÃO: Agora o clique no ícone de perfil SEMPRE abre o modal, sem restrições */}
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
              {/* 💡 CORREÇÃO: O botão de informações (i) também está liberado para todos */}
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
            <div className="w-10 h-10 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div className="text-right">
              <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Ofensiva</p>
              <div className="flex items-center gap-1 justify-end text-[#f7931e]">
                <Flame className="w-4 h-4 fill-current" />
                <span className="text-xs font-black">{user.gamification.streak} Dias</span>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Ranking Mundial</p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-white">#{userRank || '...'}</span>
              <span className="text-[10px] font-bold text-gray-500 uppercase">Global</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pt-4">
        <div className="lg:col-span-2 space-y-8">
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center gap-3">
              <button 
                onClick={onOpenActivities} 
                className="px-5 py-2.5 rounded-xl text-xs font-black bg-[#333333] text-[#f7931e] border border-[#f7931e]/30 shadow-lg flex items-center gap-2 hover:bg-[#f7931e] hover:text-[#222222] transition-all"
              >
                <BarChart className="w-4 h-4" /> Minhas Atividades
              </button>
              <button 
                onClick={onOpenStudyPlan} 
                className="px-5 py-2.5 rounded-xl text-xs font-black bg-[#333333] text-gray-300 border border-white/10 shadow-lg flex items-center gap-2 hover:border-[#f7931e] hover:text-[#f7931e] transition-all"
              >
                <BookOpen className="w-4 h-4" /> Plano de Estudos
              </button>
              
              <div className="relative group">
                <button 
                  onClick={() => {
                    if (isChallengeOnly) {
                      setShowAccessAlert(true);
                    } else {
                      onStartPlacement();
                    }
                  }} 
                  disabled={!placementCooldownStatus.canTake && !isChallengeOnly}
                  className={`px-5 py-2.5 rounded-xl text-xs font-black shadow-lg transition-all flex items-center gap-2 ${placementCooldownStatus.canTake || isChallengeOnly ? 'bg-[#f7931e] text-[#222222] shadow-[#f7931e]/20 hover:scale-105' : 'bg-[#333333] text-gray-500 border border-white/5 cursor-not-allowed'}`}
                >
                  {placementCooldownStatus.canTake || isChallengeOnly ? <Target className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                  Nivelamento
                </button>
                {!placementCooldownStatus.canTake && (
                   <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-[50] w-48 animate-pop">
                      <div className="bg-[#1a1a1a] text-white text-[9px] p-3 rounded-xl border border-white/10 shadow-2xl text-center font-bold">
                         Próximo teste em <span className="text-[#f7931e]">{placementCooldownStatus.daysLeft} dias</span>
                      </div>
                   </div>
                )}
              </div>

              <button 
                onClick={() => {
                  if (isChallengeOnly) {
                    setShowAccessAlert(true);
                  } else {
                    onOpenChallenges();
                  }
                }} 
                className="px-5 py-2.5 rounded-xl text-xs font-black bg-[#333333] text-gray-300 border border-white/10 shadow-lg flex items-center gap-2 hover:border-[#f7931e] hover:text-[#f7931e] transition-all"
              >
                <Sword className="w-4 h-4" /> Meus Desafios
              </button>

              {user.gamification.lastPlacementLevel && (
                <div className="bg-[#f7931e]/10 border border-[#f7931e]/30 px-4 py-2 rounded-xl flex items-center gap-2 animate-fade-in">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Último Nivelamento:</span>
                  <span className="text-xs font-black text-[#f7931e]">{user.gamification.lastPlacementLevel}</span>
                </div>
              )}
            </div>
            
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Fábrica de Exercícios</h2>
              
              {!user.gamification.isPro && (
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Meta Diária:</span>
                    <span className={`text-xs font-black ${dailyCount >= DAILY_LIMIT ? 'text-green-500' : 'text-[#f7931e]'}`}>
                      {dailyCount} / {DAILY_LIMIT}
                    </span>
                  </div>
                  <div className="w-40 h-1.5 bg-black/40 rounded-full overflow-hidden border border-white/5">
                    <div 
                      className={`h-full transition-all duration-700 ${dailyCount >= DAILY_LIMIT ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.4)]' : 'bg-[#f7931e]'}`}
                      style={{ width: `${Math.min(100, (dailyCount / DAILY_LIMIT) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-8 bg-[#2a2a2a] p-8 rounded-3xl border border-[#333333] shadow-xl">
             {isLimitReached ? (
              <div className="p-12 text-center space-y-4 bg-[#222222] rounded-[2rem] border border-[#f7931e]/20">
                <Lock className="w-12 h-12 text-[#f7931e] mx-auto opacity-50" />
                <div className="space-y-2">
                  <h4 className="text-xl font-black text-white uppercase tracking-tighter">Meta Diária Batida!</h4>
                  <p className="text-gray-400 text-sm font-medium leading-relaxed">
                    Você já concluiu {DAILY_LIMIT} exercícios hoje. Volte amanhã para mais {DAILY_LIMIT} desafios.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-gray-500 uppercase block tracking-widest ml-1">1. Escolha o Nível</label>
                  <div className="grid grid-cols-5 gap-2">
                    {Object.values(Level).map((lvl) => (
                      <button 
                        key={lvl} 
                        onClick={() => {
                          if (isChallengeOnly) {
                            setShowAccessAlert(true);
                          } else {
                            setSelectedLevel(lvl);
                          }
                        }} 
                        className={`p-4 rounded-xl font-black text-sm border-2 transition-all ${selectedLevel === lvl ? 'bg-[#f7931e] border-[#f7931e] text-[#222222]' : 'bg-[#222222] border-transparent text-gray-500 hover:border-white/10'}`}
                      >
                        {lvl}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black text-gray-400 uppercase block tracking-widest ml-1">2. Habilidade</label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {availableThemes.map((thm) => (
                      <button 
                        key={thm} 
                        onClick={() => {
                          if (isChallengeOnly) {
                            setShowAccessAlert(true);
                          } else {
                            setSelectedTheme(thm);
                          }
                        }} 
                        disabled={!selectedLevel && !isChallengeOnly} 
                        className={`flex items-center justify-center p-4 rounded-xl border-2 transition-all font-black text-[10px] uppercase tracking-widest ${selectedTheme === thm ? 'bg-[#f7931e] border-[#f7931e] text-[#222222]' : 'bg-[#222222] border-transparent text-gray-500 hover:border-white/10'} disabled:opacity-20`}
                      >
                        {thm}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black text-gray-400 uppercase block tracking-widest ml-1">3. Tópico</label>
                  {isMultiSelectTheme ? (
                    <div className="space-y-4">
                       <div className="flex justify-between items-center bg-[#222222] p-4 rounded-2xl border border-white/5">
                          <p className="text-[10px] text-[#f7931e] font-black uppercase tracking-widest flex items-center gap-2">
                            <Info className="w-3.5 h-3.5" /> Selecione até duas opções
                          </p>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded ${selectedMultiTopics.size === 2 ? 'bg-[#f7931e] text-[#222222]' : 'bg-[#333333] text-gray-500'}`}>
                            {selectedMultiTopics.size} / 2
                          </span>
                       </div>
                       <div className="bg-[#222222] rounded-2xl border border-white/5 p-4 max-h-72 overflow-y-auto scrollbar-hide space-y-6">
                          <div className="space-y-3">
                             <h4 className="text-[9px] font-black text-gray-500 uppercase tracking-[0.2em] flex items-center gap-2 px-1">
                                <Brain className="w-3 h-3 text-[#f7931e]" /> Gramática
                             </h4>
                             <div className="grid grid-cols-1 gap-2">
                               {grammarTopics.map((topic, idx) => (
                                 <button
                                   key={`g-${idx}`}
                                   onClick={() => {
                                     if (isChallengeOnly) {
                                       setShowAccessAlert(true);
                                     } else {
                                       toggleMultiTopic(topic);
                                     }
                                   }}
                                   disabled={(!selectedTheme || (selectedMultiTopics.size >= 2 && !selectedMultiTopics.has(topic))) && !isChallengeOnly}
                                   className={`p-3 rounded-xl border-2 text-left text-[10px] font-bold transition-all flex items-center justify-between group ${selectedMultiTopics.has(topic) ? 'bg-[#f7931e]/10 border-[#f7931e] text-[#f7931e]' : 'bg-[#333333] border-transparent text-gray-500 hover:border-white/10 disabled:opacity-30'}`}
                                 >
                                   <span className="truncate pr-2">{topic}</span>
                                   {selectedMultiTopics.has(topic) && <Check className="w-3 h-3 flex-shrink-0" />}
                                 </button>
                               ))}
                             </div>
                          </div>
                          <div className="space-y-3">
                             <h4 className="text-[9px] font-black text-gray-500 uppercase tracking-[0.2em] flex items-center gap-2 px-1">
                                <BookText className="w-3 h-3 text-[#f7931e]" /> Vocabulário
                             </h4>
                             <div className="grid grid-cols-1 gap-2">
                               {vocabTopics.map((topic, idx) => (
                                 <button
                                   key={`v-${idx}`}
                                   onClick={() => {
                                     if (isChallengeOnly) {
                                       setShowAccessAlert(true);
                                     } else {
                                       toggleMultiTopic(topic);
                                     }
                                   }}
                                   disabled={(!selectedTheme || (selectedMultiTopics.size >= 2 && !selectedMultiTopics.has(topic))) && !isChallengeOnly}
                                   className={`p-3 rounded-xl border-2 text-left text-[10px] font-bold transition-all flex items-center justify-between group ${selectedMultiTopics.has(topic) ? 'bg-[#f7931e]/10 border-[#f7931e] text-[#f7931e]' : 'bg-[#333333] border-transparent text-gray-500 hover:border-white/10 disabled:opacity-30'}`}
                                 >
                                   <span className="truncate pr-2">{topic}</span>
                                   {selectedMultiTopics.has(topic) && <Check className="w-3 h-3 flex-shrink-0" />}
                                 </button>
                               ))}
                             </div>
                          </div>
                       </div>
                    </div>
                  ) : (
                    <select 
                      value={selectedTopic || ''} 
                      onChange={(e) => {
                        if (isChallengeOnly) {
                          setShowAccessAlert(true);
                        } else {
                          setSelectedTopic(e.target.value);
                        }
                      }} 
                      disabled={!selectedTheme && !isChallengeOnly} 
                      className="w-full bg-[#222222] text-white p-4 rounded-xl border border-white/5 focus:border-[#f7931e] outline-none disabled:opacity-20 text-xs font-bold"
                    >
                      <option value="" disabled>Escolha um tópico...</option>
                      {availableTopics.map((topic, idx) => <option key={idx} value={topic}>{topic}</option>)}
                    </select>
                  )}
                </div>

                {needsVoiceConfig && (
                  <div className="space-y-6 pt-6 border-t border-white/5 animate-fade-in">
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-[#f7931e] uppercase block tracking-widest ml-1">
                        <Mic className="w-3 h-3 inline-block mr-1 mb-0.5" /> Gênero da Voz
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        {(['Female', 'Male'] as VoiceGender[]).map(g => (
                          <button
                            key={g}
                            onClick={() => {
                              if (isChallengeOnly) {
                                setShowAccessAlert(true);
                              } else {
                                setVoiceGender(g);
                              }
                            }}
                            className={`p-4 rounded-xl font-black text-xs border-2 transition-all flex items-center justify-center gap-2 ${voiceGender === g ? 'bg-[#f7931e] border-[#f7931e] text-[#222222]' : 'bg-[#222222] border-transparent text-gray-500 hover:border-white/10'}`}
                          >
                            {g === 'Female' ? 'Feminina' : 'Masculina'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-[#f7931e] uppercase block tracking-widest ml-1">
                        <Globe className="w-3 h-3 inline-block mr-1 mb-0.5" /> Sotaque
                      </label>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {(['American', 'British', 'Australian', 'Indian'] as VoiceAccent[]).map(a => (
                          <button
                            key={a}
                            onClick={() => {
                              if (isChallengeOnly) {
                                setShowAccessAlert(true);
                              } else {
                                setVoiceAccent(a);
                              }
                            }}
                            className={`p-3 rounded-xl font-black text-[9px] border-2 transition-all flex items-center justify-center gap-2 ${voiceAccent === a ? 'bg-[#f7931e] border-[#f7931e] text-[#222222]' : 'bg-[#222222] border-transparent text-gray-500 hover:border-white/10'}`}
                          >
                            {a === 'American' ? 'EUA' : a === 'British' ? 'UK' : a === 'Australian' ? 'AUS' : 'IND'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <button 
            onClick={handleStartClick} 
            disabled={isLoading || !canStart} 
            className={`w-full p-8 rounded-3xl font-black text-xl flex items-center justify-center gap-3 transition-all transform active:scale-95 shadow-2xl ${canStart ? 'bg-[#f7931e] text-[#222222]' : 'bg-[#444444] text-gray-600 opacity-50'}`}
          >
            {isLoading ? <Loader2 className="w-7 h-7 animate-spin" /> : <><Zap className="w-7 h-7" /> Iniciar Treino</>}
          </button>
        </div>

        <div className="space-y-8">
          {/* Freedom Notifications / Avisos */}
          <div className="space-y-4">
            <h3 className="text-xl font-black text-white flex items-center gap-3 uppercase tracking-tighter">
              <Bell className="w-6 h-6 text-[#f7931e]" /> Avisos Freedom
            </h3>
            <div className="bg-[#2a2a2a] rounded-3xl border border-white/5 overflow-hidden shadow-xl max-h-60 overflow-y-auto scrollbar-hide">
              {(!user.notifications || user.notifications.length === 0) ? (
                <div className="p-8 text-center text-[10px] text-gray-600 font-bold uppercase tracking-widest italic">
                  Você não tem avisos pendentes.
                </div>
              ) : (
                user.notifications.map((notif) => (
                  <div key={notif.id} className={`p-4 border-b border-white/5 transition-colors ${notif.read ? 'opacity-60 bg-transparent' : 'bg-[#f7931e]/5'}`}>
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-[8px] font-black text-[#f7931e] uppercase tracking-widest">{notif.sender}</span>
                      <span className="text-[8px] text-gray-500">{new Date(notif.date).toLocaleDateString()}</span>
                    </div>
                    <p className="text-xs text-gray-300 font-medium mb-3 leading-relaxed">{notif.message}</p>
                    {!notif.read && (
                      <button 
                        onClick={() => {
                          if (isChallengeOnly) {
                            setShowAccessAlert(true);
                          } else {
                            handleMarkRead(notif.id);
                          }
                        }}
                        className="text-[8px] font-black text-[#f7931e] uppercase hover:underline"
                      >
                        Marcar como lido
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-4">
               <h3 className="text-xl font-black text-white flex items-center gap-3 uppercase tracking-tighter">
                  <Trophy className="w-6 h-6 text-[#f7931e]" /> Ranking
               </h3>
               <div className="flex bg-[#222222] rounded-lg p-1 border border-white/5">
                  {(['Weekly', 'Monthly', 'Annual'] as const).map(f => (
                    <button 
                      key={f} 
                      onClick={() => {
                        if (isChallengeOnly) {
                          setShowAccessAlert(true);
                        } else {
                          setLeaderboardFilter(f);
                        }
                      }}
                      className={`px-2 py-1 text-[8px] font-black uppercase tracking-tighter rounded-md transition-all ${leaderboardFilter === f ? 'bg-[#f7931e] text-[#222222]' : 'text-gray-500 hover:text-white'}`}
                    >
                      {f === 'Weekly' ? 'Sem' : f === 'Monthly' ? 'Mês' : 'Ano'}
                    </button>
                  ))}
               </div>
            </div>
            
            <div className="bg-[#2a2a2a] rounded-3xl border border-[#333333] overflow-hidden shadow-xl">
              {leaderboardUsers.length === 0 ? (
                <div className="p-8 text-center text-xs text-gray-500 font-bold italic">Carregando ranking...</div>
              ) : (
                leaderboardUsers.slice(0, 5).map((item, idx) => {
                  const itemTier = getUserTierInfo(item.user.gamification.xp);
                  return (
                    <div 
                      key={item.user.userId} 
                      onClick={() => {
                        if (isChallengeOnly) {
                          setShowAccessAlert(true);
                        } else {
                          setViewProfileId(item.user.userId);
                        }
                      }}
                      className={`p-4 flex items-center gap-3 cursor-pointer hover:bg-white/5 transition-all ${item.user.userId === user.userId ? 'bg-[#f7931e]/5' : ''}`}
                    >
                      <span className={`w-6 text-center font-black text-xs ${idx === 0 ? 'text-yellow-400' : idx === 1 ? 'text-gray-300' : idx === 2 ? 'text-orange-400' : 'text-gray-500'}`}>
                        {idx + 1}
                      </span>
                      <div className="flex-1 flex items-center gap-2">
                        <div className={`w-10 h-10 rounded-full bg-[#222222] border-2 ${itemTier.color.replace('text-', 'border-')} overflow-hidden shrink-0 flex items-center justify-center relative`}>
                          {item.user.profilePhoto ? (
                            <img src={item.user.profilePhoto} className="w-full h-full object-cover" />
                          ) : (
                            <div className={`${itemTier.color} scale-75`}>
                               {itemTier.icon}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col flex-1 min-w-0">
                          <h4 className="text-[11px] font-black text-white truncate uppercase tracking-tighter">
                            {item.user.userName}
                          </h4>
                          <span className="text-[9px] font-bold text-gray-500">{item.periodXp.toLocaleString()} XP</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {viewProfileId && (
        <ProfileViewModal 
          currentUser={user}
          targetUserId={viewProfileId}
          onClose={() => setViewProfileId(null)}
          onOpenChat={onOpenChat}
          onOpenChallenge={onOpenChallenges}
          onUserUpdate={onUserUpdate}
        />
      )}
    </div>
  );
};

export default SelectionScreen;
