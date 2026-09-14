// Mock da API para o preview visual (não vai para o repositório).
import lesson from './lesson.json';
const progress = { lessons: { 'A1_verbo-to-be-presente': { openedAt: Date.now() - 100000 }, 'A1_simple-present': { completedAt: Date.now(), bestPct: 80, openedAt: 1 } } };
export const api: any = {
  getFredProgress: async () => progress,
  getFredReadyIndex: async () => ({ 'A1_verbo-to-be-presente': true, 'A1_simple-present': true, 'A1_present-continuous': true }),
  getFredLesson: async (id: string) => {
    if (id === 'A1_will') return { status: 'generating' };
    return { status: 'ready', lesson, progress: null };
  },
  subscribeFredLesson: () => () => {},
  completeFredLesson: async (_id: string, answers: number[]) => {
    const score = (lesson as any).finalQuiz.filter((q: any, i: number) => q.correctIndex === answers[i]).length;
    const pct = Math.round(score / 5 * 100);
    return { score, total: 5, pct, passed: pct >= 60, xpGained: pct >= 60 ? 40 : 0, totalXp: 1040, alreadyCompleted: false, progress: {} };
  },
  sendFredFeedback: async () => {},
  listFredLessons: async () => [],
};
