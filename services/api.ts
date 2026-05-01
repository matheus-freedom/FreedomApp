import { Level, Theme, GeneratedContent, ActivityRecord, StudyPlan, UserSession, GuideCharacter, UserGamification, UserChallenge, DirectMessage, AdminNotification, RankingSnapshot, RankingEntry, WeeklyBadge } from '../types';
import { auth, db, storage } from './firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, query, where, deleteDoc, addDoc, orderBy, limit } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// ── Helpers de período ────────────────────────────────────────

// Retorna a chave da semana ISO: "2026-W18"
const getWeekKey = (date: Date = new Date()): string => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
};

// Retorna a chave do mês: "2026-04"
const getMonthKey = (date: Date = new Date()): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

// Retorna a chave do ano: "2026"
const getYearKey = (date: Date = new Date()): string =>
  `${date.getFullYear()}`;

// Label legível da semana: "Semana 18 • 2026"
const getWeekLabel = (weekKey: string): string => {
  const [year, week] = weekKey.split('-W');
  return `Semana ${week} • ${year}`;
};

// Label legível do mês: "Abril 2026"
const getMonthLabel = (monthKey: string): string => {
  const [year, month] = monthKey.split('-');
  const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  return `${months[parseInt(month) - 1]} ${year}`;
};

// Mensagens de parabéns por posição
const getCongratulationsMessage = (position: 1 | 2 | 3, weekLabel: string, xp: number): string => {
  const xpFormatted = xp.toLocaleString('pt-BR');
  if (position === 1) {
    return `🏆 Você foi o CAMPEÃO da ${weekLabel}! Incrível — você acumulou ${xpFormatted} XP e liderou todos os alunos da Freedom. Sua dedicação é inspiradora. Continue assim e conquiste mais uma semana no topo! 🚀`;
  }
  if (position === 2) {
    return `🥈 Parabéns! Você ficou em 2º lugar na ${weekLabel}, acumulando ${xpFormatted} XP. Você foi incrível essa semana! Está muito perto do topo — mais uma semana de foco e a coroa é sua! 💪`;
  }
  return `🥉 Que semana fantástica! Você ficou em 3º lugar na ${weekLabel} com ${xpFormatted} XP. Seu esforço está valendo a pena — continue praticando e logo você estará no topo do ranking! ⭐`;
};

const INITIAL_GAMIFICATION: UserGamification = {
  xp: 0, frBalance: 0, streak: 0, lastLoginDate: null, dailyXpEarned: 0,
  lastXpGainDate: null, dailyActivitiesCount: 0, lastActivityDate: null,
  isPro: false, dailyChatCount: 0, lastChatDate: null, followers: [],
  following: [], followRequests: [], totalActivities: 0,
  // Novos campos de período
  weeklyXp: 0, monthlyXp: 0, yearlyXp: 0,
  weeklyActivities: 0, monthlyActivities: 0,
  lastWeekKey: null, lastMonthKey: null, lastYearKey: null,
  weeklyBadge: null,
};

const clean = (obj: any) => JSON.parse(JSON.stringify(obj));

// ── Função para garantir campos novos em usuários antigos ─────
const ensureNewFields = (gamification: UserGamification): UserGamification => ({
  ...INITIAL_GAMIFICATION,
  ...gamification,
  weeklyXp: gamification.weeklyXp ?? 0,
  monthlyXp: gamification.monthlyXp ?? 0,
  yearlyXp: gamification.yearlyXp ?? 0,
  weeklyActivities: gamification.weeklyActivities ?? 0,
  monthlyActivities: gamification.monthlyActivities ?? 0,
  lastWeekKey: gamification.lastWeekKey ?? null,
  lastMonthKey: gamification.lastMonthKey ?? null,
  lastYearKey: gamification.lastYearKey ?? null,
  weeklyBadge: gamification.weeklyBadge ?? null,
});

