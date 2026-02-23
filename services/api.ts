import { Level, Theme, GeneratedContent, ActivityRecord, StudyPlan, UserSession, GuideCharacter, UserGamification, UserChallenge, DirectMessage, AdminNotification } from '../types';
import { auth, db } from './firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, query, where, deleteDoc } from 'firebase/firestore';

const INITIAL_GAMIFICATION: UserGamification = {
  xp: 0,
  frBalance: 0,
  streak: 0,
  lastLoginDate: null,
  dailyXpEarned: 0,
  lastXpGainDate: null,
  dailyActivitiesCount: 0,
  lastActivityDate: null,
  isPro: false,
  dailyChatCount: 0,
  lastChatDate: null,
  followers: [],
  following: [],
  followRequests: [],
  totalActivities: 0,
};

const clean = (obj: any) => JSON.parse(JSON.stringify(obj));

export const api = {
  // 💡 NOVA FUNÇÃO: Monitora se o usuário ainda está logado no navegador
  subscribeToAuthChanges: (callback: (user: any) => void) => {
    return onAuthStateChanged(auth, callback);
  },

  // 💡 NOVA FUNÇÃO: Busca os dados do aluno pelo ID único (UID)
  getUserProfile: async (uid: string): Promise<UserSession | null> => {
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      return userSnap.data() as UserSession;
    }
    return null;
  },

  logout: async () => {
    await signOut(auth);
  },

  login: async (identifier: string, password?: string): Promise<UserSession | null> => {
    const today = new Date().toISOString().split('T')[0];

    if (identifier.toLowerCase() === 'admin' && password === 'f1') {
      const adminRef = doc(db, 'users', 'admin-root-id');
      const adminSnap = await getDoc(adminRef);
      let adminData: UserSession;

      if (!adminSnap.exists()) {
        adminData = {
          userId: 'admin-root-id',
          username: 'admin',
          userName: 'Admin',
          fullName: 'Freedom Administrator',
          age: '99',
          gender: 'Root',
          email: 'admin@freedom.app',
          guide: 'Fred',
          gamification: { ...INITIAL_GAMIFICATION, isPro: true, lastLoginDate: today },
          notifications: []
        };
      } else {
        adminData = adminSnap.data() as UserSession;
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
    } catch (e) {
      console.error("Erro no login:", e);
      return null;
    }
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

  register: async (userData: { username: string, fullName: string, age: string, gender: string, email: string, password?: string, profilePhoto?: string }): Promise<UserSession> => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, userData.email, userData.password || '123456');
      const uid = userCredential.user.uid;
      const firstName = userData.fullName.split(' ')[0] || userData.username.replace('@', '');

      let finalUsername = userData.username.toLowerCase();
      if (finalUsername === '@admin') finalUsername = 'admin';

      const newUser: UserSession = {
        userId: uid,
        username: finalUsername, 
        userName: firstName,
        fullName: userData.fullName,
        age: userData.age,
        gender: userData.gender,
        email: userData.email,
        profilePhoto: userData.profilePhoto,
        guide: 'Fred',
        gamification: { 
          ...INITIAL_GAMIFICATION, 
          lastLoginDate: new Date().toISOString().split('T')[0], 
          streak: 1,
          isPro: finalUsername === 'admin' 
        },
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
    try {
      await sendPasswordResetEmail(auth, email);
      return { success: true };
    } catch (e) {
      return { success: false };
    }
  },

  resetPassword: async (email: string, newPassword: string): Promise<boolean> => {
    return true;
  },

  admin_getAllUsers: async (): Promise<UserSession[]> => {
    const snap = await getDocs(collection(db, 'users'));
    return snap.docs.map(d => d.data() as UserSession);
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
      user.gamification.xp += xpDelta;
      user.gamification.frBalance += frDelta;
      await setDoc(userRef, clean(user));
    }
  },

  admin_resetUserPassword: async (email: string, newPassword: string): Promise<boolean> => {
    return true; 
  },

  admin_sendNotification: async (userId: string, message: string): Promise<void> => {
    const userRef = doc(db, 'users', userId);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const user = snap.data() as UserSession;
      if (!user.notifications) user.notifications = [];
      user.notifications.unshift({
        id: crypto.randomUUID(),
        message,
        date: Date.now(),
        read: false,
        sender: 'Admin Freedom'
      });
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
        if (nIdx !== -1) {
          user.notifications[nIdx].read = true;
          await setDoc(userRef, clean(user));
        }
      }
    }
  },

  saveUser: async (user: UserSession) => {
    await setDoc(doc(db, 'users', user.userId), clean(user));
  },

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

  updateXp: async (userId: string, xpGain: number): Promise<{ totalXp: number, xpGained: number, frGained: number, totalFr: number }> => {
    const userRef = doc(db, 'users', userId);
    const snap = await getDoc(userRef);
    if (!snap.exists()) throw new Error("User not found");
    const user = snap.data() as UserSession;
    const frGain = xpGain / 100;
    user.gamification.xp += xpGain;
    user.gamification.frBalance = (user.gamification.frBalance || 0) + frGain;
    user.gamification.dailyXpEarned += xpGain; 
    await setDoc(userRef, clean(user));

    const challengesSnap = await getDocs(collection(db, 'challenges'));
    const now = Date.now();
    challengesSnap.forEach(async (d) => {
      const c = d.data() as UserChallenge;
      if (c.status === 'active' && (c.participantIds || []).includes(userId)) {
        if (now > c.endDate) {
          c.status = 'closed';
          const participants = (c.participantIds || []).map(pid => ({
            id: pid, xp: c.participantStats[pid]?.xpGained || 0
          })).sort((a, b) => b.xp - a.xp);
          c.winnerId = participants[0]?.id;
        } else {
          if (!c.participantStats[userId]) c.participantStats[userId] = { xpGained: 0, activitiesDone: 0 };
          c.participantStats[userId].xpGained += xpGain;
          c.participantStats[userId].activitiesDone += 1;
        }
        await setDoc(doc(db, 'challenges', c.id), clean(c));
      }
    });

    return { totalXp: user.gamification.xp, xpGained: xpGain, frGained: frGain, totalFr: user.gamification.frBalance };
  },

  savePlacementResult: async (userId: string, level: Level): Promise<UserSession> => {
    const userRef = doc(db, 'users', userId);
    const snap = await getDoc(userRef);
    if (!snap.exists()) throw new Error("User not found");
    const user = snap.data() as UserSession;
    user.gamification.lastPlacementLevel = level;
    user.gamification.lastPlacementDate = Date.now();
    await setDoc(userRef, clean(user));
    return user;
  },

  getLeaderboardData: async (filter: 'Weekly' | 'Monthly' | 'Annual'): Promise<{user: UserSession, periodXp: number}[]> => {
    const users = await api.admin_getAllUsers();
    const now = Date.now();
    const msPerDay = 24 * 60 * 60 * 1000;
    let timeframe = Infinity;
    if (filter === 'Weekly') timeframe = 7 * msPerDay;
    else if (filter === 'Monthly') timeframe = 30 * msPerDay;
    return users.map(u => {
      const finalXp = filter === 'Annual' ? u.gamification.xp : Math.floor(u.gamification.xp * (timeframe === Infinity ? 1 : 0.5)); 
      return { user: u, periodXp: finalXp };
    }).sort((a, b) => b.periodXp - a.periodXp);
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
    const id = crypto.randomUUID();
    await setDoc(doc(db, 'bank', id), clean({ id, level, theme, subTopic, content, createdAt: Date.now() }));
  },

  getRandomActivityFromBank: async (level: Level, theme: Theme, subTopic: string): Promise<any | null> => {
    const q = query(collection(db, 'bank'), where('level', '==', level), where('theme', '==', theme));
    const snap = await getDocs(q);
    const matches = snap.docs.map(d => d.data()).filter(item => item.subTopic.toLowerCase().includes(subTopic.toLowerCase()));
    if (matches.length === 0) return null;
    return matches[Math.floor(Math.random() * matches.length)];
  },

  cleanupExpiredActivities: async (): Promise<void> => {
    const cutoff = Date.now() - (90 * 24 * 60 * 60 * 1000);
    const q = query(collection(db, 'bank'), where('createdAt', '<', cutoff));
    const snap = await getDocs(q);
    snap.forEach(d => deleteDoc(doc(db, 'bank', d.id)));
  },

  getChallenges: async (): Promise<UserChallenge[]> => {
    const snap = await getDocs(collection(db, 'challenges'));
    const challenges = snap.docs.map(d => d.data() as UserChallenge);
    const now = Date.now();
    challenges.forEach(async (c) => {
      if (c.status === 'active' && now > c.endDate) {
        c.status = 'closed';
        const participants = (c.participantIds || []).map(pid => ({
          id: pid, xp: c.participantStats[pid]?.xpGained || 0
        })).sort((a, b) => b.xp - a.xp);
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
    snap.forEach(async (d) => {
      await updateDoc(doc(db, 'messages', d.id), { read: true });
    });
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

  respondToFollowRequest: async (userId: string, requesterId: string, accept: Promise<void> | boolean): Promise<void> => {
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
  }
};
