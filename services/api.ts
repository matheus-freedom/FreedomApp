
import { Level, Theme, GeneratedContent, ActivityRecord, StudyPlan, UserSession, GuideCharacter, UserGamification, UserChallenge, DirectMessage, AdminNotification } from '../types';

const STORAGE_KEYS = {
  USERS: 'freedom_users',
  PLANS: 'freedom_plans',
  HISTORY: 'freedom_history',
  BANK: 'freedom_activity_bank',
  CHALLENGES: 'freedom_challenges',
  MESSAGES: 'freedom_messages',
};

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

const getFromStorage = <T>(key: string, defaultValue: T): T => {
  const data = localStorage.getItem(key);
  if (!data) return defaultValue;
  try {
    return JSON.parse(data);
  } catch (e) {
    return defaultValue;
  }
};

const saveToStorage = <T>(key: string, data: T): void => {
  localStorage.setItem(key, JSON.stringify(data));
};

export const api = {
  // --- Auth ---
  login: async (identifier: string, password?: string): Promise<UserSession | null> => {
    const users = getFromStorage<UserSession[]>(STORAGE_KEYS.USERS, []);
    const today = new Date().toISOString().split('T')[0];

    if (identifier.toLowerCase() === 'admin' && password === 'f1') {
      let admin = users.find(u => u.username.toLowerCase() === 'admin');
      
      if (!admin) {
        admin = {
          userId: 'admin-root-id',
          username: 'admin',
          userName: 'Admin',
          fullName: 'Freedom Administrator',
          age: '∞',
          gender: 'Root',
          email: 'admin@freedom.app',
          password: 'f1',
          guide: 'Fred',
          gamification: { ...INITIAL_GAMIFICATION, isPro: true },
          notifications: []
        };
        users.push(admin);
        saveToStorage(STORAGE_KEYS.USERS, users);
      }
      
      admin.gamification.isPro = true; 
      admin.gamification.lastLoginDate = today;
      
      api.saveUser(admin);
      return admin;
    }

    const user = users.find(u => 
      u.email.toLowerCase() === identifier.toLowerCase() || 
      u.username.toLowerCase() === identifier.toLowerCase()
    );
    
    if (user && password !== undefined) {
      if (user.password !== password) {
        return null;
      }
    }
    
    if (user) {
      const lastLogin = user.gamification.lastLoginDate;

      if (lastLogin) {
        const lastDate = new Date(lastLogin);
        const todayDate = new Date(today);
        const diffDays = Math.floor((todayDate.getTime() - lastDate.getTime()) / (1000 * 3600 * 24));

        if (diffDays === 1) {
          user.gamification.streak += 1;
        } else if (diffDays > 1) {
          user.gamification.streak = 1;
        }
      } else {
        user.gamification.streak = 1;
      }

      if (user.gamification.lastActivityDate !== today) {
        user.gamification.dailyActivitiesCount = 0;
        user.gamification.dailyXpEarned = 0;
      }

      if (user.gamification.lastChatDate !== today) {
        user.gamification.dailyChatCount = 0;
        user.gamification.lastChatDate = today;
      }
      
      user.gamification.lastLoginDate = today;
      api.saveUser(user);
    }
    
    return user || null;
  },

  isUsernameTaken: async (username: string): Promise<boolean> => {
    const normalized = username.toLowerCase();
    if (normalized === 'tester' || normalized === 'admin') return true;
    const users = getFromStorage<UserSession[]>(STORAGE_KEYS.USERS, []);
    return users.some(u => u.username.toLowerCase() === normalized);
  },

  register: async (userData: { username: string, fullName: string, age: string, gender: string, email: string, password?: string, profilePhoto?: string }): Promise<UserSession> => {
    const users = getFromStorage<UserSession[]>(STORAGE_KEYS.USERS, []);
    const normalizedUsername = userData.username.toLowerCase();
    
    if (users.some(u => u.email.toLowerCase() === userData.email.toLowerCase())) {
      throw new Error("Já existe uma conta vinculada a este e-mail.");
    }

    const firstName = userData.fullName.split(' ')[0] || userData.username.replace('@', '');

    const newUser: UserSession = {
      userId: crypto.randomUUID(),
      username: userData.username, 
      userName: firstName,
      fullName: userData.fullName,
      age: userData.age,
      gender: userData.gender,
      email: userData.email,
      password: userData.password || '123456',
      profilePhoto: userData.profilePhoto,
      guide: 'Fred',
      gamification: { ...INITIAL_GAMIFICATION, lastLoginDate: new Date().toISOString().split('T')[0], streak: 1 },
      notifications: []
    };
    users.push(newUser);
    saveToStorage(STORAGE_KEYS.USERS, users);
    return newUser;
  },

  // Added missing requestPasswordReset method
  requestPasswordReset: async (email: string): Promise<{ success: boolean; resetToken?: string }> => {
    const users = getFromStorage<UserSession[]>(STORAGE_KEYS.USERS, []);
    const exists = users.some(u => u.email.toLowerCase() === email.toLowerCase());
    if (!exists) return { success: false };
    return { success: true, resetToken: 'dummy-token-' + Date.now() };
  },

  // Added missing resetPassword method
  resetPassword: async (email: string, newPassword: string): Promise<boolean> => {
    const users = getFromStorage<UserSession[]>(STORAGE_KEYS.USERS, []);
    const idx = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
    if (idx === -1) return false;
    users[idx].password = newPassword;
    saveToStorage(STORAGE_KEYS.USERS, users);
    return true;
  },

  // --- Admin Methods ---
  admin_getAllUsers: async (): Promise<UserSession[]> => {
    return getFromStorage<UserSession[]>(STORAGE_KEYS.USERS, []);
  },

  admin_getAllPlans: async (): Promise<Record<string, StudyPlan>> => {
    return getFromStorage<Record<string, StudyPlan>>(STORAGE_KEYS.PLANS, {});
  },

  admin_getUserHistory: async (userId: string): Promise<ActivityRecord[]> => {
    const history = getFromStorage<Record<string, ActivityRecord[]>>(STORAGE_KEYS.HISTORY, {});
    return history[userId] || [];
  },

  admin_updateUserGamification: async (userId: string, xpDelta: number, frDelta: number): Promise<void> => {
    const users = getFromStorage<UserSession[]>(STORAGE_KEYS.USERS, []);
    const idx = users.findIndex(u => u.userId === userId);
    if (idx !== -1) {
      users[idx].gamification.xp += xpDelta;
      users[idx].gamification.frBalance += frDelta;
      saveToStorage(STORAGE_KEYS.USERS, users);
    }
  },

  admin_resetUserPassword: async (email: string, newPassword: string): Promise<boolean> => {
    const users = getFromStorage<UserSession[]>(STORAGE_KEYS.USERS, []);
    const idx = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
    if (idx === -1) return false;
    users[idx].password = newPassword;
    saveToStorage(STORAGE_KEYS.USERS, users);
    return true;
  },

  admin_sendNotification: async (userId: string, message: string): Promise<void> => {
    const users = getFromStorage<UserSession[]>(STORAGE_KEYS.USERS, []);
    const idx = users.findIndex(u => u.userId === userId);
    if (idx !== -1) {
      if (!users[idx].notifications) users[idx].notifications = [];
      users[idx].notifications!.unshift({
        id: crypto.randomUUID(),
        message,
        date: Date.now(),
        read: false,
        sender: 'Admin Freedom'
      });
      saveToStorage(STORAGE_KEYS.USERS, users);
    }
  },

  markNotificationRead: async (userId: string, notificationId: string): Promise<void> => {
    const users = getFromStorage<UserSession[]>(STORAGE_KEYS.USERS, []);
    const idx = users.findIndex(u => u.userId === userId);
    if (idx !== -1 && users[idx].notifications) {
      const nIdx = users[idx].notifications!.findIndex(n => n.id === notificationId);
      if (nIdx !== -1) {
        users[idx].notifications![nIdx].read = true;
        saveToStorage(STORAGE_KEYS.USERS, users);
      }
    }
  },

  // --- Common Methods ---
  saveUser: (user: UserSession) => {
    const users = getFromStorage<UserSession[]>(STORAGE_KEYS.USERS, []);
    const index = users.findIndex(u => u.userId === user.userId);
    if (index !== -1) {
      users[index] = user;
      saveToStorage(STORAGE_KEYS.USERS, users);
    }
  },

  updateGuide: async (userId: string, guide: GuideCharacter): Promise<void> => {
    const users = getFromStorage<UserSession[]>(STORAGE_KEYS.USERS, []);
    const index = users.findIndex(u => u.userId === userId);
    if (index !== -1) {
      users[index].guide = guide;
      saveToStorage(STORAGE_KEYS.USERS, users);
    }
  },

  incrementActivityCount: async (userId: string): Promise<number> => {
    const users = getFromStorage<UserSession[]>(STORAGE_KEYS.USERS, []);
    const index = users.findIndex(u => u.userId === userId);
    if (index === -1) throw new Error("User not found");
    const today = new Date().toISOString().split('T')[0];
    const user = users[index];
    if (user.gamification.lastActivityDate !== today) {
      user.gamification.dailyActivitiesCount = 1;
      user.gamification.lastActivityDate = today;
    } else {
      user.gamification.dailyActivitiesCount += 1;
    }
    saveToStorage(STORAGE_KEYS.USERS, users);
    return user.gamification.dailyActivitiesCount;
  },

  incrementChatCount: async (userId: string): Promise<number> => {
    const users = getFromStorage<UserSession[]>(STORAGE_KEYS.USERS, []);
    const index = users.findIndex(u => u.userId === userId);
    if (index === -1) throw new Error("User not found");
    const today = new Date().toISOString().split('T')[0];
    const user = users[index];
    if (user.gamification.lastChatDate !== today) {
      user.gamification.dailyChatCount = 1;
      user.gamification.lastChatDate = today;
    } else {
      user.gamification.dailyChatCount = (user.gamification.dailyChatCount || 0) + 1;
    }
    saveToStorage(STORAGE_KEYS.USERS, users);
    return user.gamification.dailyChatCount;
  },

  updateXp: async (userId: string, xpGain: number): Promise<{ totalXp: number, xpGained: number, frGained: number, totalFr: number }> => {
    const users = getFromStorage<UserSession[]>(STORAGE_KEYS.USERS, []);
    const index = users.findIndex(u => u.userId === userId);
    if (index === -1) throw new Error("User not found");
    const user = users[index];
    const frGain = xpGain / 100;
    user.gamification.xp += xpGain;
    user.gamification.frBalance = (user.gamification.frBalance || 0) + frGain;
    user.gamification.dailyXpEarned += xpGain; 
    saveToStorage(STORAGE_KEYS.USERS, users);

    // Update active challenges
    const challenges = getFromStorage<UserChallenge[]>(STORAGE_KEYS.CHALLENGES, []);
    const now = Date.now();
    let updated = false;
    challenges.forEach(c => {
      if (c.status === 'active' && (c.participantIds || []).includes(userId)) {
        if (now > c.endDate) {
          c.status = 'closed';
          // Determine winner
          const participants = (c.participantIds || []).map(pid => ({
            id: pid,
            xp: c.participantStats[pid]?.xpGained || 0
          })).sort((a, b) => b.xp - a.xp);
          c.winnerId = participants[0]?.id;
        } else {
          if (!c.participantStats[userId]) {
            c.participantStats[userId] = { xpGained: 0, activitiesDone: 0 };
          }
          c.participantStats[userId].xpGained += xpGain;
          c.participantStats[userId].activitiesDone += 1;
        }
        updated = true;
      }
    });

    if (updated) {
      saveToStorage(STORAGE_KEYS.CHALLENGES, challenges);
    }

    return { totalXp: user.gamification.xp, xpGained: xpGain, frGained: frGain, totalFr: user.gamification.frBalance };
  },

  savePlacementResult: async (userId: string, level: Level): Promise<UserSession> => {
    const users = getFromStorage<UserSession[]>(STORAGE_KEYS.USERS, []);
    const index = users.findIndex(u => u.userId === userId);
    if (index === -1) throw new Error("User not found");
    const user = users[index];
    user.gamification.lastPlacementLevel = level;
    user.gamification.lastPlacementDate = Date.now();
    saveToStorage(STORAGE_KEYS.USERS, users);
    return user;
  },

  getLeaderboardData: async (filter: 'Weekly' | 'Monthly' | 'Annual'): Promise<{user: UserSession, periodXp: number}[]> => {
    const users = await api.admin_getAllUsers();
    const historyMap = getFromStorage<Record<string, ActivityRecord[]>>(STORAGE_KEYS.HISTORY, {});
    const now = Date.now();
    const msPerDay = 24 * 60 * 60 * 1000;
    let timeframe = Infinity;
    if (filter === 'Weekly') timeframe = 7 * msPerDay;
    else if (filter === 'Monthly') timeframe = 30 * msPerDay;
    return users.map(u => {
      const userHistory = historyMap[u.userId] || [];
      const periodXp = userHistory
        .filter(record => (now - record.date) <= timeframe)
        .reduce((sum, record) => sum + record.xpGained, 0);
      const finalXp = filter === 'Annual' ? u.gamification.xp : periodXp;
      return { user: u, periodXp: finalXp };
    }).sort((a, b) => b.periodXp - a.periodXp);
  },

  getPlan: async (userId: string): Promise<StudyPlan | null> => {
    const plans = getFromStorage<Record<string, StudyPlan>>(STORAGE_KEYS.PLANS, {});
    return plans[userId] || null;
  },

  savePlan: async (userId: string, plan: StudyPlan): Promise<void> => {
    const plans = getFromStorage<Record<string, StudyPlan>>(STORAGE_KEYS.PLANS, {});
    plans[userId] = plan;
    saveToStorage(STORAGE_KEYS.PLANS, plans);
  },

  deletePlan: async (userId: string): Promise<void> => {
    const plans = getFromStorage<Record<string, StudyPlan>>(STORAGE_KEYS.PLANS, {});
    delete plans[userId];
    saveToStorage(STORAGE_KEYS.PLANS, plans);
  },

  getHistory: async (userId: string): Promise<ActivityRecord[]> => {
    const history = getFromStorage<Record<string, ActivityRecord[]>>(STORAGE_KEYS.HISTORY, {});
    return history[userId] || [];
  },

  saveActivity: async (userId: string, record: ActivityRecord): Promise<void> => {
    const history = getFromStorage<Record<string, ActivityRecord[]>>(STORAGE_KEYS.HISTORY, {});
    if (!history[userId]) history[userId] = [];
    history[userId].unshift(record);
    saveToStorage(STORAGE_KEYS.HISTORY, history);
  },

  saveToActivityBank: async (level: Level, theme: Theme, subTopic: string, content: GeneratedContent): Promise<void> => {
    const bank = getFromStorage<any[]>(STORAGE_KEYS.BANK, []);
    bank.push({ id: crypto.randomUUID(), level, theme, subTopic, content, createdAt: Date.now() });
    saveToStorage(STORAGE_KEYS.BANK, bank);
  },

  getRandomActivityFromBank: async (level: Level, theme: Theme, subTopic: string): Promise<any | null> => {
    const bank = getFromStorage<any[]>(STORAGE_KEYS.BANK, []);
    const matches = bank.filter(item => item.level === level && item.theme === theme && item.subTopic.toLowerCase().includes(subTopic.toLowerCase()));
    if (matches.length === 0) return null;
    return matches[Math.floor(Math.random() * matches.length)];
  },

  cleanupExpiredActivities: async (): Promise<void> => {
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const bank = getFromStorage<any[]>(STORAGE_KEYS.BANK, []);
    const filtered = bank.filter(item => (now - item.createdAt) < ninetyDaysMs);
    if (filtered.length !== bank.length) saveToStorage(STORAGE_KEYS.BANK, filtered);
  },

  // --- Social & Challenges ---
  getChallenges: async (): Promise<UserChallenge[]> => {
    const challenges = getFromStorage<UserChallenge[]>(STORAGE_KEYS.CHALLENGES, []);
    const now = Date.now();
    let updated = false;
    challenges.forEach(c => {
      if (c.status === 'active' && now > c.endDate) {
        c.status = 'closed';
        const participants = (c.participantIds || []).map(pid => ({
          id: pid,
          xp: c.participantStats[pid]?.xpGained || 0
        })).sort((a, b) => b.xp - a.xp);
        c.winnerId = participants[0]?.id;
        updated = true;
      }
    });
    if (updated) saveToStorage(STORAGE_KEYS.CHALLENGES, challenges);
    return challenges;
  },

  saveChallenge: async (challenge: UserChallenge): Promise<void> => {
    const challenges = getFromStorage<UserChallenge[]>(STORAGE_KEYS.CHALLENGES, []);
    const idx = challenges.findIndex(c => c.id === challenge.id);
    if (idx !== -1) challenges[idx] = challenge;
    else challenges.push(challenge);
    saveToStorage(STORAGE_KEYS.CHALLENGES, challenges);
  },

  getMessages: async (userId: string): Promise<DirectMessage[]> => {
    const messages = getFromStorage<DirectMessage[]>(STORAGE_KEYS.MESSAGES, []);
    return messages.filter(m => m.senderId === userId || m.receiverId === userId);
  },

  sendMessage: async (msg: Omit<DirectMessage, 'id' | 'timestamp' | 'read'>): Promise<void> => {
    const messages = getFromStorage<DirectMessage[]>(STORAGE_KEYS.MESSAGES, []);
    const newMsg: DirectMessage = {
      ...msg,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      read: false,
    };
    messages.push(newMsg);
    saveToStorage(STORAGE_KEYS.MESSAGES, messages);
  },

  markMessagesRead: async (userId: string, otherId: string): Promise<void> => {
    const messages = getFromStorage<DirectMessage[]>(STORAGE_KEYS.MESSAGES, []);
    const updated = messages.map(m => {
      if (m.senderId === otherId && m.receiverId === userId) return { ...m, read: true };
      return m;
    });
    saveToStorage(STORAGE_KEYS.MESSAGES, updated);
  },

  sendFollowRequest: async (fromId: string, toId: string): Promise<void> => {
    const users = getFromStorage<UserSession[]>(STORAGE_KEYS.USERS, []);
    const toIdx = users.findIndex(u => u.userId === toId);
    if (toIdx !== -1) {
      if (!users[toIdx].gamification.followRequests) users[toIdx].gamification.followRequests = [];
      const requests = users[toIdx].gamification.followRequests || [];
      if (!requests.includes(fromId)) {
        users[toIdx].gamification.followRequests.push(fromId);
        saveToStorage(STORAGE_KEYS.USERS, users);
      }
    }
  },

  respondToFollowRequest: async (userId: string, requesterId: string, accept: boolean): Promise<void> => {
    const users = getFromStorage<UserSession[]>(STORAGE_KEYS.USERS, []);
    const userIdx = users.findIndex(u => u.userId === userId);
    const reqIdx = users.findIndex(u => u.userId === requesterId);

    if (userIdx !== -1 && reqIdx !== -1) {
      users[userIdx].gamification.followRequests = (users[userIdx].gamification.followRequests || []).filter(id => id !== requesterId);
      
      if (accept) {
        if (!users[userIdx].gamification.followers) users[userIdx].gamification.followers = [];
        if (!users[userIdx].gamification.following) users[userIdx].gamification.following = [];
        if (!users[reqIdx].gamification.followers) users[reqIdx].gamification.followers = [];
        if (!users[reqIdx].gamification.following) users[reqIdx].gamification.following = [];

        if (!users[userIdx].gamification.followers.includes(requesterId)) users[userIdx].gamification.followers.push(requesterId);
        if (!users[userIdx].gamification.following.includes(requesterId)) users[userIdx].gamification.following.push(requesterId);
        
        if (!users[reqIdx].gamification.followers.includes(userId)) users[reqIdx].gamification.followers.push(userId);
        if (!users[reqIdx].gamification.following.includes(userId)) users[reqIdx].gamification.following.push(userId);
      }
      saveToStorage(STORAGE_KEYS.USERS, users);
    }
  },

  unfollow: async (userId: string, targetId: string): Promise<void> => {
    const users = getFromStorage<UserSession[]>(STORAGE_KEYS.USERS, []);
    const userIdx = users.findIndex(u => u.userId === userId);
    const targetIdx = users.findIndex(u => u.userId === targetId);

    if (userIdx !== -1 && targetIdx !== -1) {
      users[userIdx].gamification.following = users[userIdx].gamification.following.filter(id => id !== targetId);
      users[targetIdx].gamification.followers = users[targetIdx].gamification.followers.filter(id => id !== userId);
      saveToStorage(STORAGE_KEYS.USERS, users);
    }
  }
};
