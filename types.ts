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

// ══════════════════════════════════════════════════════════════
// NIVELAMENTO POR HABILIDADE — fundação de dados (Etapa 1)
// ══════════════════════════════════════════════════════════════

// As quatro habilidades independentes do nivelamento. Enum própria
// (em vez de reusar Theme) porque o nivelamento tem um conjunto
// FECHADO e específico — misturar com os temas de prática livre
// abriria porta para uma habilidade inválida vazar para o teste.
export enum PlacementSkill {
  Grammar = 'grammar',
  Reading = 'reading',
  Listening = 'listening',
  Writing = 'writing',
}

// ── Constantes centrais do nivelamento ────────────────────────
// Centralizadas aqui para que uma mudança de regra (ex: trocar 80%
// por 75%) aconteça em UM lugar só, e o app inteiro obedeça. Número
// solto espalhado pelo código é a receita para descasamento.

// Quantas questões por nível CEFR dentro de cada habilidade.
export const QUESTIONS_PER_LEVEL = 10;

// Percentual mínimo de acerto para avançar ao próximo nível (80%).
export const PLACEMENT_PASS_THRESHOLD = 0.8;

// Quantas variações de prova cada habilidade tem por trimestre.
// O aluno recebe uma sorteada, o que reduz a chance de colagem.
export const PLACEMENT_VARIATIONS_PER_SKILL = 3;

// A ordem crescente de dificuldade dos níveis dentro do teste.
// O teste começa em A1 e sobe até C1, parando quando o aluno não
// atinge o PLACEMENT_PASS_THRESHOLD no nível atual.
export const PLACEMENT_LEVEL_ORDER: Level[] = [
  Level.A1, Level.A2, Level.B1, Level.B2, Level.C1,
];

// ── Uma questão do banco de nivelamento ───────────────────────
// Carrega o nível CEFR a que pertence, para o front saber a qual
// bloco de 5 ela corresponde. Para writing, o banco usa o campo
// writingPrompt do PlacementBankEntry em vez de uma lista destas.
export interface PlacementQuestion {
  id: number;
  level: Level;                 // A qual nível CEFR esta questão pertence
  question: string;
  questionPT?: string;          // Enunciado em português, quando útil
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
  // Campos opcionais para reading/listening, que precisam de suporte
  readingText?: string;         // Texto-base (reading)
  listeningScript?: string;     // Roteiro do áudio (listening) — usado
                                // na GERAÇÃO do TTS, não exibido ao aluno.
                                // Cinco questões do mesmo nível compartilham
                                // UM áudio; a URL dele mora em
                                // PlacementBankEntry.levelAudios, não aqui.
}

// ── Uma variação completa de uma habilidade no trimestre ──────
// É o documento salvo na coleção 'placement_bank' do Firestore.
// O id é determinístico: skill_trimestre_variação (ex:
// "grammar_2026-Q3_v1"), o que evita duplicatas e permite leitura
// direta. Para as três habilidades de múltipla escolha, 'questions'
// traz as 25 questões (5 por nível). Para writing, 'questions' fica
// vazio e usa-se 'writingPrompt'/'writingPromptPT'.
export interface PlacementBankEntry {
  id: string;                   // skill_quarterKey_vN
  skill: PlacementSkill;
  quarterKey: string;           // Ex: "2026-Q3"
  variation: number;            // 1, 2 ou 3
  questions: PlacementQuestion[];   // 25 para MC; vazio para writing
  writingPrompt?: string;       // Enunciado de writing (em inglês)
  writingPromptPT?: string;     // Enunciado de writing (em português)
  // ── Áudios do listening, um por nível CEFR ────────────────
  // Usado SÓ por listening. Cada nível tem UM áudio, e as 5
  // questões daquele nível se referem a ele. Chave = nível
  // (ex: "A1", "B2"), valor = URL pública no Firebase Storage.
  // Fica aqui (não na questão) porque o áudio é do bloco de
  // nível, não de cada questão — evita repetir a mesma URL 5x
  // e deixa a intenção clara. As outras 3 habilidades ignoram
  // este campo. Reduz o TTS de 25 para 5 gerações por variação.
  levelAudios?: { [level: string]: string };
  createdAt: number;            // timestamp de geração
}

// ── Resultado de UMA habilidade para um aluno ─────────────────
// Guarda o nível atingido e a pontuação, mais o completedAt que é
// a base do cooldown de 30 dias INDEPENDENTE por habilidade.
export interface SkillPlacementResult {
  skill: PlacementSkill;
  level: Level;                 // Nível classificado nesta habilidade
  score: number;                // Pontuação final (0-100 ou nº de acertos)
  completedAt: number;          // timestamp — base do cooldown de 30 dias
  variationUsed?: number;       // Qual variação o aluno respondeu
  // ── Checkpoint de retomada (regra dos 6 meses) ────────────
  // Nível de onde o PRÓXIMO teste desta habilidade deve começar,
  // desde que o aluno não tenha passado 6 meses sem nivelar nada
  // (aí o relógio global reseta tudo para A1 — ver lastAnyPlacementAt).
  // Ex: travou em B2 e foi classificado B1 → resumeFromLevel = B2.
  // Se travou já no A1 → resumeFromLevel = A1 (o chão do sistema).
  resumeFromLevel?: Level;
}

