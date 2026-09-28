// ============================================================
// FREEDOMAPP — duelConfig
// ------------------------------------------------------------
// Constantes do Duelo da Roleta usadas pela TELA. As regras de
// verdade moram no servidor (netlify/functions/lib/duel-core.js);
// aqui ficam só a ordem da roleta, cores, nomes e números que a tela
// precisa mostrar. O teste test-duel.mjs confere que os dois lados
// batem — se alguém mudar um e esquecer o outro, o teste acusa.
// ============================================================

export type DuelCategory = 'grammar' | 'vocabulary' | 'reading' | 'listening' | 'travel' | 'everyday';
export type WheelSlot = DuelCategory | 'crown';

// Mesma ordem do servidor: o índice sorteado lá é a fatia daqui.
export const WHEEL: WheelSlot[] = ['grammar', 'vocabulary', 'reading', 'listening', 'travel', 'everyday', 'crown'];
export const CATEGORIES: DuelCategory[] = ['grammar', 'vocabulary', 'reading', 'listening', 'travel', 'everyday'];

export const STAKES = [0, 1, 2, 5];
export const MAX_TURNS = 15;
export const CROWNS_TO_WIN = 6;
export const METER_MAX = 3;

export const LEAGUES = [
  { id: 'bronze', name: 'Bronze', min: 0, color: '#cd7f32' },
  { id: 'prata', name: 'Prata', min: 150, color: '#cbd5e1' },
  { id: 'ouro', name: 'Ouro', min: 400, color: '#facc15' },
  { id: 'diamante', name: 'Diamante', min: 800, color: '#67e8f9' },
  { id: 'lenda', name: 'Lenda', min: 1500, color: '#f7931e' },
];

// Cada categoria tem cor própria (como os personagens do
// Perguntados): o aluno reconhece a categoria pela cor antes de ler.
export const CAT_META: Record<WheelSlot, { label: string; short: string; color: string; emoji: string }> = {
  grammar: { label: 'Gramática', short: 'Grammar', color: '#3b82f6', emoji: '🧩' },
  vocabulary: { label: 'Vocabulário', short: 'Vocab', color: '#22c55e', emoji: '📚' },
  reading: { label: 'Leitura', short: 'Reading', color: '#a855f7', emoji: '📖' },
  listening: { label: 'Listening', short: 'Listening', color: '#ec4899', emoji: '🎧' },
  travel: { label: 'Viagem', short: 'Travel', color: '#eab308', emoji: '✈️' },
  everyday: { label: 'Dia a dia', short: 'Everyday', color: '#ef4444', emoji: '💬' },
  crown: { label: 'Coroa', short: 'Coroa', color: '#f7931e', emoji: '👑' },
};

export const LEVEL_OPTIONS = [
  { level: 'A1', title: 'Iniciante', desc: 'Sei pouquíssimo ou estou começando agora.' },
  { level: 'A2', title: 'Básico', desc: 'Me apresento, falo da rotina e entendo frases simples.' },
  { level: 'B1', title: 'Intermediário', desc: 'Me viro em viagens e conversas do dia a dia.' },
  { level: 'B2', title: 'Intermediário avançado', desc: 'Converso com fluidez sobre vários assuntos.' },
  { level: 'C1', title: 'Avançado', desc: 'Uso o inglês com naturalidade, até no trabalho.' },
] as const;
