import { Level, Theme, GeneratedContent, ActivityRecord, StudyPlan, UserSession, GuideCharacter, UserGamification, UserChallenge, DirectMessage, AdminNotification, RankingSnapshot, RankingEntry, WeeklyBadge, PlacementSkill, PlacementBankEntry, SkillPlacementResult, PlacementResults, PLACEMENT_VARIATIONS_PER_SKILL } from '../types';
import { JourneyContext, JourneyId, JourneyKind, JourneyProgressDoc } from '../journeys';
import { DAILY_LIMIT, EXTRA_DAILY_COST, todayKey } from '../dailyLimit';
import { deepFixEscapedText } from '../textFix';
import { auth, db, storage } from './firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, query, where, deleteDoc, addDoc, runTransaction } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// Endpoint da function que concede XP/moedas no servidor (à prova de fraude).
const AWARD_URL = import.meta.env.DEV
  ? 'http://localhost:8888/.netlify/functions/award-activity'
  : '/.netlify/functions/award-activity';

// Endpoint que entrega os exercícios da Journey to Fluency (busca no
// banco compartilhado e, só se não existir, gera com a IA).
const JOURNEY_URL = import.meta.env.DEV
  ? 'http://localhost:8888/.netlify/functions/journey-content'
  : '/.netlify/functions/journey-content';

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

// ══════════════════════════════════════════════════════════════
// NIVELAMENTO POR HABILIDADE — helpers e constantes
// ══════════════════════════════════════════════════════════════

// Custo em Freedom Reais (FR$) para refazer UMA habilidade dentro
// do período de cooldown. A primeira vez de cada habilidade é grátis.
const PLACEMENT_RETAKE_COST = 10;

// Dias que uma habilidade fica "bloqueada" para reteste gratuito
// após ser feita. Cada habilidade tem seu próprio ciclo.
const PLACEMENT_SKILL_COOLDOWN_DAYS = 30;

// Retorna a chave do trimestre de calendário fixo: "2026-Q3".
// Jan-Mar = Q1, Abr-Jun = Q2, Jul-Set = Q3, Out-Dez = Q4.
// É a chave que agrupa as variações do banco de perguntas: todas
// as questões geradas no mesmo trimestre compartilham esta chave,
// e o conteúdo se renova naturalmente quando o trimestre vira.
const getQuarterKey = (date: Date = new Date()): string => {
  const quarter = Math.floor(date.getMonth() / 3) + 1; // 0-2→1, 3-5→2, etc.
  return `${date.getFullYear()}-Q${quarter}`;
};

// Trimestre anterior — usado como rede de segurança quando o trimestre
// vira e o banco novo ainda está vazio. Sem isso, no dia 1º de cada
// trimestre TODO aluno cairia na geração ao vivo (lenta e sujeita a
// timeout), que é exatamente o que quebrava o nivelamento.
const getPreviousQuarterKey = (date: Date = new Date()): string => {
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  return quarter === 1 ? `${date.getFullYear() - 1}-Q4` : `${date.getFullYear()}-Q${quarter - 1}`;
};