export const api = {
  subscribeToAuthChanges: (callback: (user: any) => void) => {
    return onAuthStateChanged(auth, callback);
  },

  getUserProfile: async (uid: string): Promise<UserSession | null> => {
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const data = userSnap.data() as UserSession;
      // Garante que usuários antigos tenham os novos campos
      data.gamification = ensureNewFields(data.gamification);

      // ── Atualiza streak de login ──────────────────────────
      const today = new Date().toISOString().split('T')[0];
      const lastLogin = data.gamification.lastLoginDate;

      if (lastLogin !== today) {
        const lastLoginDate = lastLogin ? new Date(lastLogin) : null;
        const todayDate = new Date(today);
        const diffDays = lastLoginDate
          ? Math.round((todayDate.getTime() - lastLoginDate.getTime()) / (1000 * 60 * 60 * 24))
          : null;

        if (diffDays === 1) {
          // Logou ontem: incrementa a ofensiva
          data.gamification.streak = (data.gamification.streak || 0) + 1;
        } else {
          // Nunca logou antes ou perdeu a sequência: reinicia em 1
          data.gamification.streak = 1;
        }

        data.gamification.lastLoginDate = today;
        await setDoc(userRef, clean(data));
      }

      return data;
    }
    return null;
  },

  logout: async () => { await signOut(auth); },

  uploadProfilePhoto: async (userId: string, file: File): Promise<string> => {
    const fileRef = ref(storage, `profile_photos/${userId}_${Date.now()}`);
    await uploadBytes(fileRef, file);
    return await getDownloadURL(fileRef);
  },

  login: async (identifier: string, password?: string): Promise<UserSession | null> => {
    const today = new Date().toISOString().split('T')[0];
    if (identifier.toLowerCase() === 'admin' && password === 'f1') {
      const adminRef = doc(db, 'users', 'admin-root-id');
      const adminSnap = await getDoc(adminRef);
      let adminData: UserSession;
      if (!adminSnap.exists()) {
        adminData = {
          userId: 'admin-root-id', username: 'admin', userName: 'Admin', fullName: 'Freedom Administrator',
          age: '99', gender: 'Root', email: 'admin@freedom.app', guide: 'Fred',
          gamification: { ...INITIAL_GAMIFICATION, isPro: true, lastLoginDate: today }, notifications: []
        };
      } else {
        adminData = adminSnap.data() as UserSession;
        adminData.gamification = ensureNewFields(adminData.gamification);
        adminData.username = 'admin';
      }
      adminData.gamification.isPro = true;
      adminData.gamification.lastLoginDate = today;
      await setDoc(adminRef, clean(adminData));
      return adminData;
    }
    try {
      let loginEmail = identifier;
      if (!identifier.includes('@') || identifier.startsWith('@')) {
        let searchUsername = identifier.toLowerCase().replace(/\s/g, '');
        if (searchUsername === '@admin') searchUsername = 'admin';
        const q = query(collection(db, 'users'), where('username', '==', searchUsername));
        const snap = await getDocs(q);
        if (snap.empty) return null;
        loginEmail = snap.docs[0].data().email;
      }
      const userCredential = await signInWithEmailAndPassword(auth, loginEmail, password!);
      return await api.getUserProfile(userCredential.user.uid);
    } catch (e) { return null; }
  },

  isUsernameTaken: async (username: string): Promise<boolean> => {
    const normalized = username.toLowerCase();
    if (normalized === '@tester') return true;
    let searchUsername = normalized;
    if (searchUsername === '@admin') searchUsername = 'admin';
    const q = query(collection(db, 'users'), where('username', '==', searchUsername));
    const snap = await getDocs(q);
    return !snap.empty;
  },

  register: async (userData: { username: string, fullName: string, age: string, gender: string, email: string, password?: string, profilePhoto?: string | File }): Promise<UserSession> => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, userData.email, userData.password || '123456');
      const uid = userCredential.user.uid;
      const firstName = userData.fullName.split(' ')[0] || userData.username.replace('@', '');
      let finalUsername = userData.username.toLowerCase();
      if (finalUsername === '@admin') finalUsername = 'admin';
      
      let finalPhotoUrl = undefined;
      if (userData.profilePhoto instanceof File) {
        finalPhotoUrl = await api.uploadProfilePhoto(uid, userData.profilePhoto);
      } else if (typeof userData.profilePhoto === 'string') {
        finalPhotoUrl = userData.profilePhoto;
      }

      const newUser: UserSession = {
        userId: uid, username: finalUsername, userName: firstName, fullName: userData.fullName,
        age: userData.age, gender: userData.gender, email: userData.email, profilePhoto: finalPhotoUrl,
        guide: 'Fred', gamification: { ...INITIAL_GAMIFICATION, lastLoginDate: new Date().toISOString().split('T')[0], streak: 1 },
        notifications: []
      };
      await setDoc(doc(db, 'users', uid), clean(newUser));
      return newUser;
    } catch (e: any) {
      if (e.code === 'auth/email-already-in-use') throw new Error("Já existe uma conta vinculada a este e-mail.");
      throw e;
    }
  },

  requestPasswordReset: async (email: string): Promise<{ success: boolean; resetToken?: string }> => {
    try { await sendPasswordResetEmail(auth, email); return { success: true }; } catch (e) { return { success: false }; }
  },

  resetPassword: async (email: string, newPassword: string): Promise<boolean> => { return true; },

  admin_getAllUsers: async (): Promise<UserSession[]> => {
    const snap = await getDocs(collection(db, 'users'));
    return snap.docs.map(d => {
      const data = d.data() as UserSession;
      data.gamification = ensureNewFields(data.gamification);
      return data;
    });
  },

  admin_getAllPlans: async (): Promise<Record<string, StudyPlan>> => {
    const snap = await getDocs(collection(db, 'plans'));
    const plans: Record<string, StudyPlan> = {};
    snap.forEach(d => plans[d.id] = d.data() as StudyPlan);
    return plans;
  },

  admin_getUserHistory: async (userId: string): Promise<ActivityRecord[]> => {
    const q = query(collection(db, 'history'), where('userId', '==', userId));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as ActivityRecord).sort((a, b) => b.date - a.date);
  },

  admin_updateUserGamification: async (userId: string, xpDelta: number, frDelta: number): Promise<void> => {
    const userRef = doc(db, 'users', userId);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const user = snap.data() as UserSession;
      user.gamification = ensureNewFields(user.gamification);
      user.gamification.xp += xpDelta;
      user.gamification.frBalance += frDelta;
      await setDoc(userRef, clean(user));
    }
  },

  admin_sendNotification: async (userId: string, message: string): Promise<void> => {
    const userRef = doc(db, 'users', userId);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const user = snap.data() as UserSession;
      if (!user.notifications) user.notifications = [];
      user.notifications.unshift({ id: crypto.randomUUID(), message, date: Date.now(), read: false, sender: 'Admin Freedom' });
      await setDoc(userRef, clean(user));
    }
  },

  markNotificationRead: async (userId: string, notificationId: string): Promise<void> => {
    const userRef = doc(db, 'users', userId);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const user = snap.data() as UserSession;
      if (user.notifications) {
        const nIdx = user.notifications.findIndex(n => n.id === notificationId);
        if (nIdx !== -1) { user.notifications[nIdx].read = true; await setDoc(userRef, clean(user)); }
      }
    }
  },

  saveUser: async (user: UserSession) => { await setDoc(doc(db, 'users', user.userId), clean(user)); },

  updateGuide: async (userId: string, guide: GuideCharacter): Promise<void> => {
    const userRef = doc(db, 'users', userId);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const user = snap.data() as UserSession;
      user.guide = guide;
      await setDoc(userRef, clean(user));
    }
  },

  incrementActivityCount: async (userId: string): Promise<number> => {
    const userRef = doc(db, 'users', userId);
    const snap = await getDoc(userRef);
    if (!snap.exists()) throw new Error("User not found");
    const user = snap.data() as UserSession;
    user.gamification = ensureNewFields(user.gamification);
    const today = new Date().toISOString().split('T')[0];
    if (user.gamification.lastActivityDate !== today) {
      user.gamification.dailyActivitiesCount = 1;
      user.gamification.lastActivityDate = today;
    } else {
      user.gamification.dailyActivitiesCount += 1;
    }
    await setDoc(userRef, clean(user));
    return user.gamification.dailyActivitiesCount;
  },

  incrementChatCount: async (userId: string): Promise<number> => {
    const userRef = doc(db, 'users', userId);
    const snap = await getDoc(userRef);
    if (!snap.exists()) throw new Error("User not found");
    const user = snap.data() as UserSession;
    user.gamification = ensureNewFields(user.gamification);
    const today = new Date().toISOString().split('T')[0];
    if (user.gamification.lastChatDate !== today) {
      user.gamification.dailyChatCount = 1;
      user.gamification.lastChatDate = today;
    } else {
      user.gamification.dailyChatCount = (user.gamification.dailyChatCount || 0) + 1;
    }
    await setDoc(userRef, clean(user));
    return user.gamification.dailyChatCount;
  },

  // ── updateXp: agora registra XP por período e detecta virada ──
  updateXp: async (userId: string, xpGain: number): Promise<{ totalXp: number, xpGained: number, frGained: number, totalFr: number }> => {
    const userRef = doc(db, 'users', userId);
    const snap = await getDoc(userRef);
    if (!snap.exists()) throw new Error("User not found");
    
    const user = snap.data() as UserSession;
    user.gamification = ensureNewFields(user.gamification);
    const today = new Date().toISOString().split('T')[0];
    const currentWeekKey = getWeekKey();
    const currentMonthKey = getMonthKey();
    const currentYearKey = getYearKey();

    // ── Limite diário de 800 XP ───────────────────────────────
    if (user.gamification.lastXpGainDate !== today) {
      user.gamification.dailyXpEarned = 0;
      user.gamification.lastXpGainDate = today;
    }
    const DAILY_XP_LIMIT = 800;
    let actualXpGain = xpGain;
    if (user.gamification.dailyXpEarned + xpGain > DAILY_XP_LIMIT) {
      actualXpGain = Math.max(0, DAILY_XP_LIMIT - user.gamification.dailyXpEarned);
    }

    const frGain = actualXpGain / 100;

    // ── Detecta virada de semana → salva snapshot ─────────────
    const prevWeekKey = user.gamification.lastWeekKey;
    if (prevWeekKey && prevWeekKey !== currentWeekKey) {
      // Virou semana — salva snapshot e envia notificações
      await api.saveRankingSnapshot('weekly', prevWeekKey);
      // Zera contadores semanais
      user.gamification.weeklyXp = 0;
      user.gamification.weeklyActivities = 0;
    }

    // ── Detecta virada de mês → salva snapshot ────────────────
    const prevMonthKey = user.gamification.lastMonthKey;
    if (prevMonthKey && prevMonthKey !== currentMonthKey) {
      await api.saveRankingSnapshot('monthly', prevMonthKey);
      user.gamification.monthlyXp = 0;
      user.gamification.monthlyActivities = 0;
    }

    // ── Detecta virada de ano ─────────────────────────────────
    if (user.gamification.lastYearKey && user.gamification.lastYearKey !== currentYearKey) {
      user.gamification.yearlyXp = 0;
    }

    // ── Atualiza todos os contadores ──────────────────────────
    user.gamification.xp += actualXpGain;
    user.gamification.frBalance = (user.gamification.frBalance || 0) + frGain;
    user.gamification.dailyXpEarned += actualXpGain;
    user.gamification.weeklyXp = (user.gamification.weeklyXp || 0) + actualXpGain;
    user.gamification.monthlyXp = (user.gamification.monthlyXp || 0) + actualXpGain;
    user.gamification.yearlyXp = (user.gamification.yearlyXp || 0) + actualXpGain;
    user.gamification.weeklyActivities = (user.gamification.weeklyActivities || 0) + 1;
    user.gamification.monthlyActivities = (user.gamification.monthlyActivities || 0) + 1;
    user.gamification.lastWeekKey = currentWeekKey;
    user.gamification.lastMonthKey = currentMonthKey;
    user.gamification.lastYearKey = currentYearKey;

    await setDoc(userRef, clean(user));

    // ── Atualiza desafios ativos ──────────────────────────────
    const challengesSnap = await getDocs(collection(db, 'challenges'));
    const now = Date.now();
    challengesSnap.forEach(async (d) => {
      const c = d.data() as UserChallenge;
      if (c.status === 'active' && (c.participantIds || []).includes(userId)) {
        if (now > c.endDate) {
          c.status = 'closed';
          const participants = (c.participantIds || []).map(pid => ({ id: pid, xp: c.participantStats[pid]?.xpGained || 0 })).sort((a, b) => b.xp - a.xp);
          c.winnerId = participants[0]?.id;
        } else {
          if (!c.participantStats[userId]) c.participantStats[userId] = { xpGained: 0, activitiesDone: 0 };
          c.participantStats[userId].xpGained += actualXpGain;
          c.participantStats[userId].activitiesDone += 1;
        }
        await setDoc(doc(db, 'challenges', c.id), clean(c));
      }
    });

    return { totalXp: user.gamification.xp, xpGained: actualXpGain, frGained: frGain, totalFr: user.gamification.frBalance };
  },

  // ── Salva snapshot do Top 3 de um período ────────────────────
  saveRankingSnapshot: async (period: 'weekly' | 'monthly', periodKey: string): Promise<void> => {
    try {
      const allUsers = await api.admin_getAllUsers();
      
      // Ordena pelo XP do período correto
      const sorted = allUsers
        .filter(u => u.username.toLowerCase() !== 'admin')
        .map(u => ({
          user: u,
          periodXp: period === 'weekly' ? (u.gamification.weeklyXp || 0) : (u.gamification.monthlyXp || 0),
          activities: period === 'weekly' ? (u.gamification.weeklyActivities || 0) : (u.gamification.monthlyActivities || 0),
        }))
        .filter(u => u.periodXp > 0)
        .sort((a, b) => b.periodXp - a.periodXp || b.activities - a.activities);

      if (sorted.length === 0) return;

      const top3: RankingEntry[] = sorted.slice(0, 3).map((item, index) => ({
        userId: item.user.userId,
        username: item.user.username,
        fullName: item.user.fullName,
        profilePhoto: item.user.profilePhoto,
        xp: item.periodXp,
        activitiesCount: item.activities,
        position: (index + 1) as 1 | 2 | 3,
      }));

      const label = period === 'weekly' ? getWeekLabel(periodKey) : getMonthLabel(periodKey);

      // Calcula datas aproximadas do período
      const now = new Date();
      const snapshot: RankingSnapshot = {
        id: `${period}_${periodKey}`,
        period,
        label,
        startDate: periodKey,
        endDate: now.toISOString().split('T')[0],
        top3,
        savedAt: Date.now(),
      };

      await setDoc(doc(db, 'ranking_snapshots', snapshot.id), clean(snapshot));

      // Envia notificações e badges apenas para snapshots semanais
      if (period === 'weekly') {
        await api.sendRankingNotifications(top3, label);
      }
    } catch (e) {
      console.error('Erro ao salvar snapshot de ranking:', e);
    }
  },

  // ── Envia notificações e atribui badges ao Top 3 ─────────────
  sendRankingNotifications: async (top3: RankingEntry[], weekLabel: string): Promise<void> => {
    for (const entry of top3) {
      try {
        const userRef = doc(db, 'users', entry.userId);
        const snap = await getDoc(userRef);
        if (!snap.exists()) continue;

        const user = snap.data() as UserSession;
        user.gamification = ensureNewFields(user.gamification);

        // Atribui badge semanal (coroa)
        const badge: WeeklyBadge = {
          position: entry.position,
          weekLabel,
          xp: entry.xp,
          awardedAt: Date.now(),
        };
        user.gamification.weeklyBadge = badge;

        // Cria notificação personalizada
        if (!user.notifications) user.notifications = [];
        const message = getCongratulationsMessage(entry.position, weekLabel, entry.xp);
        user.notifications.unshift({
          id: crypto.randomUUID(),
          message,
          date: Date.now(),
          read: false,
          sender: '🏆 Freedom Ranking',
        });

        await setDoc(userRef, clean(user));
      } catch (e) {
        console.error(`Erro ao notificar usuário ${entry.userId}:`, e);
      }
    }
  },

  // ── Busca histórico de snapshots de ranking ───────────────────
  getRankingHistory: async (period: 'weekly' | 'monthly', limitCount: number = 12): Promise<RankingSnapshot[]> => {
    try {
      const q = query(
        collection(db, 'ranking_snapshots'),
        where('period', '==', period),
        orderBy('savedAt', 'desc'),
        limit(limitCount)
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => d.data() as RankingSnapshot);
    } catch (e) {
      console.error('Erro ao buscar histórico de ranking:', e);
      return [];
    }
  },

  // ── Leaderboard com XP real por período ──────────────────────
  getLeaderboardData: async (filter: 'Weekly' | 'Monthly' | 'Annual'): Promise<{user: UserSession, periodXp: number, periodActivities: number}[]> => {
    const users = await api.admin_getAllUsers();
    
    return users
      .filter(u => u.username.toLowerCase() !== 'admin')
      .map(u => {
        let periodXp = 0;
        let periodActivities = 0;

        if (filter === 'Weekly') {
          // Usa XP semanal real — só conta se ainda estamos na mesma semana
          const currentWeekKey = getWeekKey();
          if (u.gamification.lastWeekKey === currentWeekKey) {
            periodXp = u.gamification.weeklyXp || 0;
            periodActivities = u.gamification.weeklyActivities || 0;
          }
        } else if (filter === 'Monthly') {
          const currentMonthKey = getMonthKey();
          if (u.gamification.lastMonthKey === currentMonthKey) {
            periodXp = u.gamification.monthlyXp || 0;
            periodActivities = u.gamification.monthlyActivities || 0;
          }
        } else {
          // Annual — usa sempre o XP total do usuário.
          // O yearlyXp só existe desde a atualização do sistema de períodos,
          // então usuários com XP anterior ficariam com números errados.
          // Como o app foi lançado em 2026, XP total = XP do ano.
          periodXp = u.gamification.xp || 0;
          periodActivities = u.gamification.totalActivities || 0;
        }

        return { user: u, periodXp, periodActivities };
      })
      .sort((a, b) => b.periodXp - a.periodXp || b.periodActivities - a.periodActivities);
  },

  savePlacementResult: async (userId: string, level: Level): Promise<UserSession> => {
    const userRef = doc(db, 'users', userId);
    const snap = await getDoc(userRef);
    if (!snap.exists()) throw new Error("User not found");
    const user = snap.data() as UserSession;
    user.gamification = ensureNewFields(user.gamification);
    user.gamification.lastPlacementLevel = level;
    user.gamification.lastPlacementDate = Date.now();
    await setDoc(userRef, clean(user));
    return user;
  },

  getPlan: async (userId: string): Promise<StudyPlan | null> => {
    const snap = await getDoc(doc(db, 'plans', userId));
    return snap.exists() ? (snap.data() as StudyPlan) : null;
  },

  savePlan: async (userId: string, plan: StudyPlan): Promise<void> => {
    await setDoc(doc(db, 'plans', userId), clean(plan));
  },

  deletePlan: async (userId: string): Promise<void> => {
    await deleteDoc(doc(db, 'plans', userId));
  },

  getHistory: async (userId: string): Promise<ActivityRecord[]> => {
    const q = query(collection(db, 'history'), where('userId', '==', userId));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as ActivityRecord).sort((a, b) => b.date - a.date);
  },

  saveActivity: async (userId: string, record: ActivityRecord): Promise<void> => {
    await setDoc(doc(db, 'history', record.id), clean({ ...record, userId }));
  },

  saveToActivityBank: async (level: Level, theme: Theme, subTopic: string, content: GeneratedContent): Promise<void> => {
    const bankRef = collection(db, 'bank');
    await addDoc(bankRef, clean({ level, theme, subTopic: subTopic.toLowerCase().trim(), content, createdAt: Date.now() }));
  },

  getRandomActivityFromBank: async (level: Level, theme: Theme, subTopic: string): Promise<any | null> => {
    const normalizedTopic = subTopic.toLowerCase().trim();
    const q = query(collection(db, 'bank'), where('level', '==', level), where('theme', '==', theme), where('subTopic', '==', normalizedTopic));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const matches = snap.docs.map(d => d.data());
    return matches[Math.floor(Math.random() * matches.length)];
  },

  cleanupExpiredActivities: async (): Promise<void> => {
    const cutoff = Date.now() - (90 * 24 * 60 * 60 * 1000);
    const q = query(collection(db, 'bank'), where('createdAt', '<', cutoff));
    const snap = await getDocs(q);
    snap.forEach(async (d) => await deleteDoc(doc(db, 'bank', d.id)));
  },

  getChallenges: async (): Promise<UserChallenge[]> => {
    const snap = await getDocs(collection(db, 'challenges'));
    const challenges = snap.docs.map(d => d.data() as UserChallenge);
    const now = Date.now();
    challenges.forEach(async (c) => {
      if (c.status === 'active' && now > c.endDate) {
        c.status = 'closed';
        const participants = (c.participantIds || []).map(pid => ({ id: pid, xp: c.participantStats[pid]?.xpGained || 0 })).sort((a, b) => b.xp - a.xp);
        c.winnerId = participants[0]?.id;
        await setDoc(doc(db, 'challenges', c.id), clean(c));
      }
    });
    return challenges;
  },

  saveChallenge: async (challenge: UserChallenge): Promise<void> => {
    await setDoc(doc(db, 'challenges', challenge.id), clean(challenge));
  },

  getMessages: async (userId: string): Promise<DirectMessage[]> => {
    const q1 = query(collection(db, 'messages'), where('senderId', '==', userId));
    const q2 = query(collection(db, 'messages'), where('receiverId', '==', userId));
    const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
    const msgsMap = new Map<string, DirectMessage>();
    snap1.forEach(d => msgsMap.set(d.id, d.data() as DirectMessage));
    snap2.forEach(d => msgsMap.set(d.id, d.data() as DirectMessage));
    return Array.from(msgsMap.values()).sort((a, b) => a.timestamp - b.timestamp);
  },

  sendMessage: async (msg: Omit<DirectMessage, 'id' | 'timestamp' | 'read'>): Promise<void> => {
    const id = crypto.randomUUID();
    await setDoc(doc(db, 'messages', id), clean({ ...msg, id, timestamp: Date.now(), read: false }));
  },

  markMessagesRead: async (userId: string, otherId: string): Promise<void> => {
    const q = query(collection(db, 'messages'), where('senderId', '==', otherId), where('receiverId', '==', userId));
    const snap = await getDocs(q);
    snap.forEach(async (d) => await updateDoc(doc(db, 'messages', d.id), { read: true }));
  },

  sendFollowRequest: async (fromId: string, toId: string): Promise<void> => {
    const userRef = doc(db, 'users', toId);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const user = snap.data() as UserSession;
      if (!user.gamification.followRequests) user.gamification.followRequests = [];
      if (!user.gamification.followRequests.includes(fromId)) {
        user.gamification.followRequests.push(fromId);
        await setDoc(userRef, clean(user));
      }
    }
  },

  respondToFollowRequest: async (userId: string, requesterId: string, accept: boolean): Promise<void> => {
    const userRef = doc(db, 'users', userId);
    const reqRef = doc(db, 'users', requesterId);
    const [userSnap, reqSnap] = await Promise.all([getDoc(userRef), getDoc(reqRef)]);
    if (userSnap.exists() && reqSnap.exists()) {
      const user = userSnap.data() as UserSession;
      const reqUser = reqSnap.data() as UserSession;
      user.gamification.followRequests = (user.gamification.followRequests || []).filter(id => id !== requesterId);
      if (accept) {
        if (!user.gamification.followers) user.gamification.followers = [];
        if (!user.gamification.following) user.gamification.following = [];
        if (!reqUser.gamification.followers) reqUser.gamification.followers = [];
        if (!reqUser.gamification.following) reqUser.gamification.following = [];
        if (!user.gamification.followers.includes(requesterId)) user.gamification.followers.push(requesterId);
        if (!reqUser.gamification.following.includes(userId)) reqUser.gamification.following.push(userId);
      }
      await Promise.all([setDoc(userRef, clean(user)), setDoc(reqRef, clean(reqUser))]);
    }
  },

  unfollow: async (userId: string, targetId: string): Promise<void> => {
    const userRef = doc(db, 'users', userId);
    const targetRef = doc(db, 'users', targetId);
    const [userSnap, targetSnap] = await Promise.all([getDoc(userRef), getDoc(targetRef)]);
    if (userSnap.exists() && targetSnap.exists()) {
      const user = userSnap.data() as UserSession;
      const targetUser = targetSnap.data() as UserSession;
      user.gamification.following = (user.gamification.following || []).filter(id => id !== targetId);
      targetUser.gamification.followers = (targetUser.gamification.followers || []).filter(id => id !== userId);
      await Promise.all([setDoc(userRef, clean(user)), setDoc(targetRef, clean(targetUser))]);
    }
  },

  admin_resetUserPassword: async (email: string, newPassword: string): Promise<boolean> => { return true; },
};
