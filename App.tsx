import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import MyActivitiesScreen from './components/MyActivitiesScreen';
import ProfileScreen from './components/ProfileScreen';
import AdminPanel from './components/AdminPanel';
import ChallengesScreen from './components/ChallengesScreen';
import ChatScreen from './components/ChatScreen';
import { AppState, Level, Theme, VoiceGender, VoiceAccent, StudyPlan, ActivityRecord, UserSession, GeneratedContent, UserTier, UserChallenge } from './types';
import { generateQuizContent } from './services/geminiService';
import { api } from './services/api';
import { Loader2, Database, AlertTriangle, PartyPopper, Zap, Sparkles, X, Coins, Lock, Star, Sword, Heart } from 'lucide-react';

const DAILY_LIMIT = 8;

const TIER_THRESHOLDS = [
  { tier: UserTier.Starter, min: 0, max: 5000 },
  { tier: UserTier.Warrior, min: 5001, max: 15000 },
  { tier: UserTier.Genius, min: 15001, max: 35000 },
  { tier: UserTier.Pro, min: 35001, max: 60000 },
  { tier: UserTier.Legend, min: 60001, max: Infinity },
];

const formatFR = (value: number) => {
  return "FR$ " + (value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

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
  const [pendingChallenge, setPendingChallenge] = useState<UserChallenge | null>(null);

  useEffect(() => {
    const initApp = async () => {
      await api.cleanupExpiredActivities();
      const savedSession = localStorage.getItem('freedom_postgres_session');
      if (savedSession) {
        try {
          const storedUser: UserSession = JSON.parse(savedSession);
          const user = await api.login(storedUser.username, storedUser.password);
          if (user) {
            const challenges = await api.getChallenges();
            const invite = challenges.find(c => c.status === 'active' && (c.pendingInvites || []).includes(user.userId));
            if (invite) setPendingChallenge(invite);

            const [plan, history] = await Promise.all([
              api.getPlan(user.userId),
              api.getHistory(user.userId)
            ]);

            let finalPlan = plan;
            if (plan && plan.isChallenge) {
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const todayStr = today.toISOString().split('T')[0];

              if (plan.lastPenaltyCheckDate !== todayStr) {
                const updatedPlan = { ...plan };
                let livesDeducted = 0;
                const yesterday = new Date(today);
                yesterday.setDate(today.getDate() - 1);
                
                let checkDate: Date;
                if (plan.lastPenaltyCheckDate) {
                  checkDate = new Date(plan.lastPenaltyCheckDate + 'T00:00:00');
                  checkDate.setDate(checkDate.getDate() + 1);
                } else if (plan.challengeStartDate) {
                  checkDate = new Date(plan.challengeStartDate + 'T00:00:00');
                } else {
                  checkDate = new Date(today);
                }

                for (let d = new Date(checkDate); d <= yesterday; d.setDate(d.getDate() + 1)) {
                  const dStr = d.toISOString().split('T')[0];
                  let dayTasks: any[] = [];
                  updatedPlan.weeks.forEach(w => {
                    w.days.forEach(day => {
                      if (day.date === dStr) dayTasks = day.tasks;
                    });
                  });

                  if (dayTasks.length > 0 && !dayTasks.every(t => t.isCompleted)) {
                    livesDeducted++;
                  }
                }

                if (livesDeducted > 0) {
                  updatedPlan.lives = Math.max(0, (updatedPlan.lives ?? 3) - livesDeducted);
                }
                updatedPlan.lastPenaltyCheckDate = todayStr;
                await api.savePlan(user.userId, updatedPlan);
                finalPlan = updatedPlan;
              }
            }
            
            if (user.username.toLowerCase() === 'admin') {
              setState(prev => ({ 
                ...prev, 
                user, 
                studyPlan: finalPlan, 
                activityHistory: history, 
                status: user.guide ? 'selection' : 'guide_selection' 
              }));
            } else {
              setState(prev => ({ 
                ...prev, 
                user, 
                studyPlan: finalPlan, 
                activityHistory: history, 
                status: 'keyword_check' 
              }));
            }
            localStorage.setItem('freedom_postgres_session', JSON.stringify(user));
          } else {
            setState(prev => ({ ...prev, status: 'login' }));
          }
        } catch (e) {
          setState(prev => ({ ...prev, status: 'login' }));
        }
      } else {
        setState(prev => ({ ...prev, status: 'login' }));
      }
    };
    initApp();
  }, []);

  const handleHome = useCallback(() => {
    if (state.user) {
      setState(prev => ({ ...prev, status: 'selection', content: null, level: null, theme: null, subTopic: null, newTierReached: null }));
    }
  }, [state.user]);

  const handleStart = async (level: Level, theme: Theme, subTopic: string, voiceGender: VoiceGender = 'Female', voiceAccent: VoiceAccent = 'American') => {
    if (!state.user) return;
    
    const today = new Date().toISOString().split('T')[0];
    const dailyCount = state.user.gamification.lastActivityDate === today ? state.user.gamification.dailyActivitiesCount : 0;
    
    if (!state.user.gamification.isPro && dailyCount >= DAILY_LIMIT) {
      alert(`Parabéns! Você já concluiu seus ${DAILY_LIMIT} exercícios de hoje.`);
      return;
    }

    setState(prev => ({ ...prev, status: 'loading', level, theme, subTopic, errorMessage: undefined }));
    try {
      const cached = await api.getRandomActivityFromBank(level, theme, subTopic);
      let content: GeneratedContent;
      if (cached) {
        content = cached.content;
      } else {
        content = await generateQuizContent(level, theme, subTopic, voiceGender, voiceAccent);
        await api.saveToActivityBank(level, theme, subTopic, content);
      }
      if (theme === Theme.Writing) {
          setState(prev => ({ ...prev, status: 'writing', content, score: 0 }));
      } else {
          setState(prev => ({ ...prev, status: 'quiz', content, score: 0, currentQuestionIndex: 0 }));
      }
    } catch (error) {
      setState(prev => ({ ...prev, status: 'error', errorMessage: error instanceof Error ? error.message : "Erro ao carregar atividade." }));
    }
  };

  const calculateTier = (xp: number) => {
    return TIER_THRESHOLDS.find(t => xp >= t.min && xp <= t.max)?.tier || UserTier.Starter;
  };

  const handleFinish = async (finalScore: number, total: number) => {
    if (!state.user) return;

    setState(prev => ({ ...prev, status: 'loading' }));
    
    const accuracy = Math.min(1, finalScore / total);
    const rawXp = Math.min(100, Math.round(accuracy * 100));
    
    const prevXp = state.user.gamification.xp;
    const prevTier = calculateTier(prevXp);

    const { totalXp, xpGained, frGained, totalFr } = await api.updateXp(state.user.userId, rawXp);
    
    const newTier = calculateTier(totalXp);
    const leveledUp = newTier !== prevTier;

    const record: ActivityRecord = {
      id: crypto.randomUUID(),
      date: Date.now(),
      level: state.level!,
      theme: state.theme!,
      topic: state.subTopic!,
      score: finalScore,
      total: total,
      type: state.theme === Theme.Writing ? 'writing' : 'quiz',
      xpGained: xpGained,
      frGained: frGained
    };
    
    await api.saveActivity(state.user.userId, record);
    const updatedHistory = await api.getHistory(state.user.userId);
    
    const today = new Date().toISOString().split('T')[0];
    const isTodayLimitReached = !state.user.gamification.isPro && state.user.gamification.dailyActivitiesCount === DAILY_LIMIT;

    const updatedUser = { 
      ...state.user, 
      gamification: { 
        ...state.user.gamification, 
        xp: totalXp,
        frBalance: totalFr,
        dailyXpEarned: state.user.gamification.dailyXpEarned + xpGained,
        lastXpGainDate: today
      } 
    };
    localStorage.setItem('freedom_postgres_session', JSON.stringify(updatedUser));

    setState(prev => ({ 
      ...prev, 
      status: leveledUp ? 'level_up' : 'results', 
      score: finalScore, 
      activityHistory: updatedHistory,
      user: updatedUser,
      lastXpGained: xpGained,
      lastFrGained: frGained,
      newTierReached: leveledUp ? newTier : null
    }));

    if (isTodayLimitReached) {
      setShowDailyLimitModal(true);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('freedom_postgres_session');
    setState(p => ({ ...p, user: null, status: 'login', studyPlan: null, activityHistory: [] }));
  };

  const handlePlacementFinish = async (level: Level) => {
    if (state.user) {
      const { totalXp, totalFr } = await api.updateXp(state.user.userId, 200);
      const updatedUser = await api.savePlacementResult(state.user.userId, level);
      const finalUser = { ...updatedUser, gamification: { ...updatedUser.gamification, xp: totalXp, frBalance: totalFr } };
      localStorage.setItem('freedom_postgres_session', JSON.stringify(finalUser));
      setState(p => ({ ...p, user: finalUser }));
    }
    handleHome();
  };

  const handleUserUpdate = (updatedUser: UserSession) => {
    localStorage.setItem('freedom_postgres_session', JSON.stringify(updatedUser));
    setState(p => ({ ...p, user: updatedUser }));
  };

  return (
    <div className="min-h-screen bg-[#222222] text-white font-sans selection:bg-[#f7931e] selection:text-[#222222]">
      {state.status !== 'admin_panel' && (
        <Header 
          onLogout={state.user ? handleLogout : undefined} 
          onHome={state.user ? handleHome : undefined} 
          onOpenChat={state.user ? () => setState(p => ({ ...p, status: 'chat', activeChatUserId: null })) : undefined}
          user={state.user}
        />
      )}
      
      {showDailyLimitModal && (
        <div className="fixed inset-0 z-[500] bg-[#222222]/95 backdrop-blur-2xl flex flex-col items-center justify-center p-8 text-center animate-fade-in">
            <div className="relative mb-8">
              <Star className="w-24 h-24 text-yellow-400 animate-pulse" />
              <PartyPopper className="absolute -top-4 -right-4 w-12 h-12 text-[#f7931e] animate-bounce" />
            </div>
            <h2 className="text-4xl md:text-5xl font-black text-white uppercase tracking-tighter mb-4 animate-pop">Meta do Dia Concluída!</h2>
            <p className="text-gray-300 max-w-lg text-lg md:text-xl font-medium leading-relaxed animate-fade-in delay-200">
              Parabéns! Você atingiu o máximo de atividades por hoje. <br/>
              <span className="text-[#f7931e] font-black">Isso mostra o quanto você está focado!</span> <br/>
              Volte amanhã para praticar mais.
            </p>
            <button 
              onClick={() => {
                setShowDailyLimitModal(false);
                handleHome();
              }}
              className="mt-12 px-12 py-5 bg-[#f7931e] text-[#222222] rounded-2xl font-black text-xl hover:scale-110 transition-all uppercase tracking-widest shadow-2xl shadow-[#f7931e]/30"
            >
              Sensacional!
            </button>
        </div>
      )}

      {state.status === 'level_up' && state.newTierReached && (
        <div className="fixed inset-0 z-[300] bg-[#222222]/95 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center animate-fade-in">
            <div className="relative mb-8">
              <PartyPopper className="w-24 h-24 text-yellow-400 animate-bounce" />
              <Sparkles className="absolute -top-4 -right-4 w-12 h-12 text-[#f7931e] animate-pulse" />
            </div>
            <h2 className="text-5xl font-black text-white uppercase tracking-tighter mb-4 animate-pop">Nova Patente Freedom!</h2>
            <div className="bg-[#f7931e] text-[#222222] px-8 py-4 rounded-3xl text-3xl font-black shadow-2xl shadow-[#f7931e]/30 mb-8 transform rotate-2 animate-pop delay-100">
               {state.newTierReached}
            </div>
            <p className="text-gray-400 max-w-md text-xl font-medium leading-relaxed italic animate-fade-in delay-200">
              "Você acumulou {state.user?.gamification.xp.toLocaleString()} XP. Sua fluência está cada vez mais próxima!"
            </p>
            <button 
              onClick={() => setState(p => ({ ...p, status: 'results' }))}
              className="mt-12 px-12 py-5 bg-white text-[#222222] rounded-2xl font-black text-xl hover:scale-110 transition-all uppercase tracking-widest shadow-xl"
            >
              Ver Resultados
            </button>
        </div>
      )}

      {pendingChallenge && state.user && (
        <div className="fixed inset-0 z-[700] bg-[#222222]/95 backdrop-blur-2xl flex items-center justify-center p-6">
          <div className="bg-[#2a2a2a] w-full max-w-lg rounded-[3rem] border border-white/10 p-10 shadow-2xl text-center animate-pop">
            <div className="w-20 h-20 bg-[#f7931e]/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Sword className="w-10 h-10 text-[#f7931e]" />
            </div>
            <h3 className="text-2xl font-black text-white uppercase tracking-tighter mb-4">Novo Convite de Desafio!</h3>
            <p className="text-gray-300 mb-8 leading-relaxed">
              O usuário <span className="text-[#f7931e] font-black">@{api.admin_getAllUsers().then(users => users.find(u => u.userId === pendingChallenge.creatorId)?.username)}</span> está te convidando a participar do desafio <span className="font-black text-white">"{pendingChallenge.name}"</span>. Você aceita?
            </p>
            
            <div className="bg-[#222222] p-6 rounded-3xl border border-white/5 mb-8 text-left">
              <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Regras do Desafio</p>
              <p className="text-sm text-gray-300 italic">"{pendingChallenge.rules}"</p>
              <div className="mt-4 flex gap-4">
                <div className="flex-1">
                  <p className="text-[8px] font-black text-gray-500 uppercase">Duração</p>
                  <p className="text-xs font-black text-white">{pendingChallenge.durationDays} dias</p>
                </div>
                <div className="flex-1">
                  <p className="text-[8px] font-black text-gray-500 uppercase">Foco</p>
                  <p className="text-xs font-black text-white">{pendingChallenge.focus}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <button 
                onClick={async () => {
                  const updated = { ...pendingChallenge };
                  updated.pendingInvites = updated.pendingInvites.filter(id => id !== state.user!.userId);
                  updated.participantIds.push(state.user!.userId);
                  updated.participantStats[state.user!.userId] = { xpGained: 0, activitiesDone: 0 };
                  await api.saveChallenge(updated);
                  setPendingChallenge(null);
                  alert("Você entrou no desafio! Boa sorte! ⚔️");
                }}
                className="w-full py-5 bg-[#f7931e] text-[#222222] rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:scale-105 transition-all shadow-xl shadow-[#f7931e]/20"
              >
                Quero participar ⚔️
              </button>
              <button 
                onClick={async () => {
                  const updated = { ...pendingChallenge };
                  updated.pendingInvites = updated.pendingInvites.filter(id => id !== state.user!.userId);
                  await api.saveChallenge(updated);
                  setPendingChallenge(null);
                }}
                className="w-full py-5 bg-[#333333] text-gray-400 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:text-white transition-all"
              >
                Não quero participar 💔
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 💡 ALTERAÇÃO AQUI: Texto mudado para "Loading" */}
      {state.status === 'loading' && (
        <div className="fixed inset-0 z-[150] bg-[#222222]/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center">
            <Loader2 className="w-20 h-20 text-[#f7931e] animate-spin mb-6" />
            <h3 className="text-2xl font-black text-[#f7931e] mb-2 uppercase tracking-tighter">Loading...</h3>
            <p className="text-gray-400 max-w-xs text-sm font-medium">Please wait a moment.</p>
        </div>
      )}

      {state.status === 'error' && (
        <div className="max-w-md mx-auto mt-20 p-8 bg-[#333333] border-2 border-red-500/30 rounded-3xl text-center animate-pop">
           <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
           <p className="text-gray-400 mb-6">{state.errorMessage}</p>
           <button onClick={handleHome} className="w-full py-4 bg-[#f7931e] text-[#222222] font-black rounded-2xl">Voltar ao Início</button>
        </div>
      )}

      <main className="container mx-auto px-4">
        {state.status === 'login' && <LoginScreen onLogin={async (user) => {
          setState(p => ({ ...p, status: 'loading' }));
          const [plan, history] = await Promise.all([api.getPlan(user.userId), api.getHistory(user.userId)]);
          localStorage.setItem('freedom_postgres_session', JSON.stringify(user));
          
          if (user.username.toLowerCase() === 'admin') {
            setState(p => ({ ...p, user, studyPlan: plan, activityHistory: history, status: user.guide ? 'selection' : 'guide_selection' }));
          } else {
            setState(p => ({ ...p, user, studyPlan: plan, activityHistory: history, status: 'keyword_check' }));
          }
        }} />}

        {state.status === 'keyword_check' && (
          <KeywordScreen 
            onSuccess={(accessType) => {
              if (state.user) {
                const updatedUser = { ...state.user, accessType };
                localStorage.setItem('freedom_postgres_session', JSON.stringify(updatedUser));
                setState(p => ({ ...p, user: updatedUser, status: 'guide_selection' }));
              }
            }} 
            onLogout={handleLogout}
          />
        )}

        {state.status === 'guide_selection' && <GuideSelectionScreen onHome={handleHome} userName={state.user?.userName || ""} onSelect={async (g) => {
          if (state.user) {
            await api.updateGuide(state.user.userId, g);
            const updated = { ...state.user, guide: g };
            localStorage.setItem('freedom_postgres_session', JSON.stringify(updated));
            setState(p => ({ ...p, user: updated, status: 'selection' }));
          }
        }} />}

        {state.status === 'selection' && state.user && (
          <SelectionScreen 
            user={state.user}
            onStart={handleStart}
            onOpenStudyPlan={() => setState(p => ({ ...p, status: state.studyPlan ? 'dashboard' : 'plan_setup' }))}
            onStartPlacement={() => setState(p => ({ ...p, status: 'placement_test' }))}
            onOpenActivities={() => setState(p => ({ ...p, status: 'my_activities' }))}
            onOpenProfile={() => setState(p => ({ ...p, status: 'profile' }))}
            onOpenAdmin={() => setState(p => ({ ...p, status: 'admin_panel' }))}
            onOpenChallenges={() => setState(p => ({ ...p, status: 'challenges' }))}
            onOpenChat={(userId) => setState(p => ({ ...p, status: 'chat', activeChatUserId: userId }))}
            isLoading={false}
            hasActivePlan={!!state.studyPlan}
            onUserUpdate={handleUserUpdate}
          />
        )}

        {state.status === 'challenges' && state.user && (
          <ChallengesScreen 
            user={state.user}
            onHome={handleHome}
            onUserUpdate={handleUserUpdate}
          />
        )}

        {state.status === 'chat' && state.user && (
          <ChatScreen 
            user={state.user}
            onHome={handleHome}
            activeChatUserId={state.activeChatUserId}
          />
        )}

        {state.status === 'admin_panel' && state.user?.username.toLowerCase() === 'admin' && (
          <AdminPanel onBack={handleHome} />
        )}

        {state.status === 'profile' && state.user && (
          <ProfileScreen 
            user={state.user}
            onHome={handleHome}
            onUpdate={handleUserUpdate}
          />
        )}

        {state.status === 'my_activities' && state.user && (
          <MyActivitiesScreen 
            user={state.user}
            history={state.activityHistory}
            onHome={handleHome}
            onRedoActivity={handleStart}
          />
        )}

        {state.status === 'placement_test' && <PlacementTestScreen onFinish={handlePlacementFinish} onHome={handleHome} />}

        {state.status === 'plan_setup' && state.user && <StudyPlanSetup user={state.user} onCancel={handleHome} onPlanGenerated={async (newPlan) => {
          if (state.user) await api.savePlan(state.user.userId, newPlan);
          setState(prevState => ({ ...prevState, studyPlan: newPlan, status: 'dashboard' }));
        }} />}

        {state.status === 'dashboard' && state.studyPlan && state.user && (
          <DashboardScreen 
            plan={state.studyPlan}
            user={state.user}
            history={state.activityHistory}
            onUpdatePlan={async (updatedPlan) => { if (state.user) await api.savePlan(state.user.userId, updatedPlan); setState(prevState => ({ ...prevState, studyPlan: updatedPlan })); }}
            onHome={handleHome}
            onResetPlan={async () => { await api.deletePlan(state.user!.userId); setState(p => ({ ...p, studyPlan: null, status: 'plan_setup' })); }}
            onStartTask={(t) => handleStart(state.studyPlan!.inputs.level, t.relatedTheme!, t.description)}
          />
        )}

        {state.status === 'quiz' && state.content && (
          <QuizScreen 
            content={state.content} 
            onFinish={handleFinish} 
            onHome={handleHome} 
            level={state.level!} 
            theme={state.theme!} 
            topic={state.subTopic!} 
          />
        )}

        {state.status === 'writing' && state.content && (
          <WritingScreen 
            content={state.content} 
            level={state.level!} 
            theme={state.theme!} 
            topic={state.subTopic!} 
            onFinish={(s) => handleFinish(s, 100)} 
            onHome={handleHome} 
          />
        )}

        {state.status === 'results' && (
          <ResultsScreen 
            score={state.score} 
            totalQuestions={state.theme === Theme.Writing ? 100 : (state.content?.questions.length || 10)} 
            onRetry={() => setState(p => ({ ...p, status: state.theme === Theme.Writing ? 'writing' : 'quiz' }))} 
            onHome={handleHome}
            xpGained={state.lastXpGained}
            frGained={state.lastFrGained}
          />
        )}
      </main>

      <a 
        href="https://wa.me/message/JZDOD5MBRXEAO1" 
        target="_blank" 
        rel="noopener noreferrer"
        className="fixed bottom-6 left-6 z-50 flex items-center gap-2 text-gray-500 hover:text-[#f7931e] transition-all bg-[#1a1a1a]/50 p-2.5 rounded-xl backdrop-blur-sm group border border-white/5 hover:border-[#f7931e]/30 shadow-2xl"
        title="Reportar Erro"
      >
        <AlertTriangle className="w-5 h-5" />
        <span className="text-[10px] font-black uppercase tracking-widest hidden group-hover:inline-block animate-fade-in pr-1">Reportar Erro</span>
      </a>

      {state.user && state.user.guide && state.status !== 'login' && state.status !== 'loading' && state.status !== 'keyword_check' && (
        <div className="fixed bottom-0 right-0 z-[200] pointer-events-none">
          <div className="pointer-events-auto">
             <GuideChat 
                guide={state.user.guide} 
                userName={state.user.userName} 
                user={state.user}
                onUserUpdate={handleUserUpdate}
                onGenerateActivity={handleStart} 
             />
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
