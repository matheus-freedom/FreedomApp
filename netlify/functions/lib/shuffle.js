// ============================================================
// FREEDOMAPP — lib/shuffle
// ------------------------------------------------------------
// Espelho em CommonJS do shuffleOptions.ts (raiz). A IA coloca a
// resposta certa quase sempre na mesma posição ("letra A"); aqui
// embaralhamos as alternativas de tudo que o servidor gera ANTES de
// gravar no banco compartilhado, corrigindo o índice junto.
// ============================================================

const shuffledIndexes = (n) => {
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
};

const shuffleQuestion = (q) => {
  const options = q && q.options;
  if (!Array.isArray(options) || options.length < 2) return q;
  const key = Number.isInteger(q.correctAnswerIndex) ? "correctAnswerIndex"
    : Number.isInteger(q.correctIndex) ? "correctIndex" : null;
  if (!key) return q;
  const correct = q[key];
  if (correct < 0 || correct >= options.length) return q;
  const order = shuffledIndexes(options.length);
  return { ...q, options: order.map((i) => options[i]), [key]: order.indexOf(correct) };
};

const deepShuffleQuestions = (value) => {
  if (Array.isArray(value)) return value.map(deepShuffleQuestions);
  if (value && typeof value === "object") {
    if (Array.isArray(value.options) && (Number.isInteger(value.correctAnswerIndex) || Number.isInteger(value.correctIndex))) {
      return shuffleQuestion(value);
    }
    const out = {};
    for (const k of Object.keys(value)) out[k] = deepShuffleQuestions(value[k]);
    return out;
  }
  return value;
};

module.exports = { shuffledIndexes, shuffleQuestion, deepShuffleQuestions };
