// ════════════════════════════════════════════════════════════════
// RASCUNHO DO EXERCÍCIO EM ANDAMENTO
// ────────────────────────────────────────────────────────────────
// Guarda no localStorage do navegador o exercício que o aluno está
// fazendo (conteúdo + em que questão está + quantos acertos + texto
// da redação). Se a aba recarregar (o Safari/Chrome do celular fazem
// isso ao voltar de outro app), se a sessão cair por inatividade ou
// se a internet oscilar, o aluno volta exatamente de onde parou —
// em vez de perder o exercício e a cota do dia.
//
// DECISÕES
// • Uma chave por aluno (freedom_activity_draft_<userId>): dois
//   alunos no mesmo computador nunca veem o rascunho um do outro.
// • Validade de 24h: rascunho velho é descartado sozinho.
// • audioData/imageData NÃO são guardados: são megabytes em base64 e
//   o localStorage tem teto de ~5 MB. O áudio é refeito pela própria
//   tela do quiz quando faltar (ela já sabe gerar/baixar de novo).
// • NÃO é apagado no logout, de propósito: o caso mais comum de
//   logout no meio do exercício é a queda por inatividade.
// ════════════════════════════════════════════════════════════════

import { GeneratedContent, Level, Theme } from '../types';
import type { JourneyContext } from '../journeys';

const VERSION = 1;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const keyFor = (userId: string) => `freedom_activity_draft_${userId}`;

export type DraftScreen = 'quiz' | 'gapfill' | 'writing';

export interface DraftProgress {
  index?: number;   // questão/lacuna atual (Quiz e GapFill)
  score?: number;   // acertos até aqui (Quiz e GapFill)
  text?: string;    // texto digitado (Writing)
}

export interface ActivityDraft {
  v: number;
  userId: string;
  savedAt: number;
  screen: DraftScreen;
  level: Level;
  theme: Theme;
  subTopic: string;
  content: GeneratedContent;
  journeyContext?: JourneyContext | null;
  progress: DraftProgress;
}

const stripHeavy = (content: GeneratedContent): GeneratedContent => {
  const { audioData, imageData, ...light } = content as any;
  return light as GeneratedContent;
};

export const saveDraft = (
  userId: string,
  data: Omit<ActivityDraft, 'v' | 'userId' | 'savedAt' | 'progress'> & { progress?: DraftProgress }
): void => {
  try {
    const draft: ActivityDraft = {
      v: VERSION, userId, savedAt: Date.now(),
      screen: data.screen, level: data.level, theme: data.theme, subTopic: data.subTopic,
      content: stripHeavy(data.content),
      journeyContext: data.journeyContext ?? null,
      progress: data.progress ?? {},
    };
    localStorage.setItem(keyFor(userId), JSON.stringify(draft));
  } catch {
    // localStorage cheio ou bloqueado (aba anônima): a retomada só
    // deixa de existir — o exercício em si segue normalmente.
  }
};

export const loadDraft = (userId: string): ActivityDraft | null => {
  try {
    const raw = localStorage.getItem(keyFor(userId));
    if (!raw) return null;
    const draft = JSON.parse(raw) as ActivityDraft;
    const valid =
      draft && draft.v === VERSION && draft.userId === userId &&
      typeof draft.savedAt === 'number' && Date.now() - draft.savedAt < MAX_AGE_MS &&
      draft.content && (draft.screen === 'quiz' || draft.screen === 'gapfill' || draft.screen === 'writing');
    if (!valid) { clearDraft(userId); return null; }
    return draft;
  } catch {
    clearDraft(userId);
    return null;
  }
};

export const updateDraftProgress = (userId: string, progress: DraftProgress): void => {
  try {
    const raw = localStorage.getItem(keyFor(userId));
    if (!raw) return;
    const draft = JSON.parse(raw) as ActivityDraft;
    if (!draft || draft.userId !== userId) return;
    draft.progress = { ...draft.progress, ...progress };
    // Mexer no exercício renova a validade: as 24h contam do último
    // progresso, não do momento em que o exercício abriu.
    draft.savedAt = Date.now();
    localStorage.setItem(keyFor(userId), JSON.stringify(draft));
  } catch { /* ver saveDraft */ }
};

export const clearDraft = (userId: string): void => {
  try { localStorage.removeItem(keyFor(userId)); } catch { /* nada a fazer */ }
};