// Monta o ID de um documento do banco de perguntas de forma
// determinística: sempre a mesma habilidade + trimestre + variação
// gera o mesmo ID. Isso evita duplicatas e facilita a leitura direta.
const buildBankId = (skill: PlacementSkill, quarterKey: string, variation: number): string =>
  `${skill}_${quarterKey}_v${variation}`;

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
  // Novo: nivelamento por habilidade (mapa vazio = nada nivelado ainda)
  placementResults: {},
  // Novo: pacote extra de exercícios (nenhum comprado)
  extraDailyAllowance: 0, extraDailyDate: null,
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
  // Nivelamento por habilidade: preserva o existente ou inicia vazio
  placementResults: gamification.placementResults ?? {},
  // Pacote extra de exercícios: perfis antigos nascem sem compra
  extraDailyAllowance: gamification.extraDailyAllowance ?? 0,
  extraDailyDate: gamification.extraDailyDate ?? null,
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

  // ── Conta +1 exercício do dia, de forma ATÔMICA ────────────────
  // Usa transação porque antes era ler-modificar-gravar solto: se duas
  // gravações se cruzassem, uma sobrescrevia a outra e o contador saía
  // errado. Dentro da transação o Firestore garante que a leitura e a
  // escrita enxerguem o mesmo estado.
  incrementActivityCount: async (userId: string): Promise<number> => {
    const userRef = doc(db, 'users', userId);
    return runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
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
      tx.set(userRef, clean(user));
      return user.gamification.dailyActivitiesCount;
    });
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

  // ── completeActivity: concede XP/moedas pelo SERVIDOR ────────
  // O cálculo do XP (a partir da nota), a regra "só na 1ª vez"
  // (repetição pelo botão Refazer ou pela aba Histórico = 0 XP) e
  // o teto de 800 XP/dia são aplicados na function award-activity,
  // com Admin SDK — o aluno NÃO consegue forjar pontos. O cliente
  // só envia o resultado e a identidade dele vem do token de login.
  completeActivity: async (
    input: { level: Level; theme: Theme; topic: string; type: 'quiz' | 'writing'; score: number; total: number; journey?: JourneyContext | null }
  ): Promise<{ totalXp: number; xpGained: number; frGained: number; totalFr: number; isRepeat: boolean; record: ActivityRecord; pct?: number; journeyProgressSaved?: boolean }> => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('Sua sessão expirou. Faça login novamente.');
    const res = await fetch(AWARD_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || `Erro ${res.status}`);
    }
    return res.json();
  },

  // ── Apuração do ranking: agora é 100% servidor ────────────────
  // updateXp / saveRankingSnapshot / sendRankingNotifications foram
  // removidos daqui. O XP é concedido por netlify/functions/
  // award-activity.js e o Top 3 de cada semana/mês é apurado por
  // ranking-snapshot-background.js, somando a coleção `history`.
  // Manter uma segunda versão no navegador só criava pódios
  // divergentes — e um aluno podia forjá-los.

  // ── Busca histórico de snapshots de ranking ───────────────────
  getRankingHistory: async (period: 'weekly' | 'monthly', limitCount: number = 12): Promise<RankingSnapshot[]> => {
    try {
      // Sem orderBy de propósito. Combinar where + orderBy exige um
      // índice composto no Firestore que nunca foi criado; a consulta
      // falhava, o catch abaixo devolvia [] e o Hall da Fama aparecia
      // vazio mesmo com os dados gravados. Filtrar por período usa o
      // índice automático de campo único, e a ordenação sai aqui — são
      // poucas dezenas de documentos.
      const q = query(collection(db, 'ranking_snapshots'), where('period', '==', period));
      const snap = await getDocs(q);
      return snap.docs
        .map(d => d.data() as RankingSnapshot)
        .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0) || String(b.startDate).localeCompare(String(a.startDate)))
        .slice(0, limitCount);
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

  // ══════════════════════════════════════════════════════════════
  // NIVELAMENTO POR HABILIDADE (Etapa 2 — camada de dados)
  // ══════════════════════════════════════════════════════════════

  // ── Ler as variações disponíveis de uma habilidade no trimestre ──
  // Retorna todas as variações (1-3) já geradas para a habilidade no
  // trimestre atual. O front usa isto para: (a) saber quantas já
  // existem, e (b) sortear uma para o aluno responder.
  getPlacementBankEntries: async (skill: PlacementSkill, quarterKey: string = getQuarterKey()): Promise<PlacementBankEntry[]> => {
    const q = query(
      collection(db, 'placement_bank'),
      where('skill', '==', skill),
      where('quarterKey', '==', quarterKey)
    );
    const snap = await getDocs(q);
    return snap.docs
      .map(d => d.data() as PlacementBankEntry)
      .sort((a, b) => a.variation - b.variation);
  },

  // ── Sortear uma variação para o aluno responder ─────────────────
  // Entre as variações prontas, escolhe uma ao acaso. Se o trimestre
  // atual ainda não tem nenhuma (virada de trimestre), cai para o
  // trimestre anterior em vez de deixar o aluno esperando a geração.
  // Retorna null só quando não existe absolutamente nada.
  getRandomPlacementVariation: async (skill: PlacementSkill): Promise<PlacementBankEntry | null> => {
    let entries = await api.getPlacementBankEntries(skill);
    if (entries.length === 0) {
      entries = await api.getPlacementBankEntries(skill, getPreviousQuarterKey());
    }
    if (entries.length === 0) return null;
    const idx = Math.floor(Math.random() * entries.length);
    // Conserta "\n" literal gravado por gerações antigas (textFix.ts)
    return deepFixEscapedText(entries[idx]);
  },

  // ── Verificar se o banco de uma habilidade precisa de mais variações ──
  // Regra de "preenchimento gradual": enquanto houver menos de 3
  // variações no trimestre, o próximo nivelamento daquela habilidade
  // deve gerar mais uma. Retorna o número da próxima variação a gerar
  // (1, 2 ou 3) ou null se as três já existem.
  getNextVariationToGenerate: async (skill: PlacementSkill): Promise<number | null> => {
    const entries = await api.getPlacementBankEntries(skill);
    if (entries.length >= PLACEMENT_VARIATIONS_PER_SKILL) return null;
    // A próxima variação é o menor número de 1..3 ainda ausente
    const existing = new Set(entries.map(e => e.variation));
    for (let v = 1; v <= PLACEMENT_VARIATIONS_PER_SKILL; v++) {
      if (!existing.has(v)) return v;
    }
    return null;
  },

  // ── Gravar uma variação no banco (chamada pela Background Function) ──
  // Escreve o conjunto de questões (ou o prompt de writing) no Firestore.
  // O ID é determinístico (skill_trimestre_variação), então regerar a
  // mesma variação sobrescreve em vez de duplicar. Na Etapa 3, quem
  // chama isto é a Background Function via Admin SDK; aqui deixamos a
  // função pronta para uso a partir do cliente também, se necessário.
  savePlacementBankEntry: async (entry: PlacementBankEntry): Promise<void> => {
    const id = entry.id || buildBankId(entry.skill, entry.quarterKey, entry.variation);
    const ref = doc(db, 'placement_bank', id);
    await setDoc(ref, clean({ ...entry, id }));
  },

  // ── Estado de nivelamento de uma habilidade para um usuário ─────
  // Retorna se o aluno pode fazer a habilidade de graça, se precisa
  // pagar (dentro do cooldown de 30 dias), e os dados do último
  // resultado. É o que o dashboard da Etapa 4 usa para pintar cada
  // habilidade em um dos três estados (nunca feita / paga / livre).
  getSkillPlacementStatus: (user: UserSession, skill: PlacementSkill): {
    state: 'never' | 'cooldown' | 'free_again';
    result: SkillPlacementResult | null;
    daysLeft: number;
    retakeCost: number;
  } => {
    const results = user.gamification.placementResults || {};
    const result = results[skill] || null;
    if (!result) {
      return { state: 'never', result: null, daysLeft: 0, retakeCost: 0 };
    }
    const daysSince = (Date.now() - result.completedAt) / (1000 * 60 * 60 * 24);
    if (daysSince >= PLACEMENT_SKILL_COOLDOWN_DAYS) {
      return { state: 'free_again', result, daysLeft: 0, retakeCost: 0 };
    }
    return {
      state: 'cooldown',
      result,
      daysLeft: Math.ceil(PLACEMENT_SKILL_COOLDOWN_DAYS - daysSince),
      retakeCost: PLACEMENT_RETAKE_COST,
    };
  },

  // ── Salvar o resultado de UMA habilidade ────────────────────────
  // Grava o nível atingido, pontuação e timestamp (base do cooldown).
  // Usa transação para não sobrescrever, por engano, resultados de
  // outras habilidades gravados quase ao mesmo tempo.
  saveSkillPlacementResult: async (
    userId: string,
    skill: PlacementSkill,
    result: SkillPlacementResult
  ): Promise<UserSession> => {
    const userRef = doc(db, 'users', userId);
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists()) throw new Error("Usuário não encontrado.");
      const user = snap.data() as UserSession;
      user.gamification = ensureNewFields(user.gamification);
      const results = { ...(user.gamification.placementResults || {}) };
      results[skill] = result;
      user.gamification.placementResults = results;
      tx.set(userRef, clean(user));
      return user;
    });
  },

  // ── Cobrar FR$10 para refazer uma habilidade (ATÔMICO) ──────────
  // Desconta o saldo SOMENTE se houver saldo suficiente, numa única
  // transação indivisível. Retorna o novo saldo em caso de sucesso.
  // Se o saldo for insuficiente, lança erro e NADA é descontado.
  // A validação real de "pode ou não pagar" acontece aqui e não só
  // no front — mesmo tendo combinado validação leve no cliente, o
  // desconto em si precisa ser atômico para nunca furar o saldo.
  chargePlacementRetake: async (userId: string, skill: PlacementSkill): Promise<{ newBalance: number }> => {
    const userRef = doc(db, 'users', userId);
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists()) throw new Error("Usuário não encontrado.");
      const user = snap.data() as UserSession;
      user.gamification = ensureNewFields(user.gamification);
      const balance = user.gamification.frBalance || 0;
      if (balance < PLACEMENT_RETAKE_COST) {
        throw new Error(`Saldo insuficiente. Você tem FR$ ${balance.toFixed(2)} e o reteste custa FR$ ${PLACEMENT_RETAKE_COST.toFixed(2)}.`);
      }
      user.gamification.frBalance = balance - PLACEMENT_RETAKE_COST;
      tx.set(userRef, clean(user));
      return { newBalance: user.gamification.frBalance };
    });
  },

  // ── Comprar pacote extra de +8 exercícios para HOJE (ATÔMICO) ───
  // Mesmo padrão do chargePlacementRetake: numa única transação,
  // confere o saldo, desconta FR$10 e credita +8 exercícios com o
  // carimbo de hoje. Se o saldo for insuficiente, lança erro e NADA
  // muda. Comprar de novo no mesmo dia soma mais 8.
  purchaseExtraDaily: async (userId: string): Promise<{ newBalance: number; user: UserSession }> => {
    const userRef = doc(db, 'users', userId);
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists()) throw new Error("Usuário não encontrado.");
      const user = snap.data() as UserSession;
      user.gamification = ensureNewFields(user.gamification);
      const balance = user.gamification.frBalance || 0;
      if (balance < EXTRA_DAILY_COST) {
        throw new Error(`Saldo insuficiente: você tem FR$ ${balance.toFixed(2)} e o pacote custa FR$ ${EXTRA_DAILY_COST.toFixed(2)}. Complete exercícios para ganhar mais FR$!`);
      }
      const today = todayKey();
      const boughtToday = user.gamification.extraDailyDate === today;
      user.gamification.frBalance = balance - EXTRA_DAILY_COST;
      user.gamification.extraDailyAllowance = (boughtToday ? (user.gamification.extraDailyAllowance || 0) : 0) + DAILY_LIMIT;
      user.gamification.extraDailyDate = today;
      tx.set(userRef, clean(user));
      return { newBalance: user.gamification.frBalance, user };
    });
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

  // ── Reaproveita uma atividade já gerada para o mesmo tópico ─────
  // minVariations: só reaproveita quando o banco JÁ tem pelo menos
  // esse número de versões diferentes do tópico. Enquanto tiver
  // menos, devolve null de propósito, para o app gerar uma versão
  // nova e ir acumulando variedade. Sem isso, a PRIMEIRA versão
  // gerada de cada tópico ficava sendo servida para sempre — foi o
  // que fez os mesmos personagens (Sarah, Mark, Leo) se repetirem.
  getRandomActivityFromBank: async (level: Level, theme: Theme, subTopic: string, minVariations = 1): Promise<any | null> => {
    const normalizedTopic = subTopic.toLowerCase().trim();
    const q = query(collection(db, 'bank'), where('level', '==', level), where('theme', '==', theme), where('subTopic', '==', normalizedTopic));
    const snap = await getDocs(q);
    const matches = snap.docs.map(d => d.data());
    if (matches.length < minVariations) return null;
    // Conserta "\n" literal gravado por gerações antigas (textFix.ts)
    return deepFixEscapedText(matches[Math.floor(Math.random() * matches.length)]);
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

  // ══════════════════════════════════════════════════════════════
  // JOURNEY TO FLUENCY
  // ══════════════════════════════════════════════════════════════

  // ── Progresso do aluno na trilha ──────────────────────────────
  // Documento journey_progress/{uid}, escrito SÓ pelo servidor
  // (award-activity). O cliente apenas lê: assim ninguém marca um
  // Step como concluído pelo DevTools para pular a fila.
  getJourneyProgress: async (userId: string): Promise<JourneyProgressDoc | null> => {
    try {
      const snap = await getDoc(doc(db, 'journey_progress', userId));
      return snap.exists() ? (snap.data() as JourneyProgressDoc) : null;
    } catch (e) {
      console.error('Erro ao ler progresso da jornada:', e);
      return null;
    }
  },

  // ── Busca (ou manda gerar) UM exercício da trilha ─────────────
  // A function devolve do banco compartilhado quando já existe —
  // é o que impede a plataforma de gastar créditos de IA de novo a
  // cada aluno. 'cached' diz qual dos dois casos aconteceu (útil
  // para o front mostrar "preparando" só quando é geração real).
  getJourneyExercise: async (
    journeyId: JourneyId, season: number, node: number, kind: JourneyKind
  ): Promise<{ content: GeneratedContent; cached: boolean }> => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('Sua sessão expirou. Faça login novamente.');
    const res = await fetch(JOURNEY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ journeyId, season, node, kind }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || `Erro ${res.status}`);
    }
    const data = await res.json();
    // Conserta "\n" literal em exercícios já gravados no journey_bank
    return { content: deepFixEscapedText(data.content as GeneratedContent), cached: !!data.cached };
  },
};
