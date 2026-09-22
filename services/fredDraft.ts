// ════════════════════════════════════════════════════════════════
// RASCUNHO DA AULA DO FRED EXPLICA
// ────────────────────────────────────────────────────────────────
// Irmão do activityDraft.ts, mas para a AULA (não o exercício).
// Guarda no localStorage em que seção o aluno está, o que respondeu
// nos mini-quizzes e no checkpoint, e de onde veio (Journey ou
// catálogo). Se a aba recarregar, a sessão cair ou a internet
// oscilar, o aluno reabre a aula exatamente onde parou — antes, a
// tela recomeçava da seção 1 e tudo que ele tinha lido "sumia".
//
// O conteúdo da aula NÃO é guardado aqui: ele vem do banco
// compartilhado (fred_lessons) em milissegundos, e o localStorage
// tem teto de ~5 MB. Só o PROGRESSO fica local.
//
// Uma chave por aluno; validade de 7 dias (uma aula pode ficar
// pausada por mais tempo que um exercício). Não é apagado no logout,
// de propósito: o caso mais comum é justamente a queda da sessão.
// ════════════════════════════════════════════════════════════════

import type { FredOrigin } from '../fredExplains';

const VERSION = 1;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const keyFor = (userId: string) => `freedom_fred_draft_${userId}`;

export interface FredDraft {
  v: number;
  userId: string;
  savedAt: number;
  lessonId: string;
  // Quantas seções já estavam abertas (1 = só a primeira).
  revealed: number;
  sectionAnswers: Record<number, number>;
  finalAnswers: Record<number, number>;
  origin: FredOrigin | null;
  // true enquanto o aluno está DENTRO da aula. Sair por vontade própria
  // (voltar, início, outra aula) põe false: o progresso continua guardado
  // para quando ele reabrir o mesmo tema, mas o app não reabre a aula
  // sozinho no próximo login — isso é só para queda de sessão/recarga.
  active: boolean;
}

export const saveFredDraft = (
  userId: string,
  data: Omit<FredDraft, 'v' | 'userId' | 'savedAt'>
): void => {
  try {
    const draft: FredDraft = { v: VERSION, userId, savedAt: Date.now(), ...data };
    localStorage.setItem(keyFor(userId), JSON.stringify(draft));
  } catch {
    // localStorage cheio/bloqueado: a retomada só deixa de existir.
  }
};

export const loadFredDraft = (userId: string): FredDraft | null => {
  try {
    const raw = localStorage.getItem(keyFor(userId));
    if (!raw) return null;
    const draft = JSON.parse(raw) as FredDraft;
    const valid =
      draft && draft.v === VERSION && draft.userId === userId &&
      typeof draft.lessonId === 'string' && typeof draft.savedAt === 'number' &&
      Date.now() - draft.savedAt <= MAX_AGE_MS;
    if (!valid) { localStorage.removeItem(keyFor(userId)); return null; }
    return {
      ...draft,
      revealed: Math.max(1, Number(draft.revealed) || 1),
      sectionAnswers: draft.sectionAnswers && typeof draft.sectionAnswers === 'object' ? draft.sectionAnswers : {},
      finalAnswers: draft.finalAnswers && typeof draft.finalAnswers === 'object' ? draft.finalAnswers : {},
      origin: draft.origin ?? null,
      active: draft.active !== false,
    };
  } catch {
    return null;
  }
};

/** Saída voluntária: mantém o progresso, mas desliga a retomada automática. */
export const leaveFredDraft = (userId: string): void => {
  try {
    const raw = localStorage.getItem(keyFor(userId));
    if (!raw) return;
    const draft = JSON.parse(raw) as FredDraft;
    localStorage.setItem(keyFor(userId), JSON.stringify({ ...draft, active: false }));
  } catch { /* nada */ }
};

export const clearFredDraft = (userId: string): void => {
  try { localStorage.removeItem(keyFor(userId)); } catch { /* nada */ }
};
