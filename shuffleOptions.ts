// ════════════════════════════════════════════════════════════════
// Embaralhamento das alternativas de múltipla escolha
// ────────────────────────────────────────────────────────────────
// O problema: modelos de IA têm um vício conhecido — colocam a
// resposta certa quase sempre na MESMA posição (em geral a primeira,
// "letra A"). Alunos perceberam: bastava marcar A em tudo. Isso
// aconteceu nos mini-quizzes do Fred explica, nos exercícios da
// Journey, na prática livre e no nivelamento, porque todos vêm da
// mesma fonte.
//
// A solução: embaralhar as alternativas DEPOIS que a IA responde e
// corrigir o índice da resposta certa junto. Pedir no prompt "varie a
// posição" não resolve — o modelo promete e não cumpre.
//
// Onde é aplicado (lado do navegador): App.tsx ao iniciar qualquer
// exercício (prática livre, banco, Journey, guia), e no carregamento
// das provas de nivelamento. Assim o conteúdo ANTIGO já gravado nos
// bancos também sai embaralhado, sem precisar regerar nada. O servidor
// também embaralha o que gera de novo (journey-content, fred-core,
// placement-background) — cinto e suspensório.
// ════════════════════════════════════════════════════════════════

// Fisher-Yates: cada permutação tem a mesma chance. (Ordenar por
// Math.random() — o "jeito rápido" — dá resultados viciados.)
export const shuffledIndexes = (n: number): number[] => {
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
};

// Embaralha as opções de UMA questão e devolve uma cópia com o índice
// da resposta certa apontando para a nova posição. Aceita os dois
// nomes de campo usados no app: correctAnswerIndex (exercícios e
// nivelamento) e correctIndex (Fred explica).
export const shuffleQuestion = <T extends { options?: unknown }>(q: T): T => {
  const options = (q as any)?.options;
  if (!Array.isArray(options) || options.length < 2) return q;
  const key = typeof (q as any).correctAnswerIndex === 'number' ? 'correctAnswerIndex'
    : typeof (q as any).correctIndex === 'number' ? 'correctIndex' : null;
  if (!key) return q;
  const correct = (q as any)[key];
  if (!Number.isInteger(correct) || correct < 0 || correct >= options.length) return q;
  const order = shuffledIndexes(options.length);
  return {
    ...q,
    options: order.map(i => options[i]),
    [key]: order.indexOf(correct),
  };
};

// Percorre qualquer objeto (conteúdo de exercício, prova de nivelamento,
// aula do Fred...) e embaralha TODAS as questões que encontrar —
// "questions", "finalQuiz", "quiz" dentro de cada seção, etc.
export const deepShuffleQuestions = <T>(value: T): T => {
  if (Array.isArray(value)) return value.map(deepShuffleQuestions) as unknown as T;
  if (value && typeof value === 'object') {
    const v = value as any;
    if (Array.isArray(v.options) && (typeof v.correctAnswerIndex === 'number' || typeof v.correctIndex === 'number')) {
      return shuffleQuestion(v) as T;
    }
    const out: any = {};
    for (const k of Object.keys(v)) out[k] = deepShuffleQuestions(v[k]);
    return out as T;
  }
  return value;
};
