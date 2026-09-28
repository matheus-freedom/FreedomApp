// ============================================================
// FREEDOMAPP — lib/duel-bank
// ------------------------------------------------------------
// Banco FIXO de perguntas do Duelo da Roleta: 6 categorias × 5
// níveis, escritas e revisadas: 20 por nível em cada categoria e 30
// em "everyday" (Dia a dia), que também cobre situações de trabalho
// (e-mail, reunião, telefone, entrevista) — 650 no total.
//
// Fica no SERVIDOR de propósito: se estivesse no código do site, o
// gabarito iria junto para o navegador de todo aluno. Aqui o aluno
// só recebe a pergunta; a resposta certa só volta depois que ele
// responde.
//
// Para AMPLIAR o banco fixo: edite o JSON da categoria (mesmo
// formato) e rode `node test-duel.mjs` — o teste valida tudo.
// As perguntas que a IA gera quando um aluno esgota o banco ficam
// no Firestore (coleção duel_bank), não aqui.
// ============================================================

const FILES = {
  grammar: require("./duel-bank/grammar.json"),
  vocabulary: require("./duel-bank/vocabulary.json"),
  reading: require("./duel-bank/reading.json"),
  listening: require("./duel-bank/listening.json"),
  travel: require("./duel-bank/travel.json"),
  everyday: require("./duel-bank/everyday.json"),
};

// Índice por categoria+nível, montado uma vez por instância.
const BY_BUCKET = {};
for (const [cat, list] of Object.entries(FILES)) {
  for (const q of list) {
    const key = `${cat}_${q.level}`;
    (BY_BUCKET[key] || (BY_BUCKET[key] = [])).push(q);
  }
}

const staticPool = (cat, level) => BY_BUCKET[`${cat}_${level}`] || [];
const allStatic = () => Object.values(FILES).flat();

module.exports = { staticPool, allStatic, FILES };