// ── Mapa de resultados por habilidade ─────────────────────────
// Indexado pela PlacementSkill. Uma habilidade AUSENTE do mapa
// significa "nunca nivelada" — é assim que o app sabe que a
// primeira vez daquela habilidade é gratuita.
export type PlacementResults = {
  [skill in PlacementSkill]?: SkillPlacementResult;
};

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
  // Áudio JÁ pronto no Firebase Storage (exercícios da Journey). Quando
  // presente, o quiz toca este arquivo em vez de pedir um TTS novo —
  // é o que evita gastar uma geração de áudio por aluno.
  audioUrl?: string;
  imageData?: string;
  writingPrompt?: string;
  writingPromptPT?: string;
  questions: QuizQuestion[];
  voiceConfig?: {
    gender: VoiceGender;
    accent: VoiceAccent;
  };
  // ── Journey: escrita por lacunas (Seasons 1 e 2) ──────────
  // Frases com "____" que o aluno completa digitando. A correção é
  // feita no próprio navegador (sem IA): compara com 'answer' e
  // 'alternatives' ignorando maiúsculas e espaços extras.
  gapItems?: GapItem[];
  // Instrução de tamanho para a escrita livre (Seasons 3+), ex.:
  // "Escreva 3 a 5 frases". Mostrada acima da caixa de texto.
  writingLengthHint?: string;
}

export interface GapItem {
  id: number;
  sentence: string;        // Ex.: "She ____ a teacher."
  answer: string;          // Ex.: "is"
  alternatives?: string[]; // Outras respostas aceitas (ex.: "'s")
  hintPT?: string;         // Dica em português (ex.: "verbo to be, 3ª pessoa")
  translationPT?: string;  // Tradução da frase completa
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
  savedAt: number;      // timestamp do FECHAMENTO do período
  source?: string;      // 'history' = apurado somando a coleção history
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
  lastPlacementLevel?: Level;      // LEGADO — nivelamento único antigo
  lastPlacementDate?: number;      // LEGADO — data do nivelamento único
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

  // ── Novo: nivelamento por habilidade (Etapa 1) ────────────
  // Mapa indexado por habilidade. Substitui, na prática, o
  // lastPlacementLevel único (mantido acima como legado por
  // compatibilidade com perfis já salvos no Firestore).
  placementResults: PlacementResults;

  // ── Novo: relógio GLOBAL de 6 meses (regra de reset A1) ───
  // Timestamp do nivelamento mais recente do aluno em QUALQUER
  // habilidade. É o carimbo que decide o reset global: se hoje -
  // lastAnyPlacementAt > 6 meses, o próximo reteste de qualquer
  // habilidade recomeça do A1 (ignora os checkpoints). Se o aluno
  // fez qualquer nivelamento nesse período, os checkpoints valem.
  // Ausente/undefined = nunca nivelou nada ainda.
  lastAnyPlacementAt?: number;

  // ── Novo: pacote extra de exercícios (compra com FR$) ─────
  // O aluno pode comprar +8 exercícios válidos SÓ no dia da
  // compra. extraDailyDate carimba o dia (YYYY-MM-DD); se não for
  // hoje, o extra não vale mais. Compras no mesmo dia se somam.
  extraDailyAllowance?: number;
  extraDailyDate?: string | null;
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
  status: 'login' | 'keyword_check' | 'guide_selection' | 'selection' | 'loading' | 'quiz' | 'writing' | 'gapfill' | 'results' | 'error' | 'plan_setup' | 'dashboard' | 'placement_test' | 'placement_hub' | 'placement_result' | 'level_up' | 'my_activities' | 'profile' | 'admin_panel' | 'challenges' | 'chat' | 'ranking_history' | 'journey';
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
  // Verdadeiro quando a última atividade foi uma repetição (sem XP,
  // por já ter sido feita antes) — usado para explicar o "0 XP".
  lastWasRepeat?: boolean;
  newTierReached?: UserTier | null;
  activeChatUserId?: string | null;
  // ── Novo: habilidade sendo testada quando o hub abre um teste ──
  activePlacementSkill?: PlacementSkill | null;
  // ── Novo: resultado a exibir na tela de resultado do nivelamento ──
  placementResultLevel?: Level | null;
  placementResultScore?: number | null;
  // ── Journey to Fluency ────────────────────────────────────
  // Quando preenchido, o exercício em andamento pertence à trilha:
  // o resultado é gravado no progresso da jornada e, ao terminar,
  // o aluno volta para o mapa em vez do menu principal.
  journeyContext?: import('./journeys').JourneyContext | null;
  // Mensagem de carregamento em etapas (ex.: "Gerando seu exercício...").
  loadingMessage?: string;
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
