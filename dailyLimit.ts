// ════════════════════════════════════════════════════════════════
// Cota diária de exercícios — FONTE ÚNICA
// ────────────────────────────────────────────────────────────────
// Antes, o limite de 8 era conferido em três lugares diferentes
// (App, SelectionScreen e o modal), cada um com sua própria conta.
// Com a compra de pacote extra a conta ficou mais rica (8 + extras
// comprados HOJE), então ela mora aqui e todo mundo importa daqui —
// um lugar só para mudar, zero chance de telas discordarem.
// ════════════════════════════════════════════════════════════════
import { UserGamification } from './types';

// Exercícios inclusos por dia para todo aluno (a "diária" de sempre).
export const DAILY_LIMIT = 8;

// Preço, em Freedom Reais (FR$), do pacote extra de +8 exercícios,
// válido somente no dia da compra. Pode ser comprado mais de uma vez.
export const EXTRA_DAILY_COST = 10;

export const todayKey = (): string => new Date().toISOString().split('T')[0];

// Quantos exercícios o aluno já fez HOJE. O contador guardado no
// perfil só vale se a última atividade foi hoje — virou o dia, zera.
export const getDailyUsage = (g: UserGamification): number =>
  g.lastActivityDate === todayKey() ? g.dailyActivitiesCount : 0;

// Quantos exercícios o aluno PODE fazer hoje: a diária de 8 mais os
// pacotes extras comprados hoje. Pacote comprado ontem não sobra
// para hoje — é isso que o carimbo de data garante.
export const getDailyAllowance = (g: UserGamification): number =>
  DAILY_LIMIT + (g.extraDailyDate === todayKey() ? (g.extraDailyAllowance || 0) : 0);

// A pergunta que as telas fazem: "posso começar mais um exercício?"
// PRO/Admin nunca é barrado.
export const isDailyLimitReached = (g: UserGamification): boolean =>
  !g.isPro && getDailyUsage(g) >= getDailyAllowance(g);
