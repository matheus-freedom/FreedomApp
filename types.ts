export enum Level {
  A1 = 'A1',
  A2 = 'A2',
  B1 = 'B1',
  B2 = 'B2',
  C1 = 'C1',
}

export enum Theme {
  Grammar = 'Gramática',
  Vocabulary = 'Vocabulário',
  Business = 'Business',
  Reading = 'Reading',
  Listening = 'Listening',
  Writing = 'Escrita',
}

export enum UserTier {
  Starter = 'Freedom Starter',
  Warrior = 'Freedom Warrior',
  Genius = 'Freedom Genius',
  Pro = 'Freedom Pro',
  Legend = 'Freedom Legend',
}

export enum AccessType {
  FULL = 'full',
  CHALLENGE_ONLY = 'challenge_only'
}

export type VoiceGender = 'Male' | 'Female';
export type VoiceAccent = 'American' | 'British' | 'Australian' | 'Indian';

export interface QuizQuestion {
  id: number;
  question: string;
  questionPT?: string; 
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
  questionImage?: string;
}

export interface WritingFeedback {
  score: number;
  feedback: string;
  annotatedHtml: string;
  suggestions: string[];
  recommendedTopics: string[];
}

export interface GeneratedContent {
  readingText?: string;
  listeningScript?: string;
  audioData?: string;
  imageData?: string;
  writingPrompt?: string;
  writingPromptPT?: string;
  questions: QuizQuestion[];
  voiceConfig?: {
    gender: VoiceGender;
    accent: VoiceAccent;
  };
}

// ── Novo: entrada do Top 3 em um snapshot de ranking ──────────
export interface RankingEntry {
  userId: string;
  username: string;
  fullName: string;
  profilePhoto?: string;
  xp: number;
  activitiesCount: number;
  position: 1 | 2 | 3;
}

// ── Novo: snapshot salvo ao virar semana ou mês ───────────────
export interface RankingSnapshot {
  id: string;
  period: 'weekly' | 'monthly';
  label: string;        // Ex: "Semana 18/2026" ou "Abril 2026"
  startDate: string;    // YYYY-MM-DD
  endDate: string;      // YYYY-MM-DD
  top3: RankingEntry[];
  savedAt: number;      // timestamp
}

// ── Novo: badge semanal do usuário ────────────────────────────
export interface WeeklyBadge {
  position: 1 | 2 | 3;
  weekLabel: string;    // Ex: "Semana 18/2026"
  xp: number;
  awardedAt: number;    // timestamp
}

export interface UserGamification {
  xp: number; 
  frBalance: number; 
  streak: number;
  lastLoginDate: string | null;
  dailyXpEarned: number;
  lastXpGainDate: string | null;
  dailyActivitiesCount: number;
  lastActivityDate: string | null;
  isPro: boolean;
  lastPlacementLevel?: Level;
  lastPlacementDate?: number;
  dailyChatCount: number;
  lastChatDate: string | null;
  followers: string[];
  following: string[];
  followRequests: string[];
  totalActivities: number;

  // ── Novo: XP por período ──────────────────────────────────
  weeklyXp: number;           // XP acumulado na semana atual
  monthlyXp: number;          // XP acumulado no mês atual
  yearlyXp: number;           // XP acumulado no ano atual
  weeklyActivities: number;   // Atividades feitas na semana atual
  monthlyActivities: number;  // Atividades feitas no mês atual

  // ── Novo: controle de reset por período ──────────────────
  lastWeekKey: string | null;   // Ex: "2026-W18"
  lastMonthKey: string | null;  // Ex: "2026-04"
  lastYearKey: string | null;   // Ex: "2026"

  // ── Novo: badge semanal (coroa) ───────────────────────────
  weeklyBadge: WeeklyBadge | null;
}

export interface AdminNotification {
  id: string;
  message: string;
  date: number;
  read: boolean;
  sender: string;
}

export interface UserSession {
  userId: string;
  username: string; 
  userName: string; 
  fullName: string; 
  age: string;
  gender: string;
  email: string;
  password?: string; 
  profilePhoto?: string; 
  guide: GuideCharacter;
  gamification: UserGamification;
  notifications?: AdminNotification[];
  accessType?: AccessType;
  isAdmin?: boolean;
}

export interface DirectMessage {
  id: string;
  senderId: string;
  receiverId: string;
  text: string;
  timestamp: number;
  read: boolean;
}

export interface UserChallenge {
  id: string;
  name: string;
  creatorId: string;
  participantIds: string[];
  pendingInvites: string[];
  startDate: number;
  endDate: number;
  durationDays: number;
  focus: string;
  rules: string;
  status: 'active' | 'closed';
  winnerId?: string;
  participantStats: {
    [userId: string]: {
      xpGained: number;
      activitiesDone: number;
    }
  };
}

export interface AppState {
  status: 'login' | 'keyword_check' | 'guide_selection' | 'selection' | 'loading' | 'quiz' | 'writing' | 'results' | 'error' | 'plan_setup' | 'dashboard' | 'placement_test' | 'level_up' | 'my_activities' | 'profile' | 'admin_panel' | 'challenges' | 'chat' | 'ranking_history';
  user: UserSession | null;
  level: Level | null;
  theme: Theme | null;
  subTopic: string | null;
  content: GeneratedContent | null;
  currentQuestionIndex: 0;
  score: number;
  errorMessage?: string;
  studyPlan: StudyPlan | null;
  activityHistory: ActivityRecord[];
  activeTaskId?: string;
  lastXpGained?: number;
  lastFrGained?: number;
  newTierReached?: UserTier | null;
  activeChatUserId?: string | null;
}

export interface StudyPlanInput {
  level: Level;
  timeAvailable: string;
  dailyAvailability?: number;
  focusSkill: string;
  duration: string;
  isChallenge?: boolean;
  customFocus?: string;
}

export interface StudyTask {
  id: string;
  description: string;
  isCompleted: boolean;
  relatedTheme?: Theme;
  score?: number;
  totalQuestions?: number;
  date?: string;
}

export interface StudyDay {
  dayName: string;
  date?: string;
  tasks: StudyTask[];
}

export interface StudyWeek {
  weekNumber: number;
  days: StudyDay[];
}

export interface StudyPlan {
  id: string;
  createdAt: number;
  inputs: StudyPlanInput;
  weeks: StudyWeek[];
  totalTasks: number;
  completedTasks: number;
  isChallenge?: boolean;
  challengeStartDate?: string;
  challengeEndDate?: string;
  lives?: number;
  lastCompletedDate?: string;
  lastPenaltyCheckDate?: string;
}

export type GuideCharacter = 'Fred' | 'Frida';

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  isActivityLink?: boolean;
  activityParams?: {
    level: Level;
    theme: Theme;
    topic: string;
  };
}

export interface ActivityRecord {
  id: string;
  date: number;
  level: Level;
  theme: Theme;
  topic: string;
  score: number;
  total: number;
  type: 'quiz' | 'writing' | 'placement';
  xpGained: number; 
  frGained: number; 
}
